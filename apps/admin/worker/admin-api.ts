import { z } from "zod";

import {
  dogInputSchema as dogSchema,
  dogUpdateSchema,
  recyclePointInputSchema as recycleSchema,
  recyclePointUpdateSchema as recycleUpdateSchema,
} from "../shared/entities";
import { decryptDataBatch } from "../../../workers/shared/api/_lib/encryption";
import {
  createFirestoreClient,
  FirestoreRestError,
  type FirestoreDocument,
} from "../../../workers/shared/api/_lib/firestore";
import { updateDogFeed } from "../../../workers/shared/api/dogs/feed";
import {
  saveDogTombstone,
  type DogTombstone,
  type DogTombstoneInput,
} from "../../../workers/shared/api/dogs/tombstone";
import type { AccessIdentity } from "./access";
import {
  listAdminAuditEvents,
  recordAdminAuditEvent,
  type AdminAuditAction,
  type AdminAuditEvent,
  type AdminAuditEventInput,
} from "./audit";
import {
  CloudinaryUploadError,
  deleteCloudinaryImage,
  uploadCloudinaryImage,
  type UploadedDogImage,
} from "./cloudinary";
import {
  listSystemKeys,
  rotateSystemKey,
  type RotatedSystemKey,
  type SystemKeyMetadata,
} from "./system-keys";
import {
  deleteAdminNotification,
  getAdminNotification,
  notificationInputSchema,
  saveAdminNotification,
  type AdminNotification,
  type NotificationInput,
} from "./notifications";

const MAX_BODY_BYTES = 256 * 1024;
const MANAGED_COLLECTIONS = {
  adoptions: "adoption_application",
  dogs: "dogs",
  recycle: "recycle_points",
} as const;

const httpsUrl = z.string().url().refine((value) => value.startsWith("https://"));
const adoptionStatusSchema = z.object({ status: z.enum(["approved", "rejected"]) });
const imageDeleteSchema = z.object({ imageUrl: httpsUrl });

type StoredAdoption = {
  sensitive?: unknown;
  keyVersion?: unknown;
  [key: string]: unknown;
};

function jsonResponse(status: number, body: unknown): Response {
  return Response.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function methodNotAllowed(allowed: string[]): Response {
  return new Response(null, {
    status: 405,
    headers: { Allow: allowed.join(", "), "Cache-Control": "no-store" },
  });
}

function assertSameOrigin(request: Request): void {
  if (["GET", "HEAD", "OPTIONS"].includes(request.method)) return;
  const origin = request.headers.get("Origin");
  if (!origin || origin !== new URL(request.url).origin) {
    throw new ApiError(403, "Cross-origin state change rejected.");
  }
}

async function parseJson(request: Request): Promise<unknown> {
  if (!request.headers.get("Content-Type")?.toLowerCase().startsWith("application/json")) {
    throw new ApiError(415, "Content-Type must be application/json.");
  }
  const declaredLength = Number(request.headers.get("Content-Length") ?? 0);
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
    throw new ApiError(413, "Request body is too large.");
  }
  const body = await request.text();
  if (new TextEncoder().encode(body).byteLength > MAX_BODY_BYTES) {
    throw new ApiError(413, "Request body is too large.");
  }
  try {
    return JSON.parse(body) as unknown;
  } catch {
    throw new ApiError(400, "Request body is not valid JSON.");
  }
}

class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

function requireDeveloper(identity: AccessIdentity): void {
  if (identity.role !== "developer") {
    throw new ApiError(403, "Developer access required.");
  }
}

export interface AdminApiDependencies {
  listAdoptionApplications(env: Env): Promise<Record<string, unknown>[]>;
  getAdoptionApplication(env: Env, id: string): Promise<Record<string, unknown>>;
  consumeUploadRateLimit(env: Env, identity: AccessIdentity): Promise<boolean>;
  listSystemKeys(env: Env): Promise<SystemKeyMetadata[]>;
  rotateSystemKey(env: Env, identity: AccessIdentity): Promise<RotatedSystemKey>;
  getAdminNotification(env: Env): Promise<AdminNotification | null>;
  saveAdminNotification(
    env: Env,
    input: NotificationInput,
    identity: AccessIdentity,
  ): Promise<AdminNotification>;
  deleteAdminNotification(env: Env, identity: AccessIdentity): Promise<void>;
  listAdminAuditEvents(env: Env): Promise<AdminAuditEvent[]>;
  recordAdminAuditEvent(env: Env, input: AdminAuditEventInput): Promise<void>;
  uploadCloudinaryImage(request: Request, env: Env): Promise<UploadedDogImage>;
  saveDogTombstone(env: Env, input: DogTombstoneInput): Promise<DogTombstone>;
}

