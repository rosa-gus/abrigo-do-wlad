import { errorCause, logApiFailure, normalizeApiResponse, observeOperation, operationalErrorResponse, requestIdFor, requestRouteForLog } from "./api-errors";
import { z } from "zod";
import { processDogPublicationOutbox } from "../../../workers/shared/api/dogs/publication-outbox";
import type { FirestoreRestClient } from "../../../workers/shared/api/_lib/firestore";
import { readJsonBodyWithLimit, RequestBodyTooLargeError } from "../../../workers/shared/api/_lib/body";
import { uploadManagedMedia } from "./media-upload";
import { createFirestoreDocumentId } from "../../../workers/shared/api/_lib/firestore";
import { resolveAdminDog, DogIdentityError, inventoryLegacyDogIds } from "./dog-identity";
import { commitDogMediaMutation, registerUploadedMedia, deleteManagedMedia, MediaAssetError } from "./media-assets";
import { serializeReadableAdoptions, requireReadableAdoption, AdoptionUnavailableError } from "./adoption-access";
import { assertRevision, expectedRevision, RevisionError, withRevision } from "./revision";
import { DOG_DOCUMENT_SCHEMA_VERSION, RECYCLE_POINT_DOCUMENT_SCHEMA_VERSION, supportsDocumentVersion } from "../../../workers/shared/document-schema";
import { isPublished, publicationMetadata } from "../../../workers/shared/publication";
import { systemSettingsSchema } from "../shared/system-settings";
import { adoptionStatusUpdate, AdoptionTransitionError } from "../shared/adoption-retention";

import {
  dogInputSchema as dogSchema,
  dogUpdateSchema,
  recyclePointInputSchema as recycleSchema,
  recyclePointUpdateSchema as recycleUpdateSchema,
} from "../shared/entities";
import { decryptDataBatch } from "../../../workers/shared/api/_lib/encryption";
import {
  createFirestoreClient,
  FirestoreCursorError,
  type FirestoreQueryFilter,
  type FirestoreDocument,
} from "../../../workers/shared/api/_lib/firestore";
import { updateHeroDog } from "../../../workers/shared/api/hero-dog/update";
import { dogArchiveDates, isDogArchived } from "../../../workers/shared/api/dogs/archive";
import {
  deleteDogTombstone,
  saveDogTombstone,
  type DogTombstone,
  type DogTombstoneInput,
} from "../../../workers/shared/api/dogs/tombstone";
import type { AccessIdentity } from "./access";
import { handleMigrations } from "./migrations";
import {
  listAdminAuditEvents,
  recordAdminAuditEvent,
  createAuditedFirestoreClient,
  type AdminAuditAction,
  type AdminAuditEvent,
  type AdminAuditEventInput,
} from "./audit";
import {
  CloudinaryUploadError,
  type UploadedDogImage,
} from "./cloudinary";
import {
  listSystemKeys,
  listSystemKeysState,
  rotateSystemKey,
  type RotatedSystemKey,
  type SystemKeyMetadata,
} from "./system-keys";
import {
  deleteAdminNotification,
  getAdminNotification,
  getAdminNotificationState,
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
const adoptionStatusSchema = z.object({ status: z.enum(["pending", "approved", "rejected"]) });
const imageDeleteSchema = z.object({ imageUrl: httpsUrl });
const archiveDogSchema = z.object({ reason: z.enum(["adopted_via_site", "other"]) });

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
  try {
    return await readJsonBodyWithLimit(request, MAX_BODY_BYTES);
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) throw new ApiError(413, "Request body is too large.");
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
  listAdoptionApplications(env: Env, request?: Request): Promise<Record<string, unknown>[] | { items: Record<string, unknown>[]; nextCursor: string | null }>;
  getAdoptionApplication(env: Env, id: string): Promise<Record<string, unknown>>;
  consumeUploadRateLimit(env: Env, identity: AccessIdentity): Promise<boolean>;
  listSystemKeys(env: Env): Promise<SystemKeyMetadata[]>;
  listSystemKeysState?(env: Env): Promise<{ value: SystemKeyMetadata[]; revision: string | undefined }>;
  rotateSystemKey(env: Env, identity: AccessIdentity, expected?: string, repository?: FirestoreRestClient): Promise<RotatedSystemKey>;
  getAdminNotification(env: Env): Promise<AdminNotification | null>;
  getAdminNotificationState?(env: Env): Promise<{ value: AdminNotification | null; revision: string | undefined }>;
  saveAdminNotification(
    env: Env,
    input: NotificationInput,
    identity: AccessIdentity,
    now?: Date,
    expected?: string,
    repository?: FirestoreRestClient,
  ): Promise<AdminNotification>;
  deleteAdminNotification(env: Env, identity: AccessIdentity, expected?: string, repository?: FirestoreRestClient): Promise<void>;
  listAdminAuditEvents(env: Env): Promise<AdminAuditEvent[]>;
  recordAdminAuditEvent(env: Env, input: AdminAuditEventInput): Promise<void>;
  uploadCloudinaryImage(request: Request, env: Env, context?: { actorSubject: string; actorRole: AccessIdentity["role"]; requestId: string }): Promise<UploadedDogImage>;
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
  listSystemKeysState,
  rotateSystemKey,
  getAdminNotification,
  getAdminNotificationState,
  saveAdminNotification,
  deleteAdminNotification,
  listAdminAuditEvents,
  recordAdminAuditEvent,
  uploadCloudinaryImage: uploadManagedMedia,
  saveDogTombstone,
};

