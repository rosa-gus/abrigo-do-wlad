import { z } from "zod";
import { createFirestoreClient, type FirestoreRestClient } from "../firestore";
import type { AccessIdentity } from "@abrigo/contracts/admin";
import { assertRevision } from "../../application/revision";

import {
  adminNotificationSchema,
  notificationExpirationSchema,
  type AdminNotification,
  type NotificationInput,
} from "@abrigo/contracts/notifications";
export { notificationInputSchema } from "@abrigo/contracts/notifications";
export type {
  AdminNotification,
  NotificationInput,
} from "@abrigo/contracts/notifications";

const storedAdminNotificationSchema = adminNotificationSchema.extend({
  expiration: notificationExpirationSchema.optional(),
  expiresAt: z.string().datetime().nullable().optional(),
});

const NOTIFICATION_DOCUMENT = "system/notifications";
const EXPIRATION_MS = {
  "1h": 60 * 60 * 1_000,
  "6h": 6 * 60 * 60 * 1_000,
  "12h": 12 * 60 * 60 * 1_000,
} as const;

export async function getAdminNotification(
  env: Env,
  now: Date = new Date(),
): Promise<AdminNotification | null> {
  const document = await createFirestoreClient(env).getDocument(
    NOTIFICATION_DOCUMENT,
  );
  if (!document) return null;

  const stored = storedAdminNotificationSchema.parse(document.data);
  const notification = adminNotificationSchema.parse({
    ...stored,
    expiration: stored.expiration ?? "until_deleted",
    expiresAt: stored.expiresAt ?? null,
  });

  if (
    notification.expiresAt &&
    Date.parse(notification.expiresAt) <= now.getTime()
  ) {
    return null;
  }

  return notification;
}

export async function getAdminNotificationState(env: Env): Promise<{
  value: AdminNotification | null;
  revision: string | undefined;
}> {
  const document = await createFirestoreClient(env).getDocument(
    NOTIFICATION_DOCUMENT,
  );
  if (!document) return { value: null, revision: undefined };
  const stored = storedAdminNotificationSchema.parse(document.data);
  const value = adminNotificationSchema.parse({
    ...stored,
    expiration: stored.expiration ?? "until_deleted",
    expiresAt: stored.expiresAt ?? null,
  });
  return {
    value:
      value.expiresAt && Date.parse(value.expiresAt) <= Date.now()
        ? null
        : { ...value, revision: document.updateTime },
    revision: document.updateTime,
  };
}

export async function saveAdminNotification(
  env: Env,
  input: NotificationInput,
  identity: AccessIdentity,
  now: Date = new Date(),
  expected?: string,
  firestore: FirestoreRestClient = createFirestoreClient(env),
): Promise<AdminNotification> {
  const existing = await firestore.getDocument(NOTIFICATION_DOCUMENT);
  if (expected !== undefined) assertRevision(expected, existing?.updateTime);
  const updatedAt = now.toISOString();
  const notification = adminNotificationSchema.parse({
    ...input,
    target: "admin",
    updatedAt,
    author: identity.email,
    expiresAt:
      input.expiration === "until_deleted"
        ? null
        : new Date(
            now.getTime() + EXPIRATION_MS[input.expiration],
          ).toISOString(),
  });

  let revision: string | undefined;
  if (existing) {
    const result = await firestore.updateDocument(existing.name, notification, {
      expectedUpdateTime: existing.updateTime,
    });
    revision = result.updateTime;
  } else {
    const result = await firestore.createDocument("system", notification, {
      documentId: "notifications",
    });
    revision = result.updateTime;
  }

  console.info(
    JSON.stringify({
      event: "admin.notification.saved",
      actor: identity.email,
      type: notification.type,
      expiration: notification.expiration,
      expiresAt: notification.expiresAt,
    }),
  );

  return { ...notification, ...(revision ? { revision } : {}) };
}

export async function deleteAdminNotification(
  env: Env,
  identity: AccessIdentity,
  expected?: string,
  firestore: FirestoreRestClient = createFirestoreClient(env),
): Promise<void> {
  const existing = await firestore.getDocument(NOTIFICATION_DOCUMENT);
  if (expected !== undefined) assertRevision(expected, existing?.updateTime);

  if (existing) {
    if (!existing.updateTime)
      throw new Error("Notification revision is unavailable.");
    await firestore.deleteDocumentsIfUnchanged([
      { name: existing.name, updateTime: existing.updateTime },
    ]);
  }

  console.info(
    JSON.stringify({
      event: "admin.notification.deleted",
      actor: identity.email,
      existed: Boolean(existing),
    }),
  );
}
