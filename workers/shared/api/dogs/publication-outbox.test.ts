import { expect, test, vi } from "vitest";
const projections = vi.hoisted(() => ({ saveTombstone: vi.fn(), deleteTombstone: vi.fn() }));
vi.mock("./tombstone", () => ({ saveDogTombstone: projections.saveTombstone, deleteDogTombstone: projections.deleteTombstone }));
vi.mock("./feed", () => ({ updateDogFeed: async () => ({}) }));
vi.mock("../hero-dog/update", () => ({ updateHeroDog: async () => ({ status: 200 }) }));
import { processDogPublicationOutbox } from "./publication-outbox";
import type { FirestoreDocument } from "../_lib/firestore";

test("a failed publication backs off durably and a later batch completes without replaying a mutation", async () => {
  let data: Record<string, unknown> = { state: "pending", attempts: 0 };
  let revision = 1;
  const writes: Record<string, unknown>[] = [];
  const repository = {
    async getDocument<T extends Record<string, unknown>>() { return null as FirestoreDocument<T> | null; },
    async findDocumentsByTimestampBefore<T extends Record<string, unknown>>() {
      return [{ id: "job", name: "publication_outbox/job", data: data as T, updateTime: `2026-01-01T00:00:00.00${revision}Z` }];
    },
    async updateDocument(_name: string, patch: Record<string, unknown>) {
      writes.push(patch);
      data = { ...data, ...patch };
      return { updateTime: `2026-01-01T00:00:00.00${++revision}Z` };
    },
  };
  const publish = vi.fn().mockRejectedValueOnce(new Error("private upstream value")).mockResolvedValueOnce({});
  expect(await processDogPublicationOutbox({}, { repository, publish })).toEqual({ processed: 0, failed: 1, deferred: 0 });
  expect(data.state).toBe("pending");
  expect(data.nextAttemptAt).toBeInstanceOf(Date);
  expect(JSON.stringify(writes)).not.toContain("private upstream value");
  expect(await processDogPublicationOutbox({}, { repository, publish })).toEqual({ processed: 1, failed: 0, deferred: 0 });
  expect(data.state).toBe("completed");
  expect(data.attempts).toBe(2);
});


test("a source change while KV is pending leaves a recovery job instead of acknowledging a stale tombstone", async () => {
  let dogRevision = "before";
  let jobState = "pending";
  projections.saveTombstone.mockImplementationOnce(async () => { dogRevision = "after"; });
  const repository = {
    async getDocument<T extends Record<string, unknown>>() {
      return { id: "dog", name: "dogs/dog", updateTime: dogRevision,
        data: { publicationStatus: "published", publishedAt: "2026-01-01T00:00:00Z", archivedAt: "2026-11-17T00:00:00Z", archiveReason: "other", nome: "Dog" } as T };
    },
    async findDocumentsByTimestampBefore<T extends Record<string, unknown>>() {
      return [{ id: "job", name: "publication_outbox/job", updateTime: "job-before",
        data: { state: "pending", targets: ["dogs/dog"], action: "dog.archived" } as T }];
    },
    async updateDocument(_name: string, patch: Record<string, unknown>) {
      jobState = String(patch.state);
      return { updateTime: "job-after" };
    },
  };
  const result = await processDogPublicationOutbox({}, { repository });
  expect(result.failed).toBe(1);
  expect(jobState).toBe("pending");
  expect(projections.saveTombstone).toHaveBeenCalledOnce();
});