interface AuditDescriptor {
  action: AdminAuditAction;
  method: AdminAuditEventInput["method"];
  target: string;
}

function safeAuditId(value: string | undefined): string {
  if (!value) return "invalid";
  try {
    const decoded = decodeURIComponent(value);
    const id = decoded.startsWith("doc:") ? decoded.slice(4) : decoded;
    return /^[A-Za-z0-9_-]{1,128}$/.test(id) ? id : "invalid";
  } catch { return "invalid"; }
}

function describeAuditedMutation(request: Request): AuditDescriptor | null {
  if (!["POST", "PUT", "PATCH", "DELETE"].includes(request.method)) return null;
  const method = request.method as AuditDescriptor["method"];
  const { pathname } = new URL(request.url);
  const segments = pathname.split("/").filter(Boolean);

  if (pathname === "/api/admin/system/settings" && method === "PATCH") {
    return { action: "adoption.availability.updated", method, target: "system/settings" };
  }

  if (segments[2] === "dogs" && segments.length === 3 && method === "POST") {
    return { action: "dog.created", method, target: "dogs" };
  }
  if (segments[2] === "dogs" && segments.length === 4) {
    const target = `dogs/${safeAuditId(segments[3])}`;
    if (method === "PATCH") return { action: "dog.updated", method, target };
    if (method === "DELETE") return { action: "dog.deleted", method, target };
  }
  if (segments[2] === "dogs" && segments.length === 5 && method === "POST") {
    const target = `dogs/${safeAuditId(segments[3])}`;
    if (segments[4] === "archive") return { action: "dog.archived", method, target };
    if (segments[4] === "restore") return { action: "dog.restored", method, target };
  }
  if (segments[2] === "recycle-points" && segments.length === 3 && method === "POST") {
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
  if (pathname === "/api/admin/migrations/apply" && method === "POST") {
    return { action: "migration.batch.applied", method, target: "_migrations" };
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

function requestFirestore(request: Request, env: Env, identity: AccessIdentity): FirestoreRestClient {
  const descriptor = describeAuditedMutation(request);
  if (!descriptor) return createFirestoreClient(env);
  return createAuditedFirestoreClient(env, {
    ...descriptor, actor: identity.email, actorSubject: identity.subject,
    actorRole: identity.role, path: new URL(request.url).pathname,
    requestId: request.headers.get("X-Request-ID") ?? crypto.randomUUID(),
  });
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
    actorSubject: identity.subject,
    phase: "response",
    actorRole: identity.role,
    durationMs: Date.now() - startedAt,
    method: descriptor.method,
    outcome,
    path: new URL(request.url).pathname,
    requestId: request.headers.get("X-Request-ID") ?? requestIdFor(request),
    status: response.status,
    target: descriptor.target,
  }).catch((error: unknown) => {
    logApiFailure("admin.audit.failed", request.headers.get("X-Request-ID")!, error);
  });

  if (executionContext) {
    executionContext.waitUntil(auditPromise);
  } else {
    await auditPromise;
  }
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
  return serializeReadableAdoptions(documents, async (documents) => {
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
      return { ...publicData, ...decryptedByName.get(document.name), id: document.id, revision: document.updateTime };
    });
  });
}

