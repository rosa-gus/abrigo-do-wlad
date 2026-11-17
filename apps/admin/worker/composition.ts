import type { AccessIdentity } from "@abrigo/contracts/admin";
import { createDogService } from "@abrigo/backend/application/dogs";
import { createRecycleService } from "@abrigo/backend/application/recycle-points";
import { createSettingsService } from "@abrigo/backend/application/settings";
import { createAdoptionService } from "@abrigo/backend/application/adoptions";
import { createDashboardService } from "@abrigo/backend/application/dashboard";
import { createDogRepository, createRecycleRepository, createSettingsRepository, createAdoptionRepository, createDashboardReader } from "@abrigo/backend/adapters/admin/repositories";
import { createFirestoreClient, createFirestoreDocumentId } from "@abrigo/backend/adapters/firestore";
import { decryptDataBatch } from "@abrigo/backend/adapters/encryption";
import { createAuditedFirestoreClient, listAdminAuditEvents, recordAdminAuditEvent } from "@abrigo/backend/adapters/admin/audit";
import { uploadManagedMedia } from "@abrigo/backend/adapters/admin/media-upload";
import { registerUploadedMedia, deleteManagedMedia } from "@abrigo/backend/adapters/admin/media-assets";
import { listSystemKeys, listSystemKeysState, rotateSystemKey } from "@abrigo/backend/adapters/admin/system-keys";
import { getAdminNotification, getAdminNotificationState, saveAdminNotification, deleteAdminNotification } from "@abrigo/backend/adapters/admin/notifications";
import { saveDogTombstone, deleteDogTombstone } from "@abrigo/backend/adapters/dogs/tombstone";
import { processDogPublicationOutbox } from "@abrigo/backend/adapters/dogs/publication-outbox";
import { updateHeroDog } from "@abrigo/backend/adapters/hero-dog/update";
import { adoptionPageOptions } from "@abrigo/backend/http/admin-request";
import { describeAdminMutation } from "./routes/registry";
import { observeOperation } from "@abrigo/backend/http/admin-errors";
import type { AdminApiDependencies } from "./dependencies";

function defaultAdoptions(env: Env) {
  return createAdoptionService(createAdoptionRepository(() => createFirestoreClient(env)), { decrypt: items => decryptDataBatch(items, env) });
}
export const productionDependencies: AdminApiDependencies = {
  listAdoptionApplications: (env, request) => defaultAdoptions(env).list(adoptionPageOptions(request)),
  getAdoptionApplication: (env, id) => defaultAdoptions(env).detail(id),
  async consumeUploadRateLimit(env, identity) {
    if (!env.UPLOAD_RATE_LIMITER) throw new Error("UPLOAD_RATE_LIMITER is not configured.");
    return (await env.UPLOAD_RATE_LIMITER.limit({ key: `admin-media:${identity.subject}` })).success;
  },
  listSystemKeys, listSystemKeysState, rotateSystemKey,
  getAdminNotification, getAdminNotificationState, saveAdminNotification, deleteAdminNotification,
  listAdminAuditEvents, recordAdminAuditEvent, uploadCloudinaryImage: uploadManagedMedia, saveDogTombstone,
};

/** Build fresh request-scoped adapters. Audited writes include business, audit and outbox in one commit. */
export function createAdminServices(request: Request, env: Env, identity: AccessIdentity, dependencies: AdminApiDependencies,
  executionContext?: Pick<ExecutionContext, "waitUntil">) {
  const requestId = request.headers.get("X-Request-ID")!;
  const descriptor = describeAdminMutation(request);
  let client: ReturnType<typeof createFirestoreClient> | undefined;
  let readClient: ReturnType<typeof createFirestoreClient> | undefined;
  const getClient = () => client ??= descriptor ? createAuditedFirestoreClient(env, { ...descriptor, actor: identity.email, actorSubject: identity.subject,
    actorRole: identity.role, path: new URL(request.url).pathname, requestId }) : createFirestoreClient(env);
  const getReadClient = () => readClient ??= createFirestoreClient(env);
  const run = <T>(name: string, operation: () => Promise<T>) => observeOperation(`dashboard.${name}`, requestId, operation);
  const adoptions = createAdoptionService(createAdoptionRepository(getReadClient, getClient), { decrypt: items => decryptDataBatch(items, env) });
  const dogs = createDogService(createDogRepository(env, getClient), {
    refreshFeed() {
      if (executionContext) executionContext.waitUntil(processDogPublicationOutbox(env).catch(() => {
        console.error(JSON.stringify({ event: "admin.dogs-feed.refresh.failed" }));
      }));
    },
    refreshHero() {
      if (executionContext) executionContext.waitUntil(updateHeroDog(env).then(result => {
        if (result.status >= 400) console.error(JSON.stringify({ event: "admin.hero-dog.refresh.failed", status: result.status }));
      }));
    },
    saveTombstone: input => dependencies.saveDogTombstone(env, input), deleteTombstone: id => deleteDogTombstone(env, id),
  }, createFirestoreDocumentId);
  return {
    dogs, adoptions, recycle: createRecycleService(createRecycleRepository(getClient)), settings: createSettingsService(createSettingsRepository(getClient)),
    dashboard: createDashboardService(createDashboardReader(getReadClient, run), {
      serialize: documents => run("adoptions.decryptSummaries", () => adoptions.serialize(documents)),
    }, () => run("notification.read", () => dependencies.getAdminNotification(env))),
    adoptionReads: {
      list: (input: Request) => dependencies.listAdoptionApplications(env, input),
      detail: (id: string) => dependencies.getAdoptionApplication(env, id),
    },
    audit: {
      list: () => dependencies.listAdminAuditEvents(env),
      record: (input: Parameters<AdminApiDependencies["recordAdminAuditEvent"]>[1]) => dependencies.recordAdminAuditEvent(env, input),
    },
    keys: {
      state: () => dependencies.listSystemKeysState ? dependencies.listSystemKeysState(env) : dependencies.listSystemKeys(env).then(value => ({ value, revision: undefined })),
      rotate: (expected: string) => dependencies.rotateSystemKey(env, identity, expected, getClient()),
    },
    notifications: {
      state: () => dependencies.getAdminNotificationState ? dependencies.getAdminNotificationState(env) : dependencies.getAdminNotification(env).then(value => ({ value, revision: undefined })),
      save: (input: Parameters<AdminApiDependencies["saveAdminNotification"]>[1], expected: string) => dependencies.saveAdminNotification(env, input, identity, undefined, expected, getClient()),
      delete: (expected: string) => dependencies.deleteAdminNotification(env, identity, expected, getClient()),
    },
    media: {
      allowed: () => dependencies.consumeUploadRateLimit(env, identity),
      async upload(input: Request) {
        const uploaded = await observeOperation("media.upload", requestId, () => dependencies.uploadCloudinaryImage(input, env, { actorSubject: identity.subject, actorRole: identity.role, requestId }));
        await registerUploadedMedia(env, uploaded, getClient());
        return uploaded;
      },
      delete: (url: string) => observeOperation("media.delete", requestId, () => deleteManagedMedia(env, url, getClient())),
    },
  };
}
export type AdminServices = ReturnType<typeof createAdminServices>;
