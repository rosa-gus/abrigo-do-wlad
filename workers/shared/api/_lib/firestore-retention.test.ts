import assert from "node:assert/strict";
import { test } from "vitest";
import { FirestoreRestClient } from "./firestore";

const cutoff = new Date("2026-11-16T10:00:00.000Z");
test("adoption list and dashboard count restrict expiry in Firestore before loading records", async () => {
  const queries: Record<string, unknown>[] = [];
  const client = new FirestoreRestClient("test-project", {
    tokenProvider: async () => "synthetic-token",
    fetcher: async (url, init) => {
      const query = JSON.parse(String(init?.body));
      queries.push(query);
      return String(url).endsWith(":runAggregationQuery")
        ? Response.json([{ result: { aggregateFields: { count: { integerValue: "7" } } } }])
        : Response.json([]);
    },
  });
  await client.listDocuments("adoption_application", {
    orderBy: "submittedAt", direction: "DESCENDING",
    timestampAfter: { fieldPath: "expiresAt", cutoff },
  });
  assert.equal(await client.countDocuments("adoption_application", {
    timestampAfter: { fieldPath: "expiresAt", cutoff },
  }), 7);
  const expectedWhere = { fieldFilter: {
    field: { fieldPath: "expiresAt" }, op: "GREATER_THAN",
    value: { timestampValue: cutoff.toISOString() },
  } };
  const list = queries[0].structuredQuery as Record<string, unknown>;
  assert.deepEqual(list.where, expectedWhere);
  assert.deepEqual(list.orderBy, [
    { field: { fieldPath: "expiresAt" }, direction: "DESCENDING" },
    { field: { fieldPath: "submittedAt" }, direction: "DESCENDING" },
    { field: { fieldPath: "__name__" }, direction: "DESCENDING" },
  ]);
  const aggregation = queries[1].structuredAggregationQuery as { structuredQuery: unknown };
  assert.deepEqual(aggregation.structuredQuery, { from: [{ collectionId: "adoption_application" }], where: expectedWhere });
});

test("timestamp query validates date and field before contacting Firestore", async () => {
  let calls = 0;
  const client = new FirestoreRestClient("test-project", {
    tokenProvider: async () => "synthetic-token",
    fetcher: async () => { calls += 1; return Response.json([]); },
  });
  await assert.rejects(() => client.listDocuments("adoption_application", {
    timestampAfter: { fieldPath: "expiresAt", cutoff: new Date("bad") },
  }), /valid Date/);
  await assert.rejects(() => client.countDocuments("adoption_application", {
    timestampAfter: { fieldPath: "invalid/field", cutoff },
  }), /invalid characters/);
  assert.equal(calls, 0);
});
