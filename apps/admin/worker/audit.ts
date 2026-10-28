import { z } from "zod";

import { createFirestoreClient } from "../../../workers/shared/api/_lib/firestore";
import type { AdminRole } from "./access";

const AUDIT_COLLECTION = "admin_audit_log";
const AUDIT_LIST_LIMIT = 100;

export const adminAuditActionSchema = z.enum([
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
  actorRole: z.enum(["administrator", "developer"]),
  createdAt: z.string().datetime(),
  durationMs: z.number().int().nonnegative(),
  method: z.enum(["POST", "PUT", "PATCH", "DELETE"]),
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
  actorRole: AdminRole;
  durationMs: number;
  method: "POST" | "PUT" | "PATCH" | "DELETE";
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
    durationMs: Math.max(0, Math.round(input.durationMs)),
  });

  await createFirestoreClient(env).createDocument(AUDIT_COLLECTION, event);
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
