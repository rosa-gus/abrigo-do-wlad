import { afterEach, expect, test, vi } from "vitest";
import { FirestoreRestError, type FirestoreDocument } from "../_lib/firestore";
import { acquireFeedPublicationLease, promoteFeedSnapshot, currentFeedSnapshotVersion, PublicationBusyError } from "./publication-state";

afterEach(() => vi.restoreAllMocks());

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

test.each(["FAILED_PRECONDITION", "ABORTED", "ALREADY_EXISTS"])(
  "a structured %s returned as HTTP 400 defers lease creation",
  async code => {
    const source = repository();
    vi.spyOn(source, "createDocument").mockRejectedValueOnce(
      new FirestoreRestError("conflict", 400, { error: { status: code } }),
    );
    await expect(acquireFeedPublicationLease(source)).rejects.toBeInstanceOf(PublicationBusyError);
    expect(await currentFeedSnapshotVersion(source)).toBeUndefined();
  },
);

test("a structured conflict on lease renewal does not write without the observed revision", async () => {
  const source = repository();
  const start = new Date("2026-11-17T10:00:00Z");
  const lease = await acquireFeedPublicationLease(source, start);
  const update = vi.spyOn(source, "updateDocument").mockRejectedValueOnce(
    new FirestoreRestError("conflict", 400, [{ error: { status: "FAILED_PRECONDITION" } }]),
  );
  await expect(acquireFeedPublicationLease(source, new Date(start.getTime() + 61_000)))
    .rejects.toBeInstanceOf(PublicationBusyError);
  expect(update).toHaveBeenCalledTimes(1);
  expect(update.mock.calls[0][2]).toEqual({ expectedUpdateTime: lease.updateTime });
});

test("a conflict during promotion preserves the winner's snapshot", async () => {
  const source = repository();
  const start = new Date("2026-11-17T10:00:00Z");
  const lease = await acquireFeedPublicationLease(source, start);
  const update = source.updateDocument.bind(source);
  const promotion = vi.spyOn(source, "updateDocument").mockImplementationOnce(async (name, _data, options) => {
    await update(name, { version: "winner", leaseId: null, leaseExpiresAt: null }, options);
    throw new FirestoreRestError("conflict", 400, { error: { status: "FAILED_PRECONDITION" } });
  });
  await expect(promoteFeedSnapshot(source, lease, "loser", new Date(start.getTime() + 1)))
    .rejects.toBeInstanceOf(PublicationBusyError);
  expect(promotion).toHaveBeenCalledTimes(1);
  expect(await currentFeedSnapshotVersion(source)).toBe("winner");
});

test.each(["INVALID_ARGUMENT", "PERMISSION_DENIED", "UNAVAILABLE"])(
  "%s remains an operational failure rather than publication contention",
  async code => {
    const source = repository();
    const failure = new FirestoreRestError("provider failure", 400, { error: { status: code } });
    vi.spyOn(source, "createDocument").mockRejectedValueOnce(failure);
    await expect(acquireFeedPublicationLease(source)).rejects.toBe(failure);
  },
);
