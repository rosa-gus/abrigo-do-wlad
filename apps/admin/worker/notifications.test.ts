import assert from "node:assert/strict";
import { afterEach, beforeEach, test, vi } from "vitest";

import type { AccessIdentity } from "./access";

const firestore = vi.hoisted(() => ({
  createDocument: vi.fn(),
  deleteDocumentsIfUnchanged: vi.fn(),
  getDocument: vi.fn(),
  updateDocument: vi.fn(),
}));

vi.mock("../../../workers/shared/api/_lib/firestore", () => ({
  createFirestoreClient: () => firestore,
}));

import {
  deleteAdminNotification,
  getAdminNotification,
  saveAdminNotification,
} from "./notifications";

const env = {} as Env;
const identity: AccessIdentity = {
  email: "developer@example.test",
  role: "developer",
  subject: "developer-subject",
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "info").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

test("returns null when the admin notification document does not exist", async () => {
  firestore.getDocument.mockResolvedValue(null);

  assert.equal(await getAdminNotification(env), null);
  assert.equal(firestore.getDocument.mock.calls[0]?.[0], "system/notifications");
});

test("creates the single admin notification document with English fields", async () => {
  firestore.getDocument.mockResolvedValue(null);
  firestore.createDocument.mockResolvedValue({ id: "notifications" });

  const notification = await saveAdminNotification(
    env,
    { message: "Painel atualizado.", type: "success", expiration: "6h" },
    identity,
    new Date("2026-08-24T12:00:00.000Z"),
  );

  assert.equal(notification.target, "admin");
  assert.equal(notification.author, identity.email);
  assert.equal(notification.type, "success");
  assert.equal(notification.expiration, "6h");
  assert.equal(notification.updatedAt, "2026-08-24T12:00:00.000Z");
  assert.equal(notification.expiresAt, "2026-08-24T18:00:00.000Z");
  assert.deepEqual(firestore.createDocument.mock.calls[0], [
    "system",
    notification,
    { documentId: "notifications" },
  ]);
});

test("updates the existing notification document instead of creating another", async () => {
  firestore.getDocument.mockResolvedValue({
    name: "projects/project/databases/(default)/documents/system/notifications",
    updateTime: "2026-08-24T12:00:00.000Z",
    data: {},
  });
  firestore.updateDocument.mockResolvedValue({});

  const notification = await saveAdminNotification(
    env,
    { message: "Prazo encerrando.", type: "urgent", expiration: "12h" },
    identity,
    new Date("2026-08-24T12:00:00.000Z"),
  );

  assert.deepEqual(firestore.updateDocument.mock.calls[0], [
    "projects/project/databases/(default)/documents/system/notifications",
    notification,
    { expectedUpdateTime: "2026-08-24T12:00:00.000Z" },
  ]);
  assert.equal(firestore.createDocument.mock.calls.length, 0);
});

test("stores a null expiration date for notifications kept until deletion", async () => {
  firestore.getDocument.mockResolvedValue(null);
  firestore.createDocument.mockResolvedValue({ id: "notifications" });

  const notification = await saveAdminNotification(
    env,
    { message: "Aviso permanente.", type: "info", expiration: "until_deleted" },
    identity,
    new Date("2026-08-24T12:00:00.000Z"),
  );

  assert.equal(notification.expiration, "until_deleted");
  assert.equal(notification.expiresAt, null);
});

test("does not return a notification at or after its expiration time", async () => {
  firestore.getDocument.mockResolvedValue({
    name: "projects/project/databases/(default)/documents/system/notifications",
    data: {
      message: "Aviso vencido.",
      type: "urgent",
      target: "admin",
      updatedAt: "2026-08-24T12:00:00.000Z",
      author: identity.email,
      expiration: "1h",
      expiresAt: "2026-08-24T13:00:00.000Z",
    },
  });

  assert.equal(
    await getAdminNotification(env, new Date("2026-08-24T13:00:00.000Z")),
    null,
  );
});

test("treats legacy notifications without expiration fields as until deleted", async () => {
  firestore.getDocument.mockResolvedValue({
    name: "projects/project/databases/(default)/documents/system/notifications",
    data: {
      message: "Aviso existente.",
      type: "trivial",
      target: "admin",
      updatedAt: "2026-08-24T12:00:00.000Z",
      author: identity.email,
    },
  });

  const notification = await getAdminNotification(
    env,
    new Date("2026-08-25T12:00:00.000Z"),
  );

  assert.equal(notification?.expiration, "until_deleted");
  assert.equal(notification?.expiresAt, null);
});

test("deletes the notification document when it exists", async () => {
  const documentName =
    "projects/project/databases/(default)/documents/system/notifications";
  firestore.getDocument.mockResolvedValue({ name: documentName, updateTime: "2026-08-24T12:00:00.000Z", data: {} });
  firestore.deleteDocumentsIfUnchanged.mockResolvedValue({ deleted: 1 });

  await deleteAdminNotification(env, identity);

  assert.deepEqual(firestore.deleteDocumentsIfUnchanged.mock.calls[0], [[{ name: documentName, updateTime: "2026-08-24T12:00:00.000Z" }]]);
});
