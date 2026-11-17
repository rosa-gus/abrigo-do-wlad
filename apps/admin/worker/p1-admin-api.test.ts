import assert from "node:assert/strict";
import { afterEach, test, vi } from "vitest";
import { FirestoreRestClient, FirestoreRestError, type FirestoreDocument } from "../../../workers/shared/api/_lib/firestore";
import { decryptDataBatch } from "../../../workers/shared/api/_lib/encryption";
import { recordAdminAuditEvent } from "./audit";
import { handleAdminApi } from "./admin-api";
import type { AccessIdentity } from "./access";

vi.mock("./audit", async (original) => ({
  ...await original<typeof import("./audit")>(),
  recordAdminAuditEvent: vi.fn(async () => undefined),
}));
vi.mock("../../../workers/shared/api/_lib/encryption", async (original) => ({
  ...await original<typeof import("../../../workers/shared/api/_lib/encryption")>(),
  decryptDataBatch: vi.fn(),
}));

const env = { FIREBASE_PROJECT_ID: "synthetic-project", CLOUDINARY_CLOUD_NAME: "synthetic-cloud" } as Env;
const identity: AccessIdentity = { email: "developer@example.test", role: "developer", subject: "synthetic-subject" };
const now = new Date("2026-11-16T12:00:00.000Z");
const revision = "2026-11-16T11:00:00.123456Z";
const oldRevision = "2026-11-16T10:00:00.123456Z";
function doc(id: string, data: Record<string, unknown>, collection = "dogs"): FirestoreDocument<Record<string, unknown>> {
  return { id, name: `projects/synthetic-project/databases/(default)/documents/${collection}/${id}`, updateTime: revision, data };
}
function request(path: string, method = "GET", body?: unknown, expected?: string): Request {
  return new Request(`https://admin.example.test/api/admin/${path}`, {
    method,
    headers: { Origin: "https://admin.example.test", "Content-Type": "application/json",
      ...(expected ? { "If-Match": `"${expected}"` } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}
afterEach(() => { vi.restoreAllMocks(); vi.clearAllMocks(); vi.useRealTimers(); });

const mutations: Array<{ path: string; method: string; body?: unknown }> = [
  { path: "dogs/doc%3Adog-1", method: "PATCH", body: { nome: "Novo nome" } },
  { path: "dogs/doc%3Adog-1", method: "DELETE" },
  { path: "dogs/doc%3Adog-1/archive", method: "POST", body: { reason: "other" } },
  { path: "dogs/doc%3Adog-1/restore", method: "POST" },
  { path: "recycle-points/point-1", method: "PATCH", body: { name: "Novo ponto" } },
  { path: "recycle-points/point-1", method: "DELETE" },
  { path: "adoptions/application-1/status", method: "PATCH", body: { status: "approved" } },
  { path: "system/settings", method: "PATCH", body: { acceptingApplications: true } },
  { path: "notifications", method: "PUT", body: { message: "Aviso", type: "info", expiration: "1h" } },
  { path: "notifications", method: "DELETE" },
];

for (const mutation of mutations) {
  for (const [label, expected, status] of [["missing", undefined, 428], ["stale", oldRevision, 412]] as const) {
    test(`${mutation.method} ${mutation.path} rejects ${label} revision without changing data`, async () => {
      vi.spyOn(FirestoreRestClient.prototype, "getDocument").mockResolvedValue(doc("resource", {
        nome: "Original", name: "Original", publicationStatus: "draft", schemaVersion: 1,
        submittedAt: "2026-11-01T12:00:00Z", expiresAt: "2026-12-01T12:00:00Z", status: "pending",
      }));
      const update = vi.spyOn(FirestoreRestClient.prototype, "updateDocument");
      const create = vi.spyOn(FirestoreRestClient.prototype, "createDocument");
      const remove = vi.spyOn(FirestoreRestClient.prototype, "deleteDocumentsIfUnchanged");
      const atomic = vi.spyOn(FirestoreRestClient.prototype, "commitAtomic");
      const increment = vi.spyOn(FirestoreRestClient.prototype, "updateDocumentAndIncrementField");
      const response = await handleAdminApi(request(mutation.path, mutation.method, mutation.body, expected), env, identity);
      assert.equal(response.status, status, await response.text());
      for (const write of [update, create, remove, atomic, increment]) assert.equal(write.mock.calls.length, 0);
      assert.equal(vi.mocked(decryptDataBatch).mock.calls.length, 0);
    });
  }
}

test("production recycling delete commits the version observed by the client", async () => {
  const stored = doc("point-1", { name: "Ponto", publicationStatus: "draft", schemaVersion: 1 }, "recycle_points");
  vi.spyOn(FirestoreRestClient.prototype, "getDocument").mockResolvedValue(stored);
  const remove = vi.spyOn(FirestoreRestClient.prototype, "deleteDocumentsIfUnchanged").mockResolvedValue({ deleted: 1 });
  const response = await handleAdminApi(request("recycle-points/point-1", "DELETE", undefined, revision), env, identity);
  assert.equal(response.status, 204);
  assert.deepEqual(remove.mock.calls[0][0], [{ name: stored.name, updateTime: revision }]);
});

test.each(["FAILED_PRECONDITION", "ABORTED"])("post-read Firestore %s uses the conflict contract instead of a generic failure", async (status) => {
  vi.spyOn(FirestoreRestClient.prototype, "getDocument").mockResolvedValue(doc("point-1", { name: "Ponto", publicationStatus: "draft", schemaVersion: 1 }, "recycle_points"));
  const update = vi.spyOn(FirestoreRestClient.prototype, "updateDocument").mockRejectedValue(
    new FirestoreRestError("Concurrent change", 400, { error: { status } }),
  );
  const response = await handleAdminApi(request("recycle-points/point-1", "PATCH", { name: "Novo ponto" }, revision), env, identity);
  assert.equal(update.mock.calls.length, 1);
  assert.equal(response.status, 412);
});

function adoption(id: string, expiresAt: unknown): FirestoreDocument<Record<string, unknown>> {
  return doc(id, { submittedAt: "2026-11-01T12:00:00Z", expiresAt, status: "pending", sensitive: `encrypted-${id}`, keyVersion: "key-1" }, "adoption_application");
}

test("production adoption list filters the query and decrypts only unexpired valid records", async () => {
  vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(now);
  const live = adoption("live", "2026-11-17T12:00:00Z");
  const list = vi.spyOn(FirestoreRestClient.prototype, "pageDocuments").mockResolvedValue({ items: [
    adoption("exact", now.toISOString()), adoption("old", "2026-11-15T00:00:00Z"),
    adoption("invalid", "not-a-date"), adoption("missing", undefined), live,
  ], nextCursor: null });
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.mocked(decryptDataBatch).mockResolvedValue([{ nome_adotante: "Live candidate", telefone: "123", secretExtra: "not-in-summary" }]);
  const response = await handleAdminApi(request("adoptions"), env, identity);
  assert.equal(response.status, 200);
  const { items: body } = await response.json() as { items: Record<string, unknown>[] };
  assert.deepEqual(body.map(item => item.id), ["live"]);
  assert.equal(body[0].secretExtra, undefined);
  assert.equal(body[0].sensitive, undefined);
  assert.deepEqual(list.mock.calls[0], ["adoption_application", {
    limit: 25, cursor: undefined, filters: [{ fieldPath: "expiresAt", op: "GREATER_THAN", value: now }], orderBy: "expiresAt", movingTimestampCutoff: true,
  }]);
  assert.deepEqual(vi.mocked(decryptDataBatch).mock.calls[0][0], [{ encryptedData: "encrypted-live", keyVersion: "key-1" }]);
});

for (const expiry of [now.toISOString(), "2026-11-15T00:00:00Z", "invalid-date", undefined]) {
  test(`production adoption detail never decrypts unavailable expiry ${String(expiry)}`, async () => {
    vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(now);
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(FirestoreRestClient.prototype, "getDocument").mockResolvedValue(adoption("expired", expiry));
    const response = await handleAdminApi(request("adoptions/expired"), env, identity);
    assert.equal(response.status, 404);
    assert.equal(vi.mocked(decryptDataBatch).mock.calls.length, 0);
  });
}

test("production detail refuses plaintext if its deadline is reached during decryption", async () => {
  vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(now);
  const expiry = new Date(now.getTime() + 1);
  vi.spyOn(FirestoreRestClient.prototype, "getDocument").mockResolvedValue(adoption("live", expiry.toISOString()));
  vi.mocked(decryptDataBatch).mockImplementation(async () => {
    vi.setSystemTime(expiry);
    return [{ nome_adotante: "Must not be released" }];
  });
  const response = await handleAdminApi(request("adoptions/live"), env, identity);
  assert.equal(response.status, 404);
  assert.ok(!(await response.text()).includes("Must not be released"));
});

test("production dashboard filters expiring candidates before decrypting and counts only active expiry", async () => {
  vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(now);
  vi.spyOn(FirestoreRestClient.prototype, "listDocuments").mockResolvedValue([]);
  vi.spyOn(FirestoreRestClient.prototype, "getDocument").mockResolvedValue(null);
  const count = vi.spyOn(FirestoreRestClient.prototype, "countDocuments").mockResolvedValue(1);
  vi.spyOn(FirestoreRestClient.prototype, "findDocumentsByTimestampRange").mockResolvedValue([
    adoption("exact", now.toISOString()), adoption("old", "2026-11-15T12:00:00Z"), adoption("live", "2026-11-17T12:00:00Z"),
  ]);
  vi.mocked(decryptDataBatch).mockResolvedValue([{ nome_adotante: "Live candidate" }]);
  const response = await handleAdminApi(request("dashboard"), env, identity);
  assert.equal(response.status, 200);
  const body = await response.json() as { metrics: { adoptions: number }; expiringAdoptions: { id: string }[] };
  assert.equal(body.metrics.adoptions, 1);
  assert.deepEqual(body.expiringAdoptions.map(item => item.id), ["live"]);
  assert.ok(count.mock.calls.some(call => call[0] === "adoption_application" && call[1]?.timestampAfter?.cutoff.getTime() === now.getTime()));
  assert.deepEqual(vi.mocked(decryptDataBatch).mock.calls[0][0], [{ encryptedData: "encrypted-live", keyVersion: "key-1" }]);
});

test("two real POST routes with a fixed clock create distinct canonical dog identities that resolve individually", async () => {
  vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(now);
  const documents = new Map<string, FirestoreDocument<Record<string, unknown>>>();
  const create = vi.spyOn(FirestoreRestClient.prototype, "createDocument").mockImplementation(async (collection, data, options) => {
    const id = options?.documentId;
    assert.equal(collection, "dogs");
    assert.ok(id);
    assert.ok(!documents.has(`dogs/${id}`));
    const stored = doc(id, data);
    documents.set(`dogs/${id}`, stored);
    return { id, name: stored.name, updateTime: revision };
  });
  vi.spyOn(FirestoreRestClient.prototype, "getDocument").mockImplementation(async (path) => documents.get(path) ?? null);
  const first = await handleAdminApi(request("dogs", "POST", { nome: "Primeiro" }), env, identity);
  const second = await handleAdminApi(request("dogs", "POST", { nome: "Segundo" }), env, identity);
  assert.equal(first.status, 201); assert.equal(second.status, 201);
  const a = await first.json() as { id: string; documentId: string };
  const b = await second.json() as { id: string; documentId: string };
  assert.notEqual(a.documentId, b.documentId);
  assert.equal(a.id, a.documentId); assert.equal(b.id, b.documentId);
  assert.equal(create.mock.calls.length, 2);
  for (const [created, name] of [[a, "Primeiro"], [b, "Segundo"]] as const) {
    const response = await handleAdminApi(request(`dogs/${encodeURIComponent(`doc:${created.documentId}`)}`), env, identity);
    assert.equal(response.status, 200);
    const body = await response.json() as { nome: string; documentId: string };
    assert.equal(body.nome, name); assert.equal(body.documentId, created.documentId);
    assert.equal(response.headers.get("ETag"), `"${revision}"`);
  }
});


test("audit persistence failure denies sensitive detail before Firestore read or decryption", async () => {
  vi.mocked(recordAdminAuditEvent).mockRejectedValueOnce(new Error("audit unavailable"));
  const read = vi.spyOn(FirestoreRestClient.prototype, "getDocument");
  const response = await handleAdminApi(request("adoptions/application-1"), env, identity);
  assert.equal(response.status, 500);
  assert.equal(read.mock.calls.length, 0);
  assert.equal(vi.mocked(decryptDataBatch).mock.calls.length, 0);
});