async function consumeUploadRateLimit(
  env: Env,
  identity: AccessIdentity,
): Promise<boolean> {
  const rateLimiter = env.UPLOAD_RATE_LIMITER;
  if (!rateLimiter) {
    throw new Error("UPLOAD_RATE_LIMITER is not configured.");
  }
  const result = await rateLimiter.limit({
    key: `admin-media:${identity.subject}`,
  });
  return result.success;
}

const productionDependencies: AdminApiDependencies = {
  listAdoptionApplications: listAdoptions,
  getAdoptionApplication: getAdoption,
  consumeUploadRateLimit,
  listSystemKeys,
  rotateSystemKey,
  getAdminNotification,
  saveAdminNotification,
  deleteAdminNotification,
  listAdminAuditEvents,
  recordAdminAuditEvent,
  uploadCloudinaryImage,
  saveDogTombstone,
};

interface AuditDescriptor {
  action: AdminAuditAction;
  method: AdminAuditEventInput["method"];
  target: string;
}

function safeAuditId(value: string | undefined): string {
  return value && /^[A-Za-z0-9_-]{1,128}$/.test(value) ? value : "invalid";
}

function describeAuditedMutation(request: Request): AuditDescriptor | null {
  if (!["POST", "PUT", "PATCH", "DELETE"].includes(request.method)) return null;
  const method = request.method as AuditDescriptor["method"];
  const { pathname } = new URL(request.url);
  const segments = pathname.split("/").filter(Boolean);

  if (pathname === "/api/admin/dogs" && method === "POST") {
    return { action: "dog.created", method, target: "dogs" };
  }
  if (segments[2] === "dogs" && segments.length === 4) {
    const target = `dogs/${safeAuditId(segments[3])}`;
    if (method === "PATCH") return { action: "dog.updated", method, target };
    if (method === "DELETE") return { action: "dog.deleted", method, target };
  }
  if (pathname === "/api/admin/recycle-points" && method === "POST") {
    return { action: "recycle-point.created", method, target: "recycle_points" };
  }
  if (segments[2] === "recycle-points" && segments.length === 4) {
    const target = `recycle_points/${safeAuditId(segments[3])}`;
    if (method === "PATCH") {
      return { action: "recycle-point.updated", method, target };
    }
    if (method === "DELETE") {
      return { action: "recycle-point.deleted", method, target };
    }
  }
  if (
    segments[2] === "adoptions" &&
    segments[4] === "status" &&
    segments.length === 5 &&
    method === "PATCH"
  ) {
    return {
      action: "adoption.status.updated",
      method,
      target: `adoption_application/${safeAuditId(segments[3])}`,
    };
  }
  if (pathname === "/api/admin/system-keys/rotate" && method === "POST") {
    return { action: "system-key.rotated", method, target: "system/keys" };
  }
  if (pathname === "/api/admin/notifications") {
    if (method === "PUT") {
      return { action: "notification.saved", method, target: "system/notifications" };
    }
    if (method === "DELETE") {
      return { action: "notification.deleted", method, target: "system/notifications" };
    }
  }
  if (pathname === "/api/admin/media/upload" && method === "POST") {
    return { action: "media.uploaded", method, target: "cloudinary/dogs" };
  }
  if (pathname === "/api/admin/media/delete" && method === "POST") {
    return { action: "media.deleted", method, target: "cloudinary/dogs" };
  }

  return null;
}

function requestAuditId(request: Request): string {
  const rayId = request.headers.get("Cf-Ray")?.trim();
  return rayId && /^[A-Za-z0-9:-]{1,128}$/.test(rayId)
    ? rayId
    : crypto.randomUUID();
}

