import { afterEach, beforeEach, expect, test, vi } from "vitest";
import productionWorker from "./index";
import localWorker, { authenticateLocalRequest } from "./local";

const firestore = vi.hoisted(() => ({
  createDocument: vi.fn<(collection: string, data: Record<string, unknown>) => Promise<{ id: string }>>(async () => ({ id: "point-1" })),
  getDocument: vi.fn(async () => ({ id: "point-1", name: "documents/recycle_points/point-1", data: {} })),
  listDocuments: vi.fn(async () => []),
  updateDocument: vi.fn(async () => ({})),
  deleteDocument: vi.fn(async () => ({})),
}));
vi.mock("../../../workers/shared/api/_lib/firestore", () => ({
  createFirestoreClient: vi.fn(() => firestore),
}));

const env = {
  APP_ENV: "local",
  FIREBASE_PROJECT_ID: "abrigo-do-wlad-dev",
  FIREBASE_CLIENT_EMAIL: "local-admin@abrigo-do-wlad-dev.iam.gserviceaccount.com",
  KV: {} as KVNamespace,
  UPLOAD_RATE_LIMITER: { limit: vi.fn(async () => ({ success: true })) },
  ASSETS: {
    fetch: vi.fn(async () => new Response("local asset")),
    connect() { throw new Error("Unavailable in tests"); },
  },
} satisfies Env;
const pendingWork: Promise<unknown>[] = [];
const ctx = { waitUntil: vi.fn((promise: Promise<unknown>) => { pendingWork.push(promise); }) };

function request(path = "/api/session", init: RequestInit = {}) {
  return new Request(`http://127.0.0.1:5174${path}`, init);
}

beforeEach(() => {
  vi.clearAllMocks();
  pendingWork.length = 0;
  vi.stubGlobal("__ADMIN_LOCAL_WORKER__", true);
  vi.stubGlobal("__ADMIN_LOCAL_ROLE__", "administrator");
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  vi.spyOn(console, "info").mockImplementation(() => undefined);
  vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("External network forbidden"); }));
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

test("local session authenticates as administrator without Access", async () => {
  const response = await localWorker.fetch(request(), env, ctx);
  expect(response.status).toBe(200);
  await expect(response.json()).resolves.toEqual({ email: "local-administrator@example.test", role: "administrator" });
  expect(fetch).not.toHaveBeenCalled();
});

test.each([false, undefined])("local entry fails closed without Vite enablement: %s", async (flag) => {
  vi.stubGlobal("__ADMIN_LOCAL_WORKER__", flag);
  expect((await localWorker.fetch(request(), env, ctx)).status).toBe(401);
});

test.each([
  { ...env, FIREBASE_PROJECT_ID: "abrigo-do-wlad" },
  { ...env, FIREBASE_PROJECT_ID: undefined },
  { ...env, APP_ENV: undefined },
  { ...env, FIREBASE_CLIENT_EMAIL: "admin@abrigo-do-wlad.iam.gserviceaccount.com" },
])("refuses incorrect project, environment or service account", async (bindings) => {
  expect((await localWorker.fetch(request(), bindings as Env, ctx)).status).toBe(401);
  expect(firestore.createDocument).not.toHaveBeenCalled();
});

test.each([
  "https://127.0.0.1:5174/api/session",
  "http://admin.example.test:5174/api/session",
  "http://127.0.0.1:8080/api/session",
])("refuses requests outside its loopback origin: %s", async (url) => {
  expect((await localWorker.fetch(new Request(url), env, ctx)).status).toBe(401);
});

test.each([
  ["Host", "admin.example.test"],
  ["Origin", "https://foreign.example.test"],
  ["X-Forwarded-Host", "external.example.test"],
  ["Forwarded", "host=127.0.0.1:5174"],
  ["CF-Connecting-IP", "198.51.100.1"],
])("refuses foreign origins and forwarded requests", async (name, value) => {
  expect((await localWorker.fetch(request("/api/session", { headers: { [name]: value } }), env, ctx)).status).toBe(401);
});

test("production worker still demands JWT even with local globals and bindings", async () => {
  expect((await productionWorker.fetch(request(), env, ctx)).status).toBe(401);
  expect((await productionWorker.fetch(request("/index.html"), env, ctx)).status).toBe(401);
  expect(env.ASSETS.fetch).not.toHaveBeenCalled();
});

test("accepts the loopback headers added internally by Cloudflare Vite", async () => {
  const response = await localWorker.fetch(request("/api/session", {
    headers: { "X-Forwarded-Host": "127.0.0.1:5174", "CF-Connecting-IP": "127.0.0.1" },
  }), env, ctx);
  expect(response.status).toBe(200);
});

test("local identity preserves developer-only authorization", async () => {
  expect((await localWorker.fetch(request("/api/admin/audit-log"), env, ctx)).status).toBe(403);
  vi.stubGlobal("__ADMIN_LOCAL_ROLE__", "developer");
  expect((await localWorker.fetch(request("/api/admin/audit-log"), env, ctx)).status).toBe(200);
  expect(firestore.listDocuments).toHaveBeenCalled();
  vi.stubGlobal("__ADMIN_LOCAL_ROLE__", "owner");
  await expect(authenticateLocalRequest(request(), env)).rejects.toThrow("role is invalid");
});

test("local CRUD still rejects mutations without Origin and invalid payloads", async () => {
  const path = "/api/admin/recycle-points";
  expect((await localWorker.fetch(request(path, { method: "POST" }), env, ctx)).status).toBe(403);
  const response = await localWorker.fetch(request(path, {
    method: "POST",
    headers: { Origin: "http://127.0.0.1:5174", "Content-Type": "application/json" },
    body: "{}",
  }), env, ctx);
  expect(response.status).toBe(400);
  expect(firestore.createDocument.mock.calls.every(([collection]) => collection === "admin_audit_log")).toBe(true);
});

test("local CRUD reaches persistence and audit with the local identity", async () => {
  const response = await localWorker.fetch(request("/api/admin/recycle-points/point-1", {
    method: "DELETE",
    headers: { Origin: "http://127.0.0.1:5174" },
  }), env, ctx);
  expect(response.status).toBe(204);
  expect(firestore.deleteDocument).toHaveBeenCalledOnce();
  await Promise.all(pendingWork);
  expect(firestore.createDocument).toHaveBeenCalledWith("admin_audit_log", expect.objectContaining({
    actor: "local-administrator@example.test", actorRole: "administrator", outcome: "success",
  }));
});
