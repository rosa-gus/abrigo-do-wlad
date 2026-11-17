import { expect, test, vi } from "vitest";
import { createFirestoreDocumentId, type FirestoreDocument } from "../../../workers/shared/api/_lib/firestore";
import { inventoryLegacyDogIds, resolveAdminDog } from "./dog-identity";

function document(id: string, legacyId?: number): FirestoreDocument<Record<string, unknown>> {
  return { id, name: `projects/test/databases/(default)/documents/dogs/${id}`, data: { id: legacyId }, updateTime: "2026-11-16T10:00:00.000001Z" };
}

test("new canonical dog identities remain distinct under a fixed clock", () => {
  const now = vi.spyOn(Date, "now").mockReturnValue(1_800_000_000_000);
  try {
    const ids = new Set(Array.from({ length: 20 }, () => createFirestoreDocumentId()));
    expect(ids.size).toBe(20);
    for (const id of ids) expect(id).toMatch(/^[A-Za-z0-9]{20}$/);
  } finally { now.mockRestore(); }
});

test("canonical route looks up the original document without consulting legacy numeric fields", async () => {
  const dog = document("123", 456);
  const getDocument = vi.fn().mockResolvedValue(dog);
  const findDocumentsByField = vi.fn();
  expect(await resolveAdminDog({ getDocument, findDocumentsByField }, "doc:123")).toBe(dog);
  expect(getDocument).toHaveBeenCalledWith("dogs/123");
  expect(findDocumentsByField).not.toHaveBeenCalled();
});

test("unique numeric legacy route still resolves the unchanged document", async () => {
  const dog = document("original-public-id", 123);
  const findDocumentsByField = vi.fn().mockResolvedValue([dog]);
  expect(await resolveAdminDog({ getDocument: vi.fn(), findDocumentsByField }, "123")).toBe(dog);
  expect(findDocumentsByField).toHaveBeenCalledWith("dogs", "id", 123, 2);
});

test("ambiguous legacy routes fail explicitly instead of selecting the first document", async () => {
  await expect(resolveAdminDog({ getDocument: vi.fn(), findDocumentsByField: vi.fn().mockResolvedValue([document("a", 123), document("b", 123)]) }, "123"))
    .rejects.toMatchObject({ status: 409 });
});

test.each(["doc:../other", "doc:", "-1", "9007199254740992", "foo", "doc:dogs%2Fa"])("rejects malformed dog route %s", async (id) => {
  const repository = { getDocument: vi.fn(), findDocumentsByField: vi.fn() };
  await expect(resolveAdminDog(repository, id)).rejects.toMatchObject({ status: 400 });
  expect(repository.getDocument).not.toHaveBeenCalled();
  expect(repository.findDocumentsByField).not.toHaveBeenCalled();
});

test("legacy inventory reports all duplicate document IDs without personal fields", () => {
  expect(inventoryLegacyDogIds([document("b", 12), document("c", 13), document("a", 12), document("new")]))
    .toEqual([{ legacyId: 12, documentIds: ["a", "b"] }]);
});