async function scheduleAuditRecord(
  request: Request,
  identity: AccessIdentity,
  descriptor: AuditDescriptor,
  response: Response,
  startedAt: number,
  env: Env,
  dependencies: AdminApiDependencies,
  executionContext?: Pick<ExecutionContext, "waitUntil">,
): Promise<void> {
  const outcome = response.status >= 500
    ? "failure"
    : response.status >= 400
      ? "rejected"
      : "success";
  const auditPromise = dependencies.recordAdminAuditEvent(env, {
    action: descriptor.action,
    actor: identity.email,
    actorRole: identity.role,
    durationMs: Date.now() - startedAt,
    method: descriptor.method,
    outcome,
    path: new URL(request.url).pathname,
    requestId: requestAuditId(request),
    status: response.status,
    target: descriptor.target,
  }).catch((error: unknown) => {
    console.error(JSON.stringify({
      event: "admin.audit.failed",
      action: descriptor.action,
      actor: identity.email,
      message: error instanceof Error ? error.message : "Unknown failure",
    }));
  });

  if (executionContext) {
    executionContext.waitUntil(auditPromise);
  } else {
    await auditPromise;
  }
}

function numericDogId(value: string): number {
  if (!/^\d{1,16}$/.test(value)) throw new ApiError(400, "Invalid dog ID.");
  const id = Number(value);
  if (!Number.isSafeInteger(id)) throw new ApiError(400, "Invalid dog ID.");
  return id;
}

function documentId(value: string): string {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(value)) {
    throw new ApiError(400, "Invalid document ID.");
  }
  return value;
}

async function serializeAdoptions(
  documents: FirestoreDocument<StoredAdoption>[],
  env: Env,
): Promise<Record<string, unknown>[]> {
  const encryptedDocuments = documents.filter(
    (document) =>
      typeof document.data.sensitive === "string" &&
      typeof document.data.keyVersion === "string",
  );
  const decrypted = await decryptDataBatch(
    encryptedDocuments.map((document) => ({
      encryptedData: document.data.sensitive as string,
      keyVersion: document.data.keyVersion as string,
    })),
    env,
  );
  const decryptedByName = new Map(
    encryptedDocuments.map((document, index) => [document.name, decrypted[index]]),
  );

  return documents.map((document) => {
    const publicData = { ...document.data };
    delete publicData.sensitive;
    delete publicData.keyVersion;
    return { id: document.id, ...publicData, ...decryptedByName.get(document.name) };
  });
}

async function listAdoptions(env: Env): Promise<Record<string, unknown>[]> {
  const documents = await createFirestoreClient(env).listDocuments<StoredAdoption>(
    MANAGED_COLLECTIONS.adoptions,
    {
      direction: "DESCENDING",
      orderBy: "submittedAt",
    },
  );
  const adoptions = await serializeAdoptions(documents, env);

  return adoptions.map((adoption) => ({
    id: adoption.id,
    nome_adotante: adoption.nome_adotante,
    telefone: adoption.telefone,
    animal_especifico: adoption.animal_especifico,
    status: adoption.status,
    submittedAt: adoption.submittedAt,
    expiresAt: adoption.expiresAt,
  }));
}

async function getAdoption(env: Env, id: string): Promise<Record<string, unknown>> {
  const document = await createFirestoreClient(env).getDocument<StoredAdoption>(
    `${MANAGED_COLLECTIONS.adoptions}/${id}`,
  );
  if (!document) throw new ApiError(404, "Adoption application not found.");

  const [adoption] = await serializeAdoptions([document], env);
  if (!adoption) throw new ApiError(404, "Adoption application not found.");
  return adoption;
}

function serializeDocuments<T extends Record<string, unknown>>(
  documents: FirestoreDocument<T>[],
): Array<T & { documentId: string }> {
  return documents.map((document) => ({ documentId: document.id, ...document.data }));
}

function scheduleDogFeedUpdate(
  env: Env,
  executionContext?: Pick<ExecutionContext, "waitUntil">,
): void {
  if (!executionContext) return;
  executionContext.waitUntil(
    updateDogFeed(env).catch((error: unknown) => {
      console.error(JSON.stringify({
        event: "admin.dogs-feed.refresh.failed",
        message: error instanceof Error ? error.message : "Unknown failure",
      }));
    }),
  );
}

