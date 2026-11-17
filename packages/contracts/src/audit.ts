import { z } from "zod";
import type { AdminRole } from "./admin";

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

export const adminAuditEventSchema = z.object({
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

