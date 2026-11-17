import assert from "node:assert/strict";
import { afterEach, test, vi } from "vitest";

const firestoreMocks = vi.hoisted(() => ({
  createDocument: vi.fn(),
  listDocuments: vi.fn(),
}));

vi.mock("../../../workers/shared/api/_lib/firestore", () => ({
  createFirestoreClient: () => firestoreMocks,
}));

import { listAdminAuditEvents, recordAdminAuditEvent } from "./audit";

const env = {} as Env;

afterEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

test("audit events persist only structured operational metadata", async () => {
  firestoreMocks.createDocument.mockResolvedValue({ id: "audit-1" });
  const infoLog = vi.spyOn(console, "info").mockImplementation(() => undefined);

  await recordAdminAuditEvent(
    env,
    {
      action: "dog.updated",
      actor: "administrator@example.test",
      actorRole: "administrator",
      durationMs: 12.6,
      method: "PATCH",
      outcome: "success",
      path: "/api/admin/dogs/123",
      requestId: "ray-123",
      status: 200,
      target: "dogs/123",
    },
    new Date("2026-08-25T18:00:00.000Z"),
  );

  assert.deepEqual(firestoreMocks.createDocument.mock.calls[0], [
    "admin_audit_log",
    {
      action: "dog.updated",
      actor: "administrator@example.test",
      actorRole: "administrator",
      createdAt: "2026-08-25T18:00:00.000Z",
      expiresAt: new Date("2027-02-21T18:00:00.000Z"),
      durationMs: 13,
      method: "PATCH",
      outcome: "success",
      path: "/api/admin/dogs/123",
      requestId: "ray-123",
      status: 200,
      target: "dogs/123",
    },
  ]);
  assert.equal(infoLog.mock.calls.length, 1);
});

test("audit log retrieval is bounded and ordered newest first", async () => {
  const event = {
    action: "media.uploaded",
    actor: "developer@example.test",
    actorRole: "developer",
    createdAt: "2026-08-25T18:00:00.000Z",
    durationMs: 25,
    method: "POST",
    outcome: "success",
    path: "/api/admin/media/upload",
    requestId: "ray-456",
    status: 201,
    target: "cloudinary/dogs",
  };
  firestoreMocks.listDocuments.mockResolvedValue([{
    id: "audit-1",
    name: "projects/test/databases/(default)/documents/admin_audit_log/audit-1",
    data: event,
  }]);

  assert.deepEqual(await listAdminAuditEvents(env), [event]);
  assert.deepEqual(firestoreMocks.listDocuments.mock.calls[0], [
    "admin_audit_log",
    { direction: "DESCENDING", limit: 100, orderBy: "createdAt" },
  ]);
});
