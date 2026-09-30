import assert from "node:assert/strict";
import { test } from "vitest";
import { purgeArchivedDogs, type DogPurgeDependencies } from "./purge";

const cutoff = new Date("2026-10-30T03:00:00.000Z");
const root = "projects/test/databases/(default)/documents/dogs";

function dog(id: string, archivedAt: string, purgeAfter: string) {
  return {
    id,
    name: `${root}/${id}`,
    updateTime: "2026-09-30T00:00:01.000Z",
    data: { archivedAt, purgeAfter },
  };
}

test("dog purge removes only eligible records with their read update times", async () => {
  const documents = [
    dog("expired", "2026-09-29T00:00:00.000Z", "2026-10-29T00:00:00.000Z"),
    dog("newer", "2026-10-01T00:00:00.000Z", "2026-10-31T00:00:00.000Z"),
    dog("restored", "2026-09-29T00:00:00.000Z", "2026-10-29T00:00:00.000Z"),
  ];
  documents[2]!.data.archivedAt = "";
  const deleted: Array<{ name: string; updateTime: string }>[] = [];
  const dependencies: DogPurgeDependencies = {
    createFirestoreClient: () => ({
      async findDocumentsByTimestampBefore(_collection, field, date, limit) {
        assert.equal(field, "purgeAfter");
        assert.equal(date, cutoff);
        assert.equal(limit, 3);
        return documents.filter((document) => Date.parse(document.data.purgeAfter) <= date.getTime());
      },
      async deleteDocumentsIfUnchanged(items) {
        deleted.push(items);
        return { deleted: items.length };
      },
    }),
  };
  const result = await purgeArchivedDogs({}, { cutoff, batchSize: 3 }, dependencies);
  assert.deepEqual(result, {
    batches: 1, cutoff: cutoff.toISOString(), deleted: 1, hasMore: false, matched: 1,
  });
  assert.deepEqual(deleted, [[{ name: `${root}/expired`, updateTime: "2026-09-30T00:00:01.000Z" }]]);
});

test("dog purge dry-run scans without deleting", async () => {
  let deleted = false;
  const dependencies: DogPurgeDependencies = {
    createFirestoreClient: () => ({
      async findDocumentsByTimestampBefore() {
        return [dog("expired", "2026-09-29T00:00:00.000Z", "2026-10-29T00:00:00.000Z")];
      },
      async deleteDocumentsIfUnchanged() {
        deleted = true;
        return { deleted: 1 };
      },
    }),
  };
  const result = await purgeArchivedDogs({}, { cutoff, dryRun: true, batchSize: 1 }, dependencies);
  assert.equal(result.matched, 1);
  assert.equal(result.deleted, 0);
  assert.equal(result.hasMore, true);
  assert.equal(deleted, false);
});
