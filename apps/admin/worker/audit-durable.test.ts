import { expect, test, vi } from "vitest";

const state = vi.hoisted(() => ({
  calls: [] as Array<{ writes: Array<Record<string, unknown>> }>,
  status: 200,
}));
vi.mock("@abrigo/backend/adapters/firestore", async importOriginal => {
  const actual = await importOriginal<typeof import("@abrigo/backend/adapters/firestore")>();
  return { ...actual, createFirestoreClient: (_env: Env, options: import("@abrigo/backend/adapters/firestore").FirestoreRestClientOptions) =>
    new actual.FirestoreRestClient("test", { ...options, tokenProvider: async () => "synthetic", fetcher: async (_input, init) => {
      state.calls.push(JSON.parse(init?.body as string));
      return Response.json(state.status === 200 ? { writeResults: [{ updateTime: "2026-11-17T10:00:00Z" }] } : { error: { status: "FAILED_PRECONDITION" } }, { status: state.status });
    } }),
  };
});
import { createAuditedFirestoreClient } from "./audit";

const input = { action: "dog.updated" as const, actor: "admin@example.test", actorSubject: "subject-123", actorRole: "administrator" as const,
  method: "PATCH" as const, path: "/api/admin/dogs/doc:dog1", requestId: "request-123", target: "dogs/dog1" };

test("dog write, subject audit and publication recovery job share one preconditioned commit", async () => {
  state.calls = [];
  state.status = 200;
  const client = createAuditedFirestoreClient({} as Env, input);
  await client.updateDocument("projects/test/databases/(default)/documents/dogs/dog1", { nome: "Dog" }, { expectedUpdateTime: "2026-11-17T09:00:00Z" });
  expect(state.calls).toHaveLength(1);
  const writes = state.calls[0].writes;
  expect(writes).toHaveLength(3);
  expect(writes[0].currentDocument).toEqual({ updateTime: "2026-11-17T09:00:00Z" });
  const audit = writes[1].update as { name: string; fields: Record<string, unknown> };
  const outbox = writes[2].update as { name: string; fields: Record<string, unknown> };
  expect(audit.name).toContain("/admin_audit_log/");
  expect(audit.fields.actorSubject).toEqual({ stringValue: "subject-123" });
  expect(audit.fields.expiresAt).toHaveProperty("timestampValue");
  expect(JSON.stringify(audit.fields)).not.toContain("Dog");
  expect(outbox.name).toContain("/publication_outbox/");
  expect(outbox.fields.nextAttemptAt).toHaveProperty("timestampValue");
});

test("a precondition failure rejects the single commit and never writes a separate success event", async () => {
  state.calls = [];
  state.status = 412;
  const client = createAuditedFirestoreClient({} as Env, input);
  await expect(client.updateDocument("projects/test/databases/(default)/documents/dogs/dog1", { nome: "Dog" }, { expectedUpdateTime: "2026-11-17T09:00:00Z" })).rejects.toThrow();
  expect(state.calls).toHaveLength(1);
  expect(state.calls[0].writes).toHaveLength(3);
});

test("canonical creation keeps the atomic audit protocol", async () => {
  state.calls = [];
  state.status = 200;
  const { handleAdminApi } = await import("./admin-api");
  const response = await handleAdminApi(new Request("https://admin.test/api/admin/recycle-points", {
    method: "POST", headers: { Origin: "https://admin.test", "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Test draft", publicationStatus: "draft" }),
  }), {} as Env, { email: input.actor, subject: input.actorSubject, role: "administrator" });
  expect(response.status).toBe(201);
  expect(state.calls[0].writes).toHaveLength(2);
  expect((state.calls[0].writes[1].update as { name: string }).name).toContain("/admin_audit_log/");
});


test("unknown creation aliases cannot write documents or audit events", async () => {
  state.calls = [];
  state.status = 200;
  const { handleAdminApi } = await import("./admin-api");
  const response = await handleAdminApi(new Request("https://admin.test/api/legacy/recycle-points", {
    method: "POST", headers: { Origin: "https://admin.test", "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Test draft", publicationStatus: "draft" }),
  }), {} as Env, { email: input.actor, subject: input.actorSubject, role: "administrator" });
  expect(response.status).toBe(404);
  expect(state.calls).toHaveLength(0);
});