function pageOptions(request?: Request) {
  const params = request ? new URL(request.url).searchParams : new URLSearchParams();
  const rawLimit = params.get("limit");
  const limit = rawLimit === null ? 25 : Number(rawLimit);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100 || (rawLimit !== null && !/^[1-9][0-9]*$/.test(rawLimit))) {
    throw new ApiError(400, "Page size must be between 1 and 100.");
  }
  const cursor = params.get("cursor") ?? undefined;
  const publication = params.get("publicationStatus");
  if (publication && !["draft", "published"].includes(publication)) throw new ApiError(400, "Invalid publication filter.");
  return { limit, cursor, publication };
}

async function listAdoptions(env: Env, request?: Request) {
  const { limit, cursor } = pageOptions(request);
  const status = request ? new URL(request.url).searchParams.get("status") : null;
  if (status && !["pending", "approved", "rejected"].includes(status)) throw new ApiError(400, "Invalid adoption status filter.");
  const filters: FirestoreQueryFilter[] = [{ fieldPath: "expiresAt", op: "GREATER_THAN", value: new Date() }];
  if (status) filters.push({ fieldPath: "status", op: "EQUAL", value: status });
  const page = await createFirestoreClient(env).pageDocuments<StoredAdoption>(MANAGED_COLLECTIONS.adoptions, {
    limit, cursor, filters, orderBy: "expiresAt", movingTimestampCutoff: true,
  });
  let adoptions;
  try { adoptions = await serializeAdoptions(page.items, env); }
  catch {
    console.error(JSON.stringify({ event: "admin.adoption.page-decryption.failed", count: page.items.length }));
    throw new ApiError(500, "Unable to read this page of adoption applications.");
  }
  return { items: adoptions.map((adoption) => ({
    id: adoption.id, revision: adoption.revision, nome_adotante: adoption.nome_adotante,
    telefone: adoption.telefone, animal_especifico: adoption.animal_especifico,
    status: adoption.status, submittedAt: adoption.submittedAt, expiresAt: adoption.expiresAt,
  })), nextCursor: page.nextCursor };
}

async function getAdoption(env: Env, id: string): Promise<Record<string, unknown>> {
  const document = await createFirestoreClient(env).getDocument<StoredAdoption>(
    `${MANAGED_COLLECTIONS.adoptions}/${id}`,
  );
  const [adoption] = await serializeAdoptions([requireReadableAdoption(document)], env);
  if (!adoption) throw new ApiError(404, "Adoption application not found.");
  return adoption;
}

const DOG_LIST_FIELDS = ["id", "nome", "idade", "cateIdade", "sexo", "temperamento", "tags", "status", "fotos", "cor", "instaLink", "descricaoCompleta", "publicationStatus", "archivedAt", "purgeAfter", "archiveReason", "archivedBy", "adoptionCountedAt", "retainedPhotos", "schemaVersion", "updatedAt", "publishedAt"];
const RECYCLE_LIST_FIELDS = ["zone", "neighborhood", "name", "address", "googleMapsUrl", "publicationStatus", "schemaVersion", "updatedAt", "publishedAt"];
function listDto(document: FirestoreDocument<Record<string, unknown>>, fields: string[]) {
  return Object.fromEntries(fields.filter(field => Object.hasOwn(document.data, field)).map(field => [field, document.data[field]]));
}

function scheduleDogFeedUpdate(
  env: Env,
  executionContext?: Pick<ExecutionContext, "waitUntil">,
): void {
  if (!executionContext) return;
  executionContext.waitUntil(
    processDogPublicationOutbox(env).catch((error: unknown) => {
      console.error(JSON.stringify({
        event: "admin.dogs-feed.refresh.failed",
        message: error instanceof Error ? error.message : "Unknown failure",
      }));
    }),
  );
}

function scheduleHeroDogUpdate(
  env: Env,
  executionContext?: Pick<ExecutionContext, "waitUntil">,
): void {
  if (!executionContext) return;
  executionContext.waitUntil(updateHeroDog(env).then((result) => {
    if (result.status >= 400) {
      console.error(JSON.stringify({ event: "admin.hero-dog.refresh.failed", status: result.status }));
    }
  }));
}

async function tryDogProjection(work: () => Promise<unknown>): Promise<void> {
  try { await work(); }
  catch { console.warn(JSON.stringify({ event: "admin.dog.publication.pending" })); }
}

