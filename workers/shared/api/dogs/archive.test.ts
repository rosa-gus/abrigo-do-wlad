import assert from "node:assert/strict";
import { test } from "vitest";
import { dogArchiveDates, isDogArchived, isDogPurgeEligible } from "./archive";

test("each dog gets a 30-day deadline from its own archive time", () => {
  const first = dogArchiveDates(new Date("2026-09-29T10:00:00.000Z"));
  const second = dogArchiveDates(new Date("2026-09-30T10:00:00.000Z"));
  assert.equal(first.purgeAfter, "2026-10-29T10:00:00.000Z");
  assert.equal(second.purgeAfter, "2026-10-30T10:00:00.000Z");
  assert.equal(isDogPurgeEligible(first, new Date("2026-10-29T09:59:59.999Z")), false);
  assert.equal(isDogPurgeEligible(first, new Date("2026-10-29T10:00:00.000Z")), true);
  assert.equal(isDogPurgeEligible({
    archivedAt: first.archivedAt,
    purgeAfter: "2026-10-28T10:00:00.000Z",
  }, new Date("2026-11-01T10:00:00.000Z")), false);
  assert.equal(isDogArchived({ archivedAt: null }), false);
  assert.equal(isDogPurgeEligible({ archivedAt: null, purgeAfter: first.purgeAfter }, new Date("2026-11-01")), false);
});
