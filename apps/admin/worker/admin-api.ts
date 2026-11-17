import { requestRouteForLog } from "./api-errors";
import { z } from "zod";
import type { AccessIdentity } from "@abrigo/contracts/admin";
import { hasAdminCapability } from "@abrigo/domain/admin/policies";
import { AdoptionTransitionError } from "@abrigo/domain/adoptions/transitions";
import { ApplicationError } from "@abrigo/backend/application/errors";
import { AdoptionUnavailableError } from "@abrigo/backend/application/adoption-access";
import { DogIdentityError } from "@abrigo/backend/application/dog-identity";
import { FirestoreCursorError } from "@abrigo/backend/adapters/firestore";
import { MediaAssetError } from "@abrigo/backend/adapters/admin/media-assets";
import { CloudinaryUploadError } from "@abrigo/backend/adapters/admin/cloudinary";
import { RevisionError } from "@abrigo/backend/http/revision";
import { assertSameOrigin, jsonResponse, methodNotAllowed, parseJson } from "@abrigo/backend/http/admin-request";
import { createAdminServices, productionDependencies } from "./composition";
import type { AdminApiDependencies } from "./dependencies";
import { adminRouteOperation, describeAdminMutation, matchAdminRoute } from "./routes/registry";
import { routeDogs } from "./routes/dogs";
import { routeRecycle } from "./routes/recycle-points";
import { routeAdoptions } from "./routes/adoptions";
import { routeSystem } from "./routes/system";
import { routeMedia } from "./routes/media";
import { handleMigrations } from "./migrations";
import { errorCause, logApiFailure, normalizeApiResponse, operationalErrorResponse, requestIdFor } from "@abrigo/backend/http/admin-errors";
export type { AdminApiDependencies } from "./dependencies";
type AuditDescriptor = NonNullable<ReturnType<typeof describeAdminMutation>>;

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

async function routeAdminApi(request: Request, env: Env, identity: AccessIdentity, dependencies: AdminApiDependencies,
  executionContext?: Pick<ExecutionContext, "waitUntil">): Promise<Response> {
  try {
    const route = matchAdminRoute(new URL(request.url).pathname);
    if (!route || route.id === "session") return jsonResponse(404, { error: "Not found" });
    const operation = adminRouteOperation(route, request.method);
    if (!operation) return methodNotAllowed(Object.keys(route.methods));
    if (!hasAdminCapability(identity.role, operation.capability)) throw new ApplicationError(403, "Developer access required.");
    assertSameOrigin(request);
    if (["migrations", "migrationPlan", "migrationApply"].includes(route.id)) return await handleMigrations(request, env, identity, parseJson, request.headers.get("X-Request-ID") ?? undefined);
    const services = createAdminServices(request, env, identity, dependencies, executionContext);
    const context = { request, route, identity, services };
    switch (route.id) {
      case "dogs": case "dog": case "dogArchive": case "dogRestore": case "identityInventory": return await routeDogs(context);
      case "recyclePoints": case "recyclePoint": return await routeRecycle(context);
      case "adoptions": case "adoption": case "adoptionStatus": return await routeAdoptions(context);
      case "mediaUpload": case "mediaDelete": return await routeMedia(context);
      case "dashboard": return jsonResponse(200, await services.dashboard.get());
      case "settings": case "auditLog": case "systemKeys": case "rotateKey": case "notifications": return await routeSystem(context);
      default: return jsonResponse(404, { error: "Not found" });
    }
  } catch (caught) {
    const error = errorCause(caught);
    if (error instanceof FirestoreCursorError) return jsonResponse(400, { error: error.message });
    if (error instanceof z.ZodError) {
      const issue = error.issues.find(issue => (issue.path[0] === "fotos" || issue.path[0] === "tags") && issue.code === "too_big");
      return jsonResponse(400, { error: issue?.message ?? error.issues[0]?.message ?? "Invalid request", issues: error.issues });
    }
    if (error instanceof AdoptionUnavailableError) return jsonResponse(404, { error: error.message });
    if (error instanceof DogIdentityError || error instanceof MediaAssetError || error instanceof RevisionError || error instanceof ApplicationError || error instanceof CloudinaryUploadError) return jsonResponse(error.status, { error: error.message });
    if (error instanceof AdoptionTransitionError) return jsonResponse(409, { error: error.message });
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
  const auditDescriptor = describeAdminMutation(request);
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
