import { afterEach, expect, test, vi } from "vitest";
import * as api from "./api";
import { archiveDog, deleteDraftDog, dogRouteId, getDogById, restoreDog, updateDog } from "./dogs";

afterEach(() => vi.restoreAllMocks());

const revision = "2026-11-16T10:00:00.123456Z";

test("dog mutations use canonical document identity and the exact revision the user viewed", async () => {
  const request = vi.spyOn(api, "apiRequest").mockResolvedValue({ ok: true });
  const id = dogRouteId({ documentId: "same-name-but-unique" });
  await updateDog(id, { nome: "Nina", expectedUpdateTime: revision });
  await archiveDog(id, false, revision);
  await restoreDog(id, revision);
  await deleteDraftDog(id, revision);
  expect(request.mock.calls.map(([path]) => path)).toEqual([
    "/api/admin/dogs/doc%3Asame-name-but-unique",
    "/api/admin/dogs/doc%3Asame-name-but-unique/archive",
    "/api/admin/dogs/doc%3Asame-name-but-unique/restore",
    "/api/admin/dogs/doc%3Asame-name-but-unique",
  ]);
  for (const [, init] of request.mock.calls) {
    expect(init?.headers).toEqual({ "If-Match": `"${revision}"` });
  }
});

test("absent revision never silently reloads current data before overwriting it", async () => {
  const request = vi.spyOn(api, "apiRequest");
  await expect(archiveDog("doc:a", false, undefined)).rejects.toMatchObject({ status: 428 });
  await expect(restoreDog("doc:a", undefined)).rejects.toMatchObject({ status: 428 });
  await expect(deleteDraftDog("doc:a", undefined)).rejects.toMatchObject({ status: 428 });
  await expect(updateDog("doc:a", { nome: "Nina" })).rejects.toMatchObject({ status: 428 });
  expect(request).not.toHaveBeenCalled();
});

test("a stale revision is returned to the caller without retry", async () => {
  const request = vi.spyOn(api, "apiRequest").mockRejectedValue(new api.ApiError(412, "Recarregue e revise."));
  await expect(deleteDraftDog("doc:a", revision)).rejects.toMatchObject({ status: 412 });
  expect(request).toHaveBeenCalledTimes(1);
});

test("canonical records do not need the legacy timestamp field", async () => {
  vi.spyOn(api, "apiRequest").mockResolvedValue({ documentId: "new-dog", nome: "Nina", revision });
  const dog = await getDogById("doc:new-dog");
  expect(dog).toMatchObject({ documentId: "new-dog", revision });
  expect(dog).not.toHaveProperty("id");
});
