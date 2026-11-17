import { expect, test } from "vitest";
import { FirestoreCursorError, FirestoreRestClient } from "./firestore";

test("601 records traverse bounded pages once with a name tie breaker", async () => {
  const root = "projects/page-project/databases/(default)/documents";
  const documents = Array.from({ length: 601 }, (_, index) => ({
    name: `${root}/adoption_application/item-${String(index).padStart(4, "0")}`,
    fields: { expiresAt: { timestampValue: "2099-01-01T00:00:00Z" }, status: { stringValue: "pending" } },
  }));
  const limits: number[] = [];
  const client = new FirestoreRestClient("page-project", {
    tokenProvider: async () => "synthetic",
    fetcher: async (_url, init) => {
      const query = JSON.parse(String(init?.body)).structuredQuery;
      limits.push(query.limit);
      expect(query.orderBy).toEqual([
        { field: { fieldPath: "expiresAt" }, direction: "ASCENDING" },
        { field: { fieldPath: "__name__" }, direction: "ASCENDING" },
      ]);
      const after = query.startAt?.values.at(-1).referenceValue ?? "";
      if (query.startAt) expect(query.startAt.before).toBe(false);
      return Response.json(documents.filter(doc => doc.name > after).slice(0, query.limit).map(document => ({ document })));
    },
  });
  const ids: string[] = [];
  let cursor: string | undefined;
  let calls = 0;
  do {
    const page = await client.pageDocuments("adoption_application", { cursor, orderBy: "expiresAt" });
    ids.push(...page.items.map(document => document.id));
    cursor = page.nextCursor ?? undefined;
    calls++;
    expect(limits.length).toBe(calls);
  } while (cursor);
  expect(ids).toHaveLength(601);
  expect(new Set(ids).size).toBe(601);
  expect(limits).toHaveLength(25);
  expect(limits.every(limit => limit === 26)).toBe(true);
});

test("cursors bind project, collection, ordering and filters before any I/O", async () => {
  let calls = 0;
  const root = "projects/page-project/databases/(default)/documents";
  const fetcher: typeof fetch = async () => {
    calls++;
    return Response.json(["a", "b"].map(id => ({ document: { name: `${root}/dogs/${id}`, fields: {} } })));
  };
  const client = new FirestoreRestClient("page-project", { tokenProvider: async () => "synthetic", fetcher });
  const options = { limit: 1, scope: "active", filters: [{ fieldPath: "publicationStatus", op: "EQUAL" as const, value: "draft" }] };
  const first = await client.pageDocuments("dogs", options);
  expect(first.items).toHaveLength(1);
  expect(first.nextCursor).toBeTruthy();
  const cursor = first.nextCursor!;
  await expect(client.pageDocuments("dogs", { ...options, cursor, scope: "archived" })).rejects.toBeInstanceOf(FirestoreCursorError);
  await expect(client.pageDocuments("recycle_points", { ...options, cursor })).rejects.toBeInstanceOf(FirestoreCursorError);
  await expect(client.pageDocuments("dogs", { ...options, cursor, filters: [] })).rejects.toBeInstanceOf(FirestoreCursorError);
  const otherProject = new FirestoreRestClient("other-project", { tokenProvider: async () => "synthetic", fetcher });
  await expect(otherProject.pageDocuments("dogs", { ...options, cursor })).rejects.toBeInstanceOf(FirestoreCursorError);
  await expect(client.pageDocuments("dogs", { cursor: "bad-cursor" })).rejects.toBeInstanceOf(FirestoreCursorError);
  await expect(client.pageDocuments("dogs", { limit: 101 })).rejects.toThrow(RangeError);
  expect(calls).toBe(1);
});
