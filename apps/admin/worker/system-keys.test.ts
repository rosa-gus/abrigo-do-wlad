import assert from "node:assert/strict";
import { beforeEach, test, vi } from "vitest";

import type { AccessIdentity } from "./access";

const firestore = vi.hoisted(() => ({
  createDocument: vi.fn(),
  getDocument: vi.fn(),
  updateDocument: vi.fn(),
}));

vi.mock("../../../workers/shared/api/_lib/encryption", () => ({
  encryptSystemKey: () => "encrypted-system-key",
}));

vi.mock("../../../workers/shared/api/_lib/firestore", async (importOriginal) => ({
  ...await importOriginal<typeof import("../../../workers/shared/api/_lib/firestore")>(),
  createFirestoreClient: () => firestore,
}));

import { rotateSystemKey } from "./system-keys";
import { FirestoreRestError } from "../../../workers/shared/api/_lib/firestore";

const env = {} as Env;
const identity: AccessIdentity = {
  email: "developer@example.test",
  role: "developer",
  subject: "developer-subject",
};

beforeEach(() => {
  vi.clearAllMocks();
});

test("rotation retries a concurrent increment using the latest counters", async () => {
  const key = {
    id: "existing-key", key: "encrypted-key", version: "v1",
    createdAt: "2026-08-22T12:00:00.000Z", counter: 3, active: true,
  };
  const document = {
    name: "projects/test/databases/(default)/documents/system/keys",
    updateTime: "2026-08-23T12:00:00.000Z",
    data: { active_key_id: key.id, keys: { [key.id]: key } },
  };
  firestore.getDocument.mockResolvedValueOnce(document).mockResolvedValueOnce({
    ...document,
    updateTime: "2026-08-23T12:00:01.000Z",
    data: { ...document.data, keys: { [key.id]: { ...key, counter: 4 } } },
  });
  firestore.updateDocument.mockRejectedValueOnce(new FirestoreRestError("Changed", 400, {
    error: { status: "FAILED_PRECONDITION" },
  })).mockResolvedValueOnce({});
  await rotateSystemKey(env, identity);
  assert.equal(firestore.getDocument.mock.calls.length, 2);
  assert.equal(firestore.updateDocument.mock.calls[1][1].keys[key.id].counter, 4);
  assert.deepEqual(firestore.updateDocument.mock.calls[1][2], {
    expectedUpdateTime: "2026-08-23T12:00:01.000Z",
  });
});

test("rotation stops after three conflicting attempts", async () => {
  const key = {
    id: "existing-key", key: "encrypted-key", version: "v1",
    createdAt: "2026-08-22T12:00:00.000Z", counter: 3,
  };
  firestore.getDocument.mockResolvedValue({
    name: "projects/test/databases/(default)/documents/system/keys",
    updateTime: "2026-08-23T12:00:00.000Z",
    data: { active_key_id: key.id, keys: { [key.id]: key } },
  });
  for (let attempt = 0; attempt < 3; attempt++) {
    firestore.updateDocument.mockRejectedValueOnce(new FirestoreRestError("Conflict", 409));
  }
  await assert.rejects(() => rotateSystemKey(env, identity), /Conflict/);
  assert.equal(firestore.updateDocument.mock.calls.length, 3);
});

test("rotation with an observed stale revision rejects before creating a new key", async () => {
  firestore.getDocument.mockResolvedValue({
    name: "projects/test/databases/(default)/documents/system/keys",
    updateTime: "2026-11-16T10:00:00.123456Z",
    data: {},
  });
  await assert.rejects(
    () => rotateSystemKey(env, identity, "2026-11-16T09:00:00.123456Z"),
    (error: unknown) => error instanceof Error && "status" in error && error.status === 412,
  );
  assert.equal(firestore.getDocument.mock.calls.length, 1);
  assert.equal(firestore.createDocument.mock.calls.length, 0);
  assert.equal(firestore.updateDocument.mock.calls.length, 0);
});

test("rotation never retries against a refreshed revision after a conflicting write", async () => {
  const key = { id: "existing-key", key: "encrypted-key", version: "v1", createdAt: "2026-08-22T12:00:00.000Z", counter: 3 };
  const revision = "2026-11-16T10:00:00.123456Z";
  firestore.getDocument.mockResolvedValue({
    name: "projects/test/databases/(default)/documents/system/keys",
    updateTime: revision,
    data: { active_key_id: key.id, keys: { [key.id]: key } },
  });
  const conflict = new FirestoreRestError("Concurrent change after read", 400, { error: { status: "FAILED_PRECONDITION" } });
  firestore.updateDocument.mockRejectedValueOnce(conflict);
  await assert.rejects(() => rotateSystemKey(env, identity, revision), (error: unknown) => error === conflict);
  assert.equal(firestore.getDocument.mock.calls.length, 1);
  assert.equal(firestore.updateDocument.mock.calls.length, 1);
  assert.deepEqual(firestore.updateDocument.mock.calls[0][2], { expectedUpdateTime: revision });
  assert.equal(firestore.createDocument.mock.calls.length, 0);
});

test("rotation initializes the first system key when the document does not exist", async () => {
  firestore.getDocument.mockResolvedValue(null);
  firestore.createDocument.mockResolvedValue({ id: "keys" });

  const result = await rotateSystemKey(env, identity);

  assert.equal(result.version, "v1");
  assert.match(result.id, /^[0-9a-f-]{36}$/);
  assert.equal(firestore.updateDocument.mock.calls.length, 0);
  assert.deepEqual(firestore.createDocument.mock.calls, [[
    "system",
    {
      active_key_id: result.id,
      keys: {
        [result.id]: {
          id: result.id,
          key: "encrypted-system-key",
          version: "v1",
          createdAt: firestore.createDocument.mock.calls[0]?.[1].keys[result.id].createdAt,
          author: identity.email,
          counter: 0,
          active: true,
        },
      },
    },
    { documentId: "keys" },
  ]]);
});

test("rotation preserves existing keys and advances the version", async () => {
  const existingKey = {
    id: "existing-key-id",
    key: "existing-encrypted-key",
    version: "v1",
    createdAt: "2026-08-22T12:00:00.000Z",
    author: "developer@example.test",
    counter: 3,
    active: true,
  };
  firestore.getDocument.mockResolvedValue({
    name: "projects/test/databases/(default)/documents/system/keys",
    updateTime: "2026-08-23T12:00:00.000Z",
    data: {
      active_key_id: existingKey.id,
      keys: { [existingKey.id]: existingKey },
    },
  });
  firestore.updateDocument.mockResolvedValue({});

  const result = await rotateSystemKey(env, identity);

  assert.equal(result.version, "v2");
  assert.equal(firestore.createDocument.mock.calls.length, 0);
  assert.deepEqual(firestore.updateDocument.mock.calls, [[
    "projects/test/databases/(default)/documents/system/keys",
    {
      active_key_id: result.id,
      keys: {
        [existingKey.id]: { ...existingKey, active: false },
        [result.id]: {
          id: result.id,
          key: "encrypted-system-key",
          version: "v2",
          createdAt: firestore.updateDocument.mock.calls[0]?.[1].keys[result.id].createdAt,
          author: identity.email,
          counter: 0,
          active: true,
        },
      },
    },
    { expectedUpdateTime: "2026-08-23T12:00:00.000Z" },
  ]]);
});
