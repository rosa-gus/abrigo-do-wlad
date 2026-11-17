import type { AccessIdentity } from "@abrigo/contracts/admin";
import type { SystemKeyMetadata, RotatedSystemKey } from "@abrigo/contracts/system-keys";
import type { AdminNotification, NotificationInput } from "@abrigo/contracts/notifications";
import type { AdminAuditEvent, AdminAuditEventInput } from "@abrigo/contracts/audit";
import type { FirestoreRestClient } from "@abrigo/backend/adapters/firestore";
import type { UploadedDogImage } from "@abrigo/backend/adapters/admin/cloudinary";
import type { DogTombstone, DogTombstoneInput } from "@abrigo/backend/adapters/dogs/tombstone";

/** Compatibility injection surface for existing integrations and characterization tests. */
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

