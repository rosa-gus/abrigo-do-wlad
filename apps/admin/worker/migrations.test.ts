import { beforeEach, expect, test, vi } from "vitest";
import { handleAdminApi } from "./admin-api";
import { recordAdminAuditEvent } from "./audit";
import { applyMigrationBatch, migrationStatus, migrationTarget, previewMigrations } from "../../../scripts/migrations/worker-service.mjs";

vi.mock("../../../scripts/migrations/worker-service.mjs", async importOriginal => ({
  ...await importOriginal<typeof import("../../../scripts/migrations/worker-service.mjs")>(),
  migrationStatus: vi.fn(), previewMigrations: vi.fn(), applyMigrationBatch: vi.fn(),
}));
vi.mock("./audit", async importOriginal => ({
  ...await importOriginal<typeof import("./audit")>(),
  recordAdminAuditEvent: vi.fn().mockResolvedValue(undefined),
}));

const env = { APP_ENV: "production", FIREBASE_PROJECT_ID: "production-project" } as Env;
const developer = { role: "developer", email: "dev@example.test", subject: "dev" } as const;
const administrator = { ...developer, role: "administrator" } as const;
const target = migrationTarget(env);

function request(path = "", body?: unknown, origin = "https://admin.example.test") {
  return new Request(`https://admin.example.test/api/admin/migrations${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: { Origin: origin, "Content-Type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(migrationStatus).mockResolvedValue({ ...target, migrations: [] });
  vi.mocked(previewMigrations).mockResolvedValue({ counts: [], cursor: null });
  vi.mocked(applyMigrationBatch).mockResolvedValue({ ...target, migrations: [] });
});

test("every migration route rejects administrators before accessing the database", async () => {
  for (const path of ["", "/plan", "/apply"]) {
    const response = await handleAdminApi(request(path, path ? { project: target.project, release: target.release } : undefined), env, administrator);
    expect(response.status).toBe(403);
  }
  expect(migrationStatus).not.toHaveBeenCalled();
  expect(previewMigrations).not.toHaveBeenCalled();
  expect(applyMigrationBatch).not.toHaveBeenCalled();
});

test("developers can read the target and preview without applying", async () => {
  expect(await (await handleAdminApi(request(), env, developer)).json()).toEqual({ ...target, migrations: [] });
  const result = await handleAdminApi(request("/plan", { project: target.project, release: target.release, cursor: null }), env, developer);
  expect(result.status).toBe(200);
  expect(previewMigrations).toHaveBeenCalledWith(env, null);
  expect(applyMigrationBatch).not.toHaveBeenCalled();
});

test("production project and migration release must match, and caller cannot inject credentials", async () => {
  for (const body of [
    { project: "development-project", release: target.release },
    { project: target.project, release: "0".repeat(64) },
    { project: target.project, release: target.release, FIREBASE_PRIVATE_KEY: "injected" },
  ]) {
    const response = await handleAdminApi(request("/apply", body), env, developer);
    expect([400, 409]).toContain(response.status);
  }
  expect(applyMigrationBatch).not.toHaveBeenCalled();
});

test("cross-origin mutations, invalid preview cursors and wrong HTTP methods are rejected", async () => {
  const body = { project: target.project, release: target.release };
  expect((await handleAdminApi(request("/apply", body, "https://other.test"), env, developer)).status).toBe(403);
  expect((await handleAdminApi(request("/apply"), env, developer)).status).toBe(405);
  expect((await handleAdminApi(request("/plan", { ...body, cursor: { collectionIndex: 0, after: "projects/other/databases/(default)/documents/dogs/a" } }), env, developer)).status).toBe(400);
  expect(applyMigrationBatch).not.toHaveBeenCalled();
  expect(previewMigrations).not.toHaveBeenCalled();
});

test("application uses Worker bindings and the authenticated developer, and records an audit event", async () => {
  const waits: Promise<unknown>[] = [];
  const response = await handleAdminApi(request("/apply", { project: target.project, release: target.release }), env, developer,
    undefined, { waitUntil: promise => { waits.push(promise); } });
  await Promise.all(waits);
  // The migration engine receives the human actor rather than the service-account identity.
  expect(response.status).toBe(200);
  expect(applyMigrationBatch).toHaveBeenCalledWith(env, developer.email);
  expect(recordAdminAuditEvent).toHaveBeenCalledWith(env, expect.objectContaining({
    action: "migration.batch.applied", actor: developer.email, outcome: "success",
  }));
});

test("locks and failures are recoverable and do not expose upstream values", async () => {
  vi.mocked(previewMigrations).mockRejectedValue(new Error("private document value"));
  const response = await handleAdminApi(request("/plan", { project: target.project, release: target.release }), env, developer);
  expect(response.status).toBe(503);
  expect(JSON.stringify(await response.json())).not.toContain("private document value");
  vi.mocked(applyMigrationBatch).mockRejectedValue(new Error("Another migration runner holds the database lock."));
  const locked = await handleAdminApi(request("/apply", { project: target.project, release: target.release }), env, developer);
  expect(locked.status).toBe(409);
  expect(await locked.json()).toEqual({ error: "Outra execução está usando a trava do banco. Aguarde e tente retomar." });
});
