import { afterEach, expect, test, vi } from "vitest";
import { FirestoreRestClient } from "../../../workers/shared/api/_lib/firestore";
import { handleAdminApi } from "./admin-api";
import type { AccessIdentity } from "./access";

vi.mock("@abrigo/backend/adapters/admin/audit", async (original) => ({
  ...await original<typeof import("@abrigo/backend/adapters/admin/audit")>(),
  recordAdminAuditEvent: vi.fn(async () => undefined),
}));

const env = { FIREBASE_PROJECT_ID: "synthetic-project" } as Env;
const developer: AccessIdentity = { email: "developer@example.test", role: "developer", subject: "synthetic-developer" };
const revision = "2026-11-16T10:00:00.123456Z";

afterEach(() => vi.restoreAllMocks());

test.each([
  { expected: undefined, status: 428, reads: 0 },
  { expected: "2026-11-16T09:00:00.123456Z", status: 412, reads: 1 },
])("production key rotation rejects missing/stale observed revision ($status) without changing keys", async ({ expected, status, reads }) => {
  const get = vi.spyOn(FirestoreRestClient.prototype, "getDocument").mockResolvedValue({
    id: "keys", name: "projects/synthetic-project/databases/(default)/documents/system/keys", updateTime: revision,
    data: {},
  });
  const create = vi.spyOn(FirestoreRestClient.prototype, "createDocument");
  const update = vi.spyOn(FirestoreRestClient.prototype, "updateDocument");
  const response = await handleAdminApi(new Request("https://admin.example.test/api/admin/system-keys/rotate", {
    method: "POST", headers: { Origin: "https://admin.example.test", ...(expected ? { "If-Match": `"${expected}"` } : {}) },
  }), env, developer);
  expect(response.status).toBe(status);
  expect(get).toHaveBeenCalledTimes(reads);
  expect(create).not.toHaveBeenCalled();
  expect(update).not.toHaveBeenCalled();
});

test("key metadata exposes the exact current document revision without encryption material", async () => {
  vi.spyOn(FirestoreRestClient.prototype, "getDocument").mockResolvedValue({
    id: "keys", name: "projects/synthetic-project/databases/(default)/documents/system/keys", updateTime: revision,
    data: { active_key_id: "key-1", keys: { "key-1": {
      id: "key-1", key: "never-return-this-ciphertext", version: "v1", createdAt: "2026-11-15T00:00:00Z",
    } } },
  });
  const response = await handleAdminApi(new Request("https://admin.example.test/api/admin/system-keys"), env, developer);
  expect(response.status).toBe(200);
  expect(response.headers.get("ETag")).toBe(`"${revision}"`);
  const payload = await response.json();
  expect(payload).toEqual([{ id: "key-1", version: "v1", createdAt: "2026-11-15T00:00:00Z", author: null, counter: 0, active: true }]);
  expect(JSON.stringify(payload)).not.toContain("never-return-this-ciphertext");
});