async function cleanupDogPhotos(
  photos: string[],
  env: Env,
  dogId: number,
): Promise<void> {
  const deletions = await Promise.allSettled(
    photos.map((photo) => deleteCloudinaryImage(photo, env)),
  );
  if (deletions.some((result) => result.status === "rejected")) {
    console.warn(JSON.stringify({ event: "admin.media.cleanup.partial", dogId }));
  }
}

async function handleDogs(
  request: Request,
  env: Env,
  pathId?: string,
  executionContext?: Pick<ExecutionContext, "waitUntil">,
  persistDogTombstone: AdminApiDependencies["saveDogTombstone"] = saveDogTombstone,
): Promise<Response> {
  const firestore = createFirestoreClient(env);
  if (!pathId) {
    if (request.method === "GET") {
      return jsonResponse(200, serializeDocuments(await firestore.listDocuments("dogs")));
    }
    if (request.method === "POST") {
      const dog = dogSchema.parse(await parseJson(request));
      const id = Date.now();
      await firestore.createDocument("dogs", { ...dog, id });
      scheduleDogFeedUpdate(env, executionContext);
      return jsonResponse(201, { id });
    }
    return methodNotAllowed(["GET", "POST"]);
  }

  const id = numericDogId(pathId);
  const parsedUpdate = request.method === "PATCH"
    ? dogUpdateSchema.parse(await parseJson(request))
    : null;
  const document = await firestore.findFirstDocumentByField<{
    fotos?: unknown;
    nome?: unknown;
  }>("dogs", "id", id);
  if (!document) throw new ApiError(404, "Dog not found.");

  if (request.method === "GET") return jsonResponse(200, { id, ...document.data });
  if (request.method === "PATCH") {
    if (!parsedUpdate) throw new ApiError(400, "Invalid request");
    const update = parsedUpdate;
    await firestore.updateDocument(document.name, update);
    scheduleDogFeedUpdate(env, executionContext);
    if (update.fotos) {
      const previousPhotos = Array.isArray(document.data.fotos)
        ? document.data.fotos.filter((photo): photo is string => typeof photo === "string")
        : [];
      const removedPhotos = previousPhotos.filter((photo) => !update.fotos?.includes(photo));
      const deletions = await Promise.allSettled(
        removedPhotos.map((photo) => deleteCloudinaryImage(photo, env)),
      );
      if (deletions.some((result) => result.status === "rejected")) {
        console.warn(JSON.stringify({ event: "admin.media.cleanup.partial", dogId: id }));
      }
    }
    return jsonResponse(200, { ok: true });
  }
  if (request.method === "DELETE") {
    const adoptedViaSite = new URL(request.url).searchParams.get("adoptedViaSite") === "true";
    const photos = Array.isArray(document.data.fotos)
      ? document.data.fotos.filter((photo): photo is string => typeof photo === "string")
      : [];
    await persistDogTombstone(env, {
      id: document.id,
      nome:
        typeof document.data.nome === "string" && document.data.nome.trim()
          ? document.data.nome
          : "Cão",
      status: adoptedViaSite ? "adopted" : "unavailable",
      removedAt: new Date().toISOString(),
    });
    if (adoptedViaSite) {
      await firestore.deleteDocumentAndIncrementField(
        document.name,
        "system/statistics",
        "adoptionsCount",
        1,
      );
    } else {
      await firestore.deleteDocument(document.name);
    }
    const cleanup = cleanupDogPhotos(photos, env, id);
    if (executionContext) {
      executionContext.waitUntil(cleanup);
    } else {
      await cleanup;
    }
    scheduleDogFeedUpdate(env, executionContext);
    return new Response(null, { status: 204 });
  }
  return methodNotAllowed(["GET", "PATCH", "DELETE"]);
}