async function handleDogs(
  request: Request,
  env: Env,
  pathId?: string,
  executionContext?: Pick<ExecutionContext, "waitUntil">,
  persistDogTombstone: AdminApiDependencies["saveDogTombstone"] = saveDogTombstone,
  identity?: AccessIdentity,
  operation?: "archive" | "restore",
): Promise<Response> {
  const firestore = identity ? requestFirestore(request, env, identity) : createFirestoreClient(env);
  if (!pathId) {
    if (request.method === "GET") {
      const state = new URL(request.url).searchParams.get("state") ?? "active";
      if (state !== "active" && state !== "archived") {
        throw new ApiError(400, "Invalid dog list state.");
      }
      const { limit, cursor, publication } = pageOptions(request);
      const page = await firestore.pageDocuments<Record<string, unknown>>("dogs", {
        limit, cursor, scope: state,
        filters: publication ? [{ fieldPath: "publicationStatus", op: "EQUAL", value: publication }] : [],
      });
      return jsonResponse(200, { items: page.items.filter(document => isDogArchived(document.data) === (state === "archived"))
        .map(document => ({ ...listDto(document, DOG_LIST_FIELDS), documentId: document.id, revision: document.updateTime })), nextCursor: page.nextCursor });
    }
    if (request.method === "POST") {
      const dog = dogSchema.parse(await parseJson(request));
      const id = createFirestoreDocumentId();
      const result = await commitDogMediaMutation(env, { kind: "create", id, data: { ...dog, schemaVersion: DOG_DOCUMENT_SCHEMA_VERSION, ...publicationMetadata({}, dog.publicationStatus) } }, firestore);
      scheduleDogFeedUpdate(env, executionContext);
      return withRevision(jsonResponse(201, { id, documentId: id, revision: result.updateTime }), result.updateTime);
    }
    return methodNotAllowed(["GET", "POST"]);
  }

  let routeId: string;
  try { routeId = decodeURIComponent(pathId); } catch { throw new ApiError(400, "Invalid dog ID."); }
  if (operation && request.method !== "POST") return methodNotAllowed(["POST"]);
  if (!operation && !["GET", "PATCH", "DELETE"].includes(request.method)) {
    return methodNotAllowed(["GET", "PATCH", "DELETE"]);
  }
  const parsedUpdate = request.method === "PATCH"
    ? dogUpdateSchema.parse(await parseJson(request))
    : null;
  const document = await resolveAdminDog(firestore, routeId);
  if (!document) throw new ApiError(404, "Dog not found.");
  const id = document.data.id ?? document.id;

  if (request.method === "GET") return withRevision(jsonResponse(200, { ...document.data, documentId: document.id, revision: document.updateTime }), document.updateTime);
  if (!supportsDocumentVersion(document.data, DOG_DOCUMENT_SCHEMA_VERSION)) {
    throw new ApiError(409, "A ficha usa uma versão de dados mais recente ou inválida. Atualize a aplicação antes de editar.");
  }
  if (request.method === "PATCH") {
    if (isDogArchived(document.data)) throw new ApiError(409, "Archived dogs cannot be edited.");
    if (!parsedUpdate) throw new ApiError(400, "Invalid request");
    assertRevision(expectedRevision(request, parsedUpdate.expectedUpdateTime), document.updateTime);
    const merged = dogSchema.parse({ ...document.data, ...parsedUpdate });
    const update: Record<string, unknown> = {
      ...merged, ...publicationMetadata(document.data, merged.publicationStatus),
    };
    if (parsedUpdate.fotos) {
      const previousPhotos = Array.isArray(document.data.fotos)
        ? document.data.fotos.filter((photo): photo is string => typeof photo === "string")
        : [];
      const retainedPhotos = Array.isArray(document.data.retainedPhotos)
        ? document.data.retainedPhotos.filter((photo): photo is string => typeof photo === "string")
        : [];
      update.retainedPhotos = Array.from(new Set([
        ...retainedPhotos,
        ...previousPhotos.filter((photo) => !parsedUpdate.fotos?.includes(photo)),
      ]));
    }
    const saved = await commitDogMediaMutation(env, { kind: "update", document, data: update }, firestore);
    scheduleDogFeedUpdate(env, executionContext);
    return withRevision(jsonResponse(200, { ok: true, revision: saved.updateTime }), saved.updateTime);
  }
  if (request.method === "DELETE") {
    assertRevision(expectedRevision(request), document.updateTime);
    if (isDogArchived(document.data) || document.data.publicationStatus !== "draft") {
      throw new ApiError(409, "Somente rascunhos não arquivados podem ser excluídos.");
    }
    if (!document.updateTime) throw new ApiError(409, "Document version unavailable.");
    await commitDogMediaMutation(env, { kind: "delete", document }, firestore);
    await tryDogProjection(() => deleteDogTombstone(env, document.id));
    scheduleDogFeedUpdate(env, executionContext);
    scheduleHeroDogUpdate(env, executionContext);
    return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
  }
  if (operation === "archive" && request.method === "POST") {
    assertRevision(expectedRevision(request), document.updateTime);
    if (!identity) throw new ApiError(500, "Missing identity.");
    const { reason } = archiveDogSchema.parse(await parseJson(request));
    if (isDogArchived(document.data)) {
      if (document.data.archiveReason !== reason || typeof document.data.archivedAt !== "string") {
        throw new ApiError(409, "Dog is already archived.");
      }
      if (isPublished(document.data) && typeof document.data.publishedAt === "string") await tryDogProjection(() => persistDogTombstone(env, {
        id: document.id,
        nome: typeof document.data.nome === "string" && document.data.nome.trim()
          ? document.data.nome : "Cão",
        status: reason === "adopted_via_site" ? "adopted" : "unavailable",
        removedAt: document.data.archivedAt as string,
      }));
      scheduleDogFeedUpdate(env, executionContext);
      scheduleHeroDogUpdate(env, executionContext);
      return jsonResponse(200, {
        id,
        archivedAt: document.data.archivedAt,
        purgeAfter: document.data.purgeAfter,
      });
    }
    const dates = dogArchiveDates();
    const shouldCountAdoption = reason === "adopted_via_site"
      && typeof document.data.adoptionCountedAt !== "string";
    const archive = {
      ...dates,
      purgeAfter: new Date(dates.purgeAfter),
      archiveReason: reason,
      archivedBy: identity.email,
      ...(shouldCountAdoption ? { adoptionCountedAt: dates.archivedAt } : {}),
    };
    if (shouldCountAdoption) {
      await firestore.updateDocumentAndIncrementField(
        document.name, archive, "system/statistics", "adoptionsCount", 1,
        { expectedUpdateTime: document.updateTime },
      );
    } else {
      await firestore.updateDocument(document.name, archive, {
        expectedUpdateTime: document.updateTime,
      });
    }
    if (isPublished(document.data) && typeof document.data.publishedAt === "string") await tryDogProjection(() => persistDogTombstone(env, {
      id: document.id,
      nome:
        typeof document.data.nome === "string" && document.data.nome.trim()
          ? document.data.nome
          : "Cão",
      status: reason === "adopted_via_site" ? "adopted" : "unavailable",
      removedAt: dates.archivedAt,
    }));
    scheduleDogFeedUpdate(env, executionContext);
    scheduleHeroDogUpdate(env, executionContext);
    return jsonResponse(200, { ...dates, id, archiveReason: reason, archivedBy: identity.email });
  }
  if (operation === "restore" && request.method === "POST") {
    assertRevision(expectedRevision(request), document.updateTime);
    if (!isDogArchived(document.data)) {
      await tryDogProjection(() => deleteDogTombstone(env, document.id));
      scheduleDogFeedUpdate(env, executionContext);
      return jsonResponse(200, { ok: true });
    }
    await firestore.updateDocument(document.name, {
      archivedAt: null, purgeAfter: null, archiveReason: null, archivedBy: null,
      publicationStatus: "draft", updatedAt: new Date().toISOString(),
    }, { expectedUpdateTime: document.updateTime });
    await tryDogProjection(() => deleteDogTombstone(env, document.id));
    scheduleDogFeedUpdate(env, executionContext);
    return jsonResponse(200, { ok: true });
  }
  return methodNotAllowed(operation ? ["POST"] : ["GET", "PATCH"]);
}

