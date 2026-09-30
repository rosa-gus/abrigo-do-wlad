import assert from "node:assert/strict";
import { test } from "vitest";
import { listDogPurgeCandidates } from "./purge-candidates";

test("candidate scan is read-only and uses each dog's purge timestamp", async () => {
  const now = new Date("2026-10-29T10:00:00.000Z");
  let queriedField = "";
  const candidates = await listDogPurgeCandidates({}, now, 10, {
    async findDocumentsByTimestampBefore(_collection, field, cutoff) {
      queriedField = field;
      assert.equal(cutoff, now);
      return [
        {
          name: "projects/test/databases/(default)/documents/dogs/one",
          id: "one",
          updateTime: "2026-09-29T10:00:01.000Z",
          data: {
            archivedAt: "2026-09-29T10:00:00.000Z",
            purgeAfter: "2026-10-29T10:00:00.000Z",
          },
        },
        {
          name: "projects/test/databases/(default)/documents/dogs/two",
          id: "two",
          updateTime: "2026-09-29T10:00:01.000Z",
          data: { purgeAfter: "2026-10-28T00:00:00.000Z" },
        },
      ];
    },
  });
  assert.equal(queriedField, "purgeAfter");
  assert.deepEqual(candidates, [{
    documentName: "projects/test/databases/(default)/documents/dogs/one",
    dogId: "one",
    archivedAt: "2026-09-29T10:00:00.000Z",
    purgeAfter: "2026-10-29T10:00:00.000Z",
    updateTime: "2026-09-29T10:00:01.000Z",
  }]);
});