async function handleRecycle(request: Request, env: Env, pathId?: string): Promise<Response> {
  const firestore = createFirestoreClient(env);
  if (!pathId) {
    if (request.method === "GET") {
      const documents = await firestore.listDocuments("recycle_points");
      return jsonResponse(200, documents.map((document) => ({ id: document.id, ...document.data })));
    }
    if (request.method === "POST") {
      const point = recycleSchema.parse(await parseJson(request));
      const result = await firestore.createDocument("recycle_points", point);
      return jsonResponse(201, { id: result.id });
    }
    return methodNotAllowed(["GET", "POST"]);
  }

  const id = documentId(pathId);
  const document = await firestore.getDocument(`recycle_points/${id}`);
  if (!document) throw new ApiError(404, "Recycle point not found.");
  if (request.method === "GET") return jsonResponse(200, { id, ...document.data });
  if (request.method === "PATCH") {
    await firestore.updateDocument(document.name, recycleUpdateSchema.parse(await parseJson(request)));
    return jsonResponse(200, { ok: true });
  }
  if (request.method === "DELETE") {
    await firestore.deleteDocument(document.name);
    return new Response(null, { status: 204 });
  }
  return methodNotAllowed(["GET", "PATCH", "DELETE"]);
}

async function handleDashboard(
  env: Env,
  dependencies: AdminApiDependencies,
): Promise<Response> {
  const firestore = createFirestoreClient(env);
  const now = new Date();
  const alertWindowEnd = new Date(now.getTime() + 5 * 86_400_000);
  const [dogs, recycles, adoptions, expiringDocuments, statistics, notification] =
    await Promise.all([
      firestore.countDocuments(MANAGED_COLLECTIONS.dogs),
      firestore.countDocuments(MANAGED_COLLECTIONS.recycle),
      firestore.countDocuments(MANAGED_COLLECTIONS.adoptions),
      firestore.findDocumentsByTimestampRange<StoredAdoption>(
        MANAGED_COLLECTIONS.adoptions,
        "expiresAt",
        now,
        alertWindowEnd,
      ),
      firestore.getDocument<{ adoptionsCount?: unknown }>("system/statistics"),
      dependencies.getAdminNotification(env),
    ]);
  const expiring = await serializeAdoptions(expiringDocuments, env);
  const expiringAdoptions = expiring.flatMap((adoption) => {
    if (typeof adoption.expiresAt !== "string") return [];
    const expiresAt = Date.parse(adoption.expiresAt);
    if (!Number.isFinite(expiresAt)) return [];
    const daysLeft = Math.max(0, Math.ceil((expiresAt - now.getTime()) / 86_400_000));
    return [{
      id: String(adoption.id),
      nome: typeof adoption.nome_adotante === "string" ? adoption.nome_adotante : "Candidato",
      daysLeft,
    }];
  }).sort((left, right) => left.daysLeft - right.daysLeft);

  return jsonResponse(200, {
    metrics: {
      dogs,
      recycles,
      adoptions,
      adoptionsViaSite:
        typeof statistics?.data.adoptionsCount === "number"
          ? statistics.data.adoptionsCount
          : 0,
    },
    expiringAdoptions,
    notification,
  });
}

