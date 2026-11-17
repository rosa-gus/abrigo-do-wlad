import { z } from "zod";

import { dogPublicationOutboxWrite } from "../../../workers/shared/api/dogs/publication-outbox";
import type { FirestoreCommitMetadata } from "../../../workers/shared/api/_lib/firestore";
import { createFirestoreClient } from "../../../workers/shared/api/_lib/firestore";
import type { AdminRole } from "./access";

const AUDIT_COLLECTION = "admin_audit_log";
const AUDIT_LIST_LIMIT = 100;

export const adminAuditActionSchema = z.enum([
  "adoption.detail.authorized",
  "migration.batch.applied",
  "adoption.availability.updated",
  "adoption.status.updated",
  "dog.created",
  "dog.archived",
  "dog.deleted",
  "dog.restored",
  "dog.updated",
  "media.deleted",
  "media.uploaded",
  "notification.deleted",
  "notification.saved",
  "recycle-point.created",
  "recycle-point.deleted",
  "recycle-point.updated",
  "system-key.rotated",
]);

const adminAuditEventSchema = z.object({
  action: adminAuditActionSchema,
  actor: z.string().email(),
  actorSubject: z.string().min(1).max(255).optional(),
  expiresAt: z.string().datetime().optional(),
  phase: z.enum(["committed", "authorized", "response"]).optional(),
  actorRole: z.enum(["administrator", "developer"]),
  createdAt: z.string().datetime(),
  durationMs: z.number().int().nonnegative(),
  method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]),
  outcome: z.enum(["success", "rejected", "failure"]),
  path: z.string().startsWith("/").max(300),
  requestId: z.string().min(1).max(128),
  status: z.number().int().min(100).max(599),
  target: z.string().min(1).max(180),
});

export type AdminAuditAction = z.infer<typeof adminAuditActionSchema>;
export type AdminAuditEvent = z.infer<typeof adminAuditEventSchema>;

export interface AdminAuditEventInput {
  action: AdminAuditAction;
  actor: string;
  actorSubject?: string;
  phase?: "committed" | "authorized" | "response";
  actorRole: AdminRole;
  durationMs: number;
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  outcome: "success" | "rejected" | "failure";
  path: string;
  requestId: string;
  status: number;
  target: string;
}

export async function recordAdminAuditEvent(
  env: Env,
  input: AdminAuditEventInput,
  now: Date = new Date(),
): Promise<void> {
  const event = adminAuditEventSchema.parse({
    ...input,
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + AUDIT_RETENTION_MS).toISOString(),
    durationMs: Math.max(0, Math.round(input.durationMs)),
  });

  await createFirestoreClient(env).createDocument(AUDIT_COLLECTION, { ...event, expiresAt: new Date(event.expiresAt!) });
  console.info(JSON.stringify({ event: "admin.audit.recorded", ...event }));
}

export async function listAdminAuditEvents(env: Env): Promise<AdminAuditEvent[]> {
  const documents = await createFirestoreClient(env).listDocuments(
    AUDIT_COLLECTION,
    {
      direction: "DESCENDING",
      limit: AUDIT_LIST_LIMIT,
      orderBy: "createdAt",
    },
  );

  return documents.map((document) =>
    adminAuditEventSchema.parse(document.data)
  );
}


// Operational retention is 180 days. Firestore TTL on expiresAt is an explicit
// deployment step; access remains developer-only through the existing endpoint.
const AUDIT_RETENTION_MS = 180 * 24 * 60 * 60_000;

/** A fresh client for one request; never share it across identities or requests. */
export function createAuditedFirestoreClient(
  env: Env,
  input: Omit<AdminAuditEventInput, "durationMs" | "outcome" | "status">,
) {
  return createFirestoreClient(env, {
    commitMetadata(targets) {
      const now = new Date();
      const eventId = crypto.randomUUID();
      const event = adminAuditEventSchema.parse({
        ...input, target: targets[0] ?? input.target, phase: "committed", durationMs: 0, outcome: "success", status: 200,
        createdAt: now.toISOString(),
        expiresAt: new Date(now.getTime() + AUDIT_RETENTION_MS).toISOString(),
      });
      const metadata: FirestoreCommitMetadata[] = [{ path: `${AUDIT_COLLECTION}/${eventId}`, data: { ...event, expiresAt: new Date(event.expiresAt!) } }];
      if (targets.some(target => target.startsWith("dogs/"))) {
        const publication = dogPublicationOutboxWrite(eventId, now, targets, input.action);
        if (publication.kind === "create") metadata.push({ path: publication.path, data: publication.data });
      }
      return metadata;
    },
  });
}
