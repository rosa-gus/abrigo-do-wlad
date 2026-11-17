import { expect, test } from "vitest";
import { FirestoreRestError, type FirestoreDocument } from "../_lib/firestore";
import { acquireFeedPublicationLease, promoteFeedSnapshot, currentFeedSnapshotVersion } from "./publication-state";

function repository() {
  let document: FirestoreDocument<Record<string, unknown>> | null = null;
  let revision = 0;
  const save = (data: Record<string, unknown>) => {
    document = { id: "dog-feed-publication", name: "system/dog-feed-publication", data,
      updateTime: `2026-01-01T00:00:00.${String(++revision).padStart(3, "0")}Z` };
    return { id: document.id, updateTime: document.updateTime };
  };
  return {
    async getDocument<T extends Record<string, unknown>>() { return document as FirestoreDocument<T> | null; },
    async createDocument(_collection: string, data: Record<string, unknown>) {
      if (document) throw new FirestoreRestError("exists", 409);
      return save(data);
    },
    async updateDocument(_name: string, data: Record<string, unknown>, options?: { expectedUpdateTime?: string }) {
      if (document?.updateTime !== options?.expectedUpdateTime) throw new FirestoreRestError("stale", 412);
      return save({ ...document?.data, ...data });
    },
  };
}

test("a builder whose lease expired cannot promote over a newer completed snapshot", async () => {
  const source = repository();
  const start = new Date("2026-11-17T10:00:00Z");
  const older = await acquireFeedPublicationLease(source, start);
  const later = new Date(start.getTime() + 61_000);
  const newer = await acquireFeedPublicationLease(source, later);
  await promoteFeedSnapshot(source, newer, "new", new Date(later.getTime() + 1));
  await expect(promoteFeedSnapshot(source, older, "old", new Date(start.getTime() + 20_000))).rejects.toThrow();
  expect(await currentFeedSnapshotVersion(source)).toBe("new");
});

test("only one overlapping builder acquires the Firestore fence", async () => {
  const source = repository();
  const outcomes = await Promise.allSettled([acquireFeedPublicationLease(source), acquireFeedPublicationLease(source)]);
  expect(outcomes.filter(result => result.status === "fulfilled")).toHaveLength(1);
});