async function routeAdminApi(
  request: Request,
  env: Env,
  identity: AccessIdentity,
  dependencies: AdminApiDependencies = productionDependencies,
  executionContext?: Pick<ExecutionContext, "waitUntil">,
): Promise<Response> {
  try {
    assertSameOrigin(request);
    const url = new URL(request.url);
    const segments = url.pathname.split("/").filter(Boolean);

    if (url.pathname === "/api/admin/dashboard" && request.method === "GET") {
      return handleDashboard(env, dependencies);
    }
    if (url.pathname === "/api/admin/adoptions" && request.method === "GET") {
      return jsonResponse(200, await dependencies.listAdoptionApplications(env));
    }
    if (segments[2] === "adoptions" && segments.length === 4) {
      if (request.method !== "GET") return methodNotAllowed(["GET"]);
      const id = documentId(segments[3] ?? "");
      return jsonResponse(200, await dependencies.getAdoptionApplication(env, id));
    }
    if (url.pathname === "/api/admin/audit-log") {
      requireDeveloper(identity);
      if (request.method !== "GET") return methodNotAllowed(["GET"]);
      return jsonResponse(200, await dependencies.listAdminAuditEvents(env));
    }
    if (url.pathname === "/api/admin/system-keys") {
      requireDeveloper(identity);
      if (request.method !== "GET") return methodNotAllowed(["GET"]);
      return jsonResponse(200, await dependencies.listSystemKeys(env));
    }
    if (url.pathname === "/api/admin/system-keys/rotate") {
      requireDeveloper(identity);
      if (request.method !== "POST") return methodNotAllowed(["POST"]);
      return jsonResponse(201, await dependencies.rotateSystemKey(env, identity));
    }
    if (url.pathname === "/api/admin/notifications") {
      if (request.method === "GET") {
        return jsonResponse(200, await dependencies.getAdminNotification(env));
      }
      if (request.method === "PUT") {
        requireDeveloper(identity);
        const input = notificationInputSchema.parse(await parseJson(request));
        return jsonResponse(
          200,
          await dependencies.saveAdminNotification(env, input, identity),
        );
      }
      if (request.method === "DELETE") {
        requireDeveloper(identity);
        await dependencies.deleteAdminNotification(env, identity);
        return new Response(null, {
          status: 204,
          headers: { "Cache-Control": "no-store" },
        });
      }
      return methodNotAllowed(["GET", "PUT", "DELETE"]);
    }
    if (segments[2] === "adoptions" && segments[4] === "status" && segments.length === 5) {
      if (request.method !== "PATCH") return methodNotAllowed(["PATCH"]);
      const id = documentId(segments[3] ?? "");
      const document = await createFirestoreClient(env).getDocument(`adoption_application/${id}`);
      if (!document) throw new ApiError(404, "Adoption application not found.");
      const { status } = adoptionStatusSchema.parse(await parseJson(request));
      await createFirestoreClient(env).updateDocument(document.name, { status });
      return jsonResponse(200, { ok: true });
    }
    if (segments[2] === "dogs" && segments.length <= 4) {
      return await handleDogs(
        request,
        env,
        segments[3],
        executionContext,
        dependencies.saveDogTombstone,
      );
    }
    if (segments[2] === "recycle-points" && segments.length <= 4) {
      return await handleRecycle(request, env, segments[3]);
    }
    if (url.pathname === "/api/admin/media/upload") {
      if (request.method !== "POST") return methodNotAllowed(["POST"]);
      if (!await dependencies.consumeUploadRateLimit(env, identity)) {
        const response = jsonResponse(429, {
          error: "Limite de uploads excedido. Aguarde um minuto.",
        });
        response.headers.set("Retry-After", "60");
        return response;
      }
      return jsonResponse(
        201,
        await dependencies.uploadCloudinaryImage(request, env),
      );
    }
    if (url.pathname === "/api/admin/media/delete") {
      if (request.method !== "POST") return methodNotAllowed(["POST"]);
      const { imageUrl } = imageDeleteSchema.parse(await parseJson(request));
      await deleteCloudinaryImage(imageUrl, env);
      return jsonResponse(200, { ok: true });
    }
    return jsonResponse(404, { error: "Not found" });
  } catch (error) {
    if (error instanceof z.ZodError) {
      const dogCollectionLimitIssue = error.issues.find(
        (issue) =>
          (issue.path[0] === "fotos" || issue.path[0] === "tags")
          && issue.code === "too_big",
      );
      return jsonResponse(400, {
        error: dogCollectionLimitIssue?.message
          ?? error.issues[0]?.message
          ?? "Invalid request",
        issues: error.issues,
      });
    }
    if (error instanceof ApiError) return jsonResponse(error.status, { error: error.message });
    if (error instanceof CloudinaryUploadError) {
      return jsonResponse(error.status, { error: error.message });
    }
    if (error instanceof FirestoreRestError && error.status === 404) {
      return jsonResponse(404, { error: "Document not found" });
    }
    console.error(JSON.stringify({
      event: "admin.api.error",
      message: error instanceof Error ? error.message : "Unknown failure",
    }));
    return jsonResponse(500, { error: "Internal server error" });
  }
}

export async function handleAdminApi(
  request: Request,
  env: Env,
  identity: AccessIdentity,
  dependencies: AdminApiDependencies = productionDependencies,
  executionContext?: Pick<ExecutionContext, "waitUntil">,
): Promise<Response> {
  const startedAt = Date.now();
  const auditDescriptor = describeAuditedMutation(request);
  const response = await routeAdminApi(
    request,
    env,
    identity,
    dependencies,
    executionContext,
  );

  if (auditDescriptor) {
    await scheduleAuditRecord(
      request,
      identity,
      auditDescriptor,
      response,
      startedAt,
      env,
      dependencies,
      executionContext,
    );
  }

  return response;
}
