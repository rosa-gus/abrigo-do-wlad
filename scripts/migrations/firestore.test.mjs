import { expect, test, vi } from "vitest";
import { createMigrationStore, decodeMetadata, encodeMetadata, metadataWrite } from "./firestore.mjs";

function setup(fetcher) {
  return createMigrationStore({ project: "test-project", tokenProvider: async () => "synthetic-token", fetcher });
}

test("transport paginates by document name and keeps the raw Firestore values", async () => {
  const root = "projects/test-project/databases/(default)/documents";
  const document = { name: `${root}/dogs/b`, updateTime: "2026-11-01T12:00:00.000001Z",
    fields: { count: { integerValue: "9223372036854775807" } } };
  const fetcher = vi.fn(async () => Response.json([{ document }]));
  const page = await setup(fetcher).page("dogs", `${root}/dogs/a`, 50);
  expect(page).toEqual([document]);
  const [url, options] = fetcher.mock.calls[0];
  expect(url).toBe(`https://firestore.googleapis.com/v1/${root}:runQuery`);
  expect(options.headers.Authorization).toBe("Bearer synthetic-token");
  expect(JSON.parse(options.body).structuredQuery).toEqual({
    from: [{ collectionId: "dogs" }],
    orderBy: [{ field: { fieldPath: "__name__" }, direction: "ASCENDING" }], limit: 50,
    startAt: { values: [{ referenceValue: `${root}/dogs/a` }], before: false },
  });
});

test("transport commits document masks and preconditions through the atomic endpoint", async () => {
  const fetcher = vi.fn(async () => Response.json({ writeResults: [{ updateTime: "2026-11-01T12:00:00Z" }] }));
  const store = setup(fetcher);
  const write = {
    update: { name: `${store.root}/dogs/a`, fields: { name: { stringValue: "Nina" } } },
    updateMask: { fieldPaths: ["name", "nome"] },
    currentDocument: { updateTime: "2026-11-01T00:00:00.123456Z" },
  };
  await store.commit([write]);
  expect(fetcher.mock.calls[0][0]).toBe(`https://firestore.googleapis.com/v1/${store.root}:commit`);
  expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({ writes: [write] });
});

test("history creation and updates use explicit compare-and-set conditions", () => {
  const data = { status: "running", attempts: 1, after: null, checkpoint: { collection: 0 } };
  const created = metadataWrite("history", data, null);
  expect(created.currentDocument).toEqual({ exists: false });
  expect(decodeMetadata(created.update)).toEqual(data);
  expect(metadataWrite("history", data, { updateTime: "2026-11-01T00:00:00Z" }).currentDocument)
    .toEqual({ updateTime: "2026-11-01T00:00:00Z" });
  expect(() => encodeMetadata({ counter: NaN })).toThrow();
});

test("transport rejects cross-database writes, invalid cursors and oversized batches before fetch", async () => {
  const fetcher = vi.fn();
  const store = setup(fetcher);
  await expect(store.commit([{ update: { name: "projects/other/databases/(default)/documents/dogs/a" } }])).rejects.toThrow();
  await expect(store.page("dogs", `${store.root}/recycle_points/a`)).rejects.toThrow("cursor");
  await expect(store.page("dogs", null, 101)).rejects.toThrow("Batch size");
  await expect(store.commit(Array(103).fill({ update: { name: `${store.root}/dogs/a` } }))).rejects.toThrow("batch");
  await expect(store.commit([{ update: { name: `${store.root}/dogs/a`, fields: { large: { stringValue: "x".repeat(8 * 1024 * 1024) } } } }])).rejects.toThrow("8 MiB");
  expect(fetcher).not.toHaveBeenCalled();
});

test("transport exposes error codes for conflict handling without leaking upstream bodies", async () => {
  const store = setup(async () => Response.json({ error: { status: "FAILED_PRECONDITION", message: "private document value" } }, { status: 400 }));
  await expect(store.get("dogs/a")).rejects.toMatchObject({ status: 400, code: "FAILED_PRECONDITION" });
  await expect(store.get("dogs/a")).rejects.not.toThrow("private document value");
  expect(await setup(async () => new Response(null, { status: 404 })).get("dogs/missing")).toBeNull();
});
