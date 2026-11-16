import assert from "node:assert/strict";
import { test, vi } from "vitest";
import type { FirestoreDocument } from "../../../workers/shared/api/_lib/firestore";
import {
  AdoptionUnavailableError, filterReadableAdoptions, requireReadableAdoption,
  serializeReadableAdoptions,
} from "./adoption-access";

const now = new Date("2026-11-16T10:00:00.000Z");
function document(id: string, expiresAt: unknown): FirestoreDocument<Record<string, unknown>> {
  return { id, name: `adoption_application/${id}`, data: { expiresAt, sensitive: "secret-ciphertext" } };
}

test("read access excludes expired records at the exact deadline and fails closed on invalid dates", () => {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  try {
    const live = document("live", "2026-11-16T10:00:00.001Z");
    const records = [live, document("exact", now.toISOString()), document("past", "2026-11-15T00:00:00Z"),
      document("bad-secret-name", "not-a-date"), document("missing", undefined), document("empty", "")];
    assert.deepEqual(filterReadableAdoptions(records, now), [live]);
    assert.deepEqual(JSON.parse(String(warn.mock.calls[0][0])), {
      event: "admin.adoption.invalid-expiration", count: 3,
    });
    assert.ok(!JSON.stringify(warn.mock.calls).includes("bad-secret-name"));
    assert.ok(!JSON.stringify(warn.mock.calls).includes("secret-ciphertext"));
    assert.throws(() => requireReadableAdoption(records[1], now), AdoptionUnavailableError);
    assert.throws(() => requireReadableAdoption(records[3], now), AdoptionUnavailableError);
    assert.throws(() => requireReadableAdoption(null, now), AdoptionUnavailableError);
    assert.equal(requireReadableAdoption(live, now), live);
  } finally { warn.mockRestore(); }
});

test("expired records never reach the decryption callback even if cleanup has not run", async () => {
  let calls = 0;
  const result = await serializeReadableAdoptions([document("expired", now.toISOString())], async () => {
    calls += 1;
    return [{ plaintext: "must-not-be-decrypted" }];
  }, () => now);
  assert.equal(calls, 0);
  assert.deepEqual(result, []);
});

test("a record that expires during decryption is not returned", async () => {
  const live = document("live", "2026-11-16T10:00:00.001Z");
  const lasting = document("lasting", "2026-11-17T00:00:00Z");
  let reads = 0;
  const result = await serializeReadableAdoptions([live, lasting], async (records) => {
    assert.deepEqual(records, [live, lasting]);
    return [{ plaintext: "expired" }, { plaintext: "still-readable" }];
  }, () => reads++ === 0 ? now : new Date("2026-11-16T10:00:00.001Z"));
  assert.deepEqual(result, [{ plaintext: "still-readable" }]);
});

test("invalid clocks and inconsistent serialization fail closed", async () => {
  assert.throws(() => filterReadableAdoptions([], new Date("bad")), /clock must be valid/);
  await assert.rejects(() => serializeReadableAdoptions([document("live", "2026-11-17T00:00:00Z")],
    async () => [], () => now), /inconsistent result/);
});