async function handleRecycle(request: Request, env: Env, pathId?: string, identity?: AccessIdentity): Promise<Response> {
  const firestore = identity ? requestFirestore(request, env, identity) : createFirestoreClient(env);
  if (!pathId) {
    if (request.method === "GET") {
      const { limit, cursor, publication } = pageOptions(request);
      const page = await firestore.pageDocuments("recycle_points", {
        limit, cursor, filters: publication ? [{ fieldPath: "publicationStatus", op: "EQUAL", value: publication }] : [],
      });
      return jsonResponse(200, { items: page.items.map(document => ({ ...listDto(document, RECYCLE_LIST_FIELDS), id: document.id, revision: document.updateTime })), nextCursor: page.nextCursor });
    }
    if (request.method === "POST") {
      const point = recycleSchema.parse(await parseJson(request));
      const result = await firestore.createDocument("recycle_points", { ...point, schemaVersion: RECYCLE_POINT_DOCUMENT_SCHEMA_VERSION, ...publicationMetadata({}, point.publicationStatus) });
      return jsonResponse(201, { id: result.id });
    }
    return methodNotAllowed(["GET", "POST"]);
  }

  const id = documentId(pathId);
  const document = await firestore.getDocument(`recycle_points/${id}`);
  if (!document) throw new ApiError(404, "Recycle point not found.");
  if (request.method === "GET") return withRevision(jsonResponse(200, { ...document.data, id, revision: document.updateTime }), document.updateTime);
  if (!supportsDocumentVersion(document.data, RECYCLE_POINT_DOCUMENT_SCHEMA_VERSION)) {
    throw new ApiError(409, "O ponto usa uma versão de dados mais recente ou inválida. Atualize a aplicação antes de editar.");
  }
  if (request.method === "PATCH") {
    const patch = recycleUpdateSchema.parse(await parseJson(request));
    assertRevision(expectedRevision(request, patch.expectedUpdateTime), document.updateTime);
    const merged = recycleSchema.parse({ ...document.data, ...patch });
    await firestore.updateDocument(document.name, {
      ...merged, ...publicationMetadata(document.data, merged.publicationStatus),
    }, { expectedUpdateTime: document.updateTime });
    return jsonResponse(200, { ok: true });
  }
  if (request.method === "DELETE") {
    assertRevision(expectedRevision(request), document.updateTime);
    if (!document.updateTime) throw new ApiError(409, "Document revision unavailable.");
    await firestore.deleteDocumentsIfUnchanged([{ name: document.name, updateTime: document.updateTime }]);
    return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
  }
  return methodNotAllowed(["GET", "PATCH", "DELETE"]);
}

