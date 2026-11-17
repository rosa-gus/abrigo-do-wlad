import { afterEach, expect, test, vi } from "vitest";
import { FirestoreRestClient } from "../../../workers/shared/api/_lib/firestore";
import { handleAdminApi } from "./admin-api";
import type { AccessIdentity } from "./access";

const env = { FIREBASE_PROJECT_ID: "synthetic-project" } as Env;
const identity: AccessIdentity = { email: "developer@example.test", role: "developer", subject: "synthetic-subject" };
const request = (path: string) => new Request(`https://admin.example.test/api/admin/${path}`);
afterEach(() => vi.restoreAllMocks());

test.each(["limit=0", "limit=101", "limit=1.5", "limit=oops", "publicationStatus=unknown", "state=unknown"])("rejects invalid dog filters before querying: %s", async query => {
  const list = vi.spyOn(FirestoreRestClient.prototype, "pageDocuments");
  const response = await handleAdminApi(request(`dogs?${query}`), env, identity);
  expect(response.status).toBe(400);
  expect(list).not.toHaveBeenCalled();
});

test("dog list preserves legacy state, exposes only DTO fields and retains cursor through empty windows", async () => {
  const page = vi.spyOn(FirestoreRestClient.prototype, "pageDocuments").mockResolvedValue({
    items: [{ id: "dog-a", name: "projects/synthetic-project/databases/(default)/documents/dogs/dog-a",
      updateTime: "2026-11-16T12:00:00.123456Z", data: { nome: "Simba", publicationStatus: "draft", privateUnexpected: "must-not-escape" } }],
    nextCursor: "continue-window",
  });
  const active = await handleAdminApi(request("dogs"), env, identity);
  expect(await active.json()).toEqual({ items: [{ nome: "Simba", publicationStatus: "draft", documentId: "dog-a", revision: "2026-11-16T12:00:00.123456Z" }], nextCursor: "continue-window" });
  const archived = await handleAdminApi(request("dogs?state=archived&cursor=previous-window&limit=100"), env, identity);
  expect(await archived.json()).toEqual({ items: [], nextCursor: "continue-window" });
  expect(page).toHaveBeenLastCalledWith("dogs", { limit: 100, cursor: "previous-window", scope: "archived", filters: [] });
});

test("recycle DTO never spreads unknown storage fields", async () => {
  vi.spyOn(FirestoreRestClient.prototype, "pageDocuments").mockResolvedValue({
    items: [{ id: "point-a", name: "projects/synthetic-project/databases/(default)/documents/recycle_points/point-a",
      data: { name: "Ponto", zone: "Sul", privateUnexpected: "must-not-escape" } }], nextCursor: null,
  });
  const response = await handleAdminApi(request("recycle-points"), env, identity);
  expect(await response.json()).toEqual({ items: [{ name: "Ponto", zone: "Sul", id: "point-a" }], nextCursor: null });
});
