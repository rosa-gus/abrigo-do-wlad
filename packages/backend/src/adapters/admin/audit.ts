import { dogPublicationOutboxWrite } from "../dogs/publication-outbox";
import type { FirestoreCommitMetadata } from "../firestore";
import { createFirestoreClient } from "../firestore";

const AUDIT_COLLECTION = "admin_audit_log";
const AUDIT_LIST_LIMIT = 100;

export { adminAuditActionSchema } from "@abrigo/contracts/audit";
export type {
  AdminAuditAction,
  AdminAuditEvent,
  AdminAuditEventInput,
} from "@abrigo/contracts/audit";
import {
  adminAuditEventSchema,
  type AdminAuditEvent,
  type AdminAuditEventInput,
} from "@abrigo/contracts/audit";

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

  await createFirestoreClient(env).createDocument(AUDIT_COLLECTION, {
    ...event,
    expiresAt: new Date(event.expiresAt!),
  });
  console.info(JSON.stringify({ event: "admin.audit.recorded", ...event }));
}

export async function listAdminAuditEvents(
  env: Env,
): Promise<AdminAuditEvent[]> {
  const documents = await createFirestoreClient(env).listDocuments(
    AUDIT_COLLECTION,
    {
      direction: "DESCENDING",
      limit: AUDIT_LIST_LIMIT,
      orderBy: "createdAt",
    },
  );

  return documents.map((document) =>
    adminAuditEventSchema.parse(document.data),
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
        ...input,
        target: targets[0] ?? input.target,
        phase: "committed",
        durationMs: 0,
        outcome: "success",
        status: 200,
        createdAt: now.toISOString(),
        expiresAt: new Date(now.getTime() + AUDIT_RETENTION_MS).toISOString(),
      });
      const metadata: FirestoreCommitMetadata[] = [
        {
          path: `${AUDIT_COLLECTION}/${eventId}`,
          data: { ...event, expiresAt: new Date(event.expiresAt!) },
        },
      ];
      if (targets.some((target) => target.startsWith("dogs/"))) {
        const publication = dogPublicationOutboxWrite(
          eventId,
          now,
          targets,
          input.action,
        );
        if (publication.kind === "create")
          metadata.push({ path: publication.path, data: publication.data });
      }
      return metadata;
    },
  });
}