async function handleDashboard(
  env: Env,
  dependencies: AdminApiDependencies,
  requestId: string,
): Promise<Response> {
  const run = <T>(name: string, operation: () => Promise<T>) => observeOperation(`dashboard.${name}`, requestId, operation);
  const firestore = createFirestoreClient(env);
  const now = new Date();
  const alertWindowEnd = new Date(now.getTime() + 5 * 86_400_000);
  const [dogTotal, archivedDogs, recycles, publishedDogTotal, archivedPublishedDogs, publishedRecycles, adoptions, expiringDocuments, statistics, notification] =
    await Promise.all([
      run("dogs.countTotal", () => firestore.countDocuments(MANAGED_COLLECTIONS.dogs)),
      run("dogs.countArchived", () => firestore.countDocuments(MANAGED_COLLECTIONS.dogs, { filters: [{ fieldPath: "archivedAt", op: "GREATER_THAN", value: "" }] })),
      run("recycle.countTotal", () => firestore.countDocuments(MANAGED_COLLECTIONS.recycle)),
      run("dogs.countPublished", () => firestore.countDocuments(MANAGED_COLLECTIONS.dogs, { filters: [{ fieldPath: "publicationStatus", op: "EQUAL", value: "published" }] })),
      run("dogs.countArchivedPublished", () => firestore.countDocuments(MANAGED_COLLECTIONS.dogs, { filters: [{ fieldPath: "archivedAt", op: "GREATER_THAN", value: "" }, { fieldPath: "publicationStatus", op: "EQUAL", value: "published" }] })),
      run("recycle.countPublished", () => firestore.countDocuments(MANAGED_COLLECTIONS.recycle, { filters: [{ fieldPath: "publicationStatus", op: "EQUAL", value: "published" }] })),
      run("adoptions.countActive", () => firestore.countDocuments(MANAGED_COLLECTIONS.adoptions, { timestampAfter: { fieldPath: "expiresAt", cutoff: now } })),
      run("adoptions.expiring", () => firestore.findDocumentsByTimestampRange<StoredAdoption>(
        MANAGED_COLLECTIONS.adoptions, "expiresAt", now, alertWindowEnd, 25,
      )),
      run("statistics.read", () => firestore.getDocument<{ adoptionsCount?: unknown }>("system/statistics")),
      run("notification.read", () => dependencies.getAdminNotification(env)),
    ]);
  const expiring = await run("adoptions.decryptSummaries", () => serializeAdoptions(expiringDocuments, env));
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
      dogs: Math.max(0, dogTotal - archivedDogs),
      recycles,
      publishedDogs: Math.max(0, publishedDogTotal - archivedPublishedDogs),
      publishedRecycles,
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

    if (url.pathname === "/api/admin/migrations" || url.pathname.startsWith("/api/admin/migrations/")) {
      requireDeveloper(identity);
      return await handleMigrations(request, env, identity, parseJson, request.headers.get("X-Request-ID") ?? undefined);
    }

    if (url.pathname === "/api/admin/system/settings") {
      if (request.method !== "GET" && request.method !== "PATCH") {
        return methodNotAllowed(["GET", "PATCH"]);
      }
      const input = request.method === "PATCH"
        ? systemSettingsSchema.parse(await parseJson(request))
        : null;
      const firestore = requestFirestore(request, env, identity);
      const document = await firestore.getDocument("system/settings");
      if (input) {
        assertRevision(expectedRevision(request), document?.updateTime);
        const saved = document
          ? await firestore.updateDocument(document.name, input, { expectedUpdateTime: document.updateTime })
          : await firestore.createDocument("system", input, { documentId: "settings" });
        return withRevision(jsonResponse(200, { ...input, revision: saved.updateTime }), saved.updateTime);
      }
      if (!document || document.data.acceptingApplications === undefined) {
        return withRevision(jsonResponse(200, { acceptingApplications: false, revision: document?.updateTime ?? "absent" }), document?.updateTime);
      }
      if (typeof document.data.acceptingApplications !== "boolean") {
        throw new ApiError(503, "O campo acceptingApplications de system/settings precisa ser um booleano (true ou false).");
      }
      return withRevision(jsonResponse(200, { acceptingApplications: document.data.acceptingApplications, revision: document.updateTime }), document.updateTime);
    }

    if (url.pathname === "/api/admin/dashboard" && request.method === "GET") {
      return await handleDashboard(env, dependencies, request.headers.get("X-Request-ID")!);
    }
    if (url.pathname === "/api/admin/adoptions" && request.method === "GET") {
      const result = await dependencies.listAdoptionApplications(env, request);
      return jsonResponse(200, Array.isArray(result) ? { items: result, nextCursor: null } : result);
    }
    if (segments[2] === "adoptions" && segments.length === 4) {
      if (request.method !== "GET") return methodNotAllowed(["GET"]);
      const id = documentId(segments[3] ?? "");
      await dependencies.recordAdminAuditEvent(env, {
        action: "adoption.detail.authorized", actor: identity.email, actorSubject: identity.subject,
        actorRole: identity.role, method: "GET", path: url.pathname,
        requestId: request.headers.get("X-Request-ID") ?? crypto.randomUUID(),
        target: `adoption_application/${id}`, outcome: "success", phase: "authorized", status: 200, durationMs: 0,
      });
      const adoption = await dependencies.getAdoptionApplication(env, id);
      return withRevision(jsonResponse(200, adoption), typeof adoption.revision === "string" ? adoption.revision : undefined);
    }
    if (url.pathname === "/api/admin/dog-identity-inventory") {
      requireDeveloper(identity);
      if (request.method !== "GET") return methodNotAllowed(["GET"]);
      return jsonResponse(200, inventoryLegacyDogIds(await createFirestoreClient(env).listDocuments("dogs")));
    }
    if (url.pathname === "/api/admin/audit-log") {
      requireDeveloper(identity);
      if (request.method !== "GET") return methodNotAllowed(["GET"]);
      return jsonResponse(200, await dependencies.listAdminAuditEvents(env));
    }
    if (url.pathname === "/api/admin/system-keys") {
      requireDeveloper(identity);
      if (request.method !== "GET") return methodNotAllowed(["GET"]);
      if (dependencies.listSystemKeysState) {
        const state = await dependencies.listSystemKeysState(env);
        return withRevision(jsonResponse(200, state.value), state.revision);
      }
      return withRevision(jsonResponse(200, await dependencies.listSystemKeys(env)), undefined);
    }
    if (url.pathname === "/api/admin/system-keys/rotate") {
      requireDeveloper(identity);
      if (request.method !== "POST") return methodNotAllowed(["POST"]);
      return jsonResponse(201, await dependencies.rotateSystemKey(env, identity, expectedRevision(request), requestFirestore(request, env, identity)));
    }
    if (url.pathname === "/api/admin/notifications") {
      if (request.method === "GET") {
        if (dependencies.getAdminNotificationState) {
          const state = await dependencies.getAdminNotificationState(env);
          return withRevision(jsonResponse(200, state.value), state.revision);
        }
        return withRevision(jsonResponse(200, await dependencies.getAdminNotification(env)), undefined);
      }
      if (request.method === "PUT") {
        requireDeveloper(identity);
        const input = notificationInputSchema.parse(await parseJson(request));
        return jsonResponse(
          200,
          await dependencies.saveAdminNotification(env, input, identity, undefined, expectedRevision(request), requestFirestore(request, env, identity)),
        );
      }
      if (request.method === "DELETE") {
        requireDeveloper(identity);
        await dependencies.deleteAdminNotification(env, identity, expectedRevision(request), requestFirestore(request, env, identity));
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
      assertRevision(expectedRevision(request), document.updateTime);
      const update = adoptionStatusUpdate(document.data, status);
      if (!document.updateTime) throw new ApiError(409, "A versão da solicitação não está disponível. Atualize a página.");
      const saved = await requestFirestore(request, env, identity).updateDocument(document.name, {
        ...update,
        expiresAt: new Date(update.expiresAt),
      }, { expectedUpdateTime: document.updateTime });
      return withRevision(jsonResponse(200, { ok: true, ...update, revision: saved.updateTime }), saved.updateTime);
    }
    if (segments[2] === "dogs" && segments.length <= 5) {
      const operation = segments.length === 5
        && (segments[4] === "archive" || segments[4] === "restore")
        ? segments[4] : undefined;
      if (segments.length === 5 && !operation) return jsonResponse(404, { error: "Not found" });
      return await handleDogs(
        request,
        env,
        segments[3],
        executionContext,
        dependencies.saveDogTombstone,
        identity,
        operation,
      );
    }
    if (segments[2] === "recycle-points" && segments.length <= 4) {
      return await handleRecycle(request, env, segments[3], identity);
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
      const uploaded = await observeOperation("media.upload", request.headers.get("X-Request-ID")!, () => dependencies.uploadCloudinaryImage(request, env, { actorSubject: identity.subject, actorRole: identity.role, requestId: request.headers.get("X-Request-ID")! }));
      await registerUploadedMedia(env, uploaded, requestFirestore(request, env, identity));
      return jsonResponse(201, uploaded);
    }
    if (url.pathname === "/api/admin/media/delete") {
      if (request.method !== "POST") return methodNotAllowed(["POST"]);
      const { imageUrl } = imageDeleteSchema.parse(await parseJson(request));
      await observeOperation("media.delete", request.headers.get("X-Request-ID")!, () => deleteManagedMedia(env, imageUrl, requestFirestore(request, env, identity)));
      return jsonResponse(200, { ok: true });
    }
    return jsonResponse(404, { error: "Not found" });
  } catch (caught) {
    const error = errorCause(caught);
    if (error instanceof FirestoreCursorError) return jsonResponse(400, { error: error.message });
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
    if (error instanceof AdoptionUnavailableError) return jsonResponse(404, { error: error.message });
    if (error instanceof DogIdentityError || error instanceof MediaAssetError) return jsonResponse(error.status, { error: error.message });
    if (error instanceof RevisionError) return jsonResponse(error.status, { error: error.message });
    if (error instanceof AdoptionTransitionError) return jsonResponse(409, { error: error.message });
    if (error instanceof ApiError) return jsonResponse(error.status, { error: error.message });
    if (error instanceof CloudinaryUploadError) {
      return jsonResponse(error.status, { error: error.message });
    }
    const requestId = request.headers.get("X-Request-ID")!;
    logApiFailure("admin.api.error", requestId, caught);
    return operationalErrorResponse(caught, requestId, new URL(request.url).pathname === "/api/admin/dashboard");
  }
}

export async function handleAdminApi(
  request: Request,
  env: Env,
  identity: AccessIdentity,
  dependencies: AdminApiDependencies = productionDependencies,
  executionContext?: Pick<ExecutionContext, "waitUntil">,
  requestId: string = requestIdFor(request),
): Promise<Response> {
  const startedAt = Date.now();
  const headers = new Headers(request.headers);
  headers.set("X-Request-ID", requestId);
  request = new Request(request, { headers });
  const auditDescriptor = describeAuditedMutation(request);
  console.info(JSON.stringify({ event: "admin.api.request", requestId, method: request.method, route: requestRouteForLog(request) }));
  const response = await normalizeApiResponse(await routeAdminApi(
    request,
    env,
    identity,
    dependencies,
    executionContext,
  ), requestId);

  if (auditDescriptor?.action.startsWith("dog.") && response.ok) response.headers.set("X-Publication-State", "pending");
  response.headers.set("X-Request-ID", request.headers.get("X-Request-ID")!);

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

  console.info(JSON.stringify({ event: "admin.api.completed", requestId, status: response.status, durationMs: Date.now() - startedAt }));
  return response;
}
