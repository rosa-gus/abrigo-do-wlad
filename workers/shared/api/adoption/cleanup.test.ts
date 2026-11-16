import assert from "node:assert/strict";
import { test, vi } from "vitest";
import { FirestoreRestClient, FirestoreRestError, type FirestoreDocument } from "../_lib/firestore";

import {
  ADOPTION_RETENTION_ALERT_DELAY_MS,
  cleanupExpiredAdoptionApplications,
  type AdoptionCleanupDependencies,
  type AdoptionCleanupRepository,
} from "./cleanup";

const CUTOFF = new Date("2026-08-21T03:00:00.000Z");
const DOCUMENT_ROOT =
  "projects/test-project/databases/(default)/documents/adoption_application";

test("cleanup alerts on overdue persisted records with aggregate metrics and no personal data", async () => {
  const error = vi.spyOn(console, "error").mockImplementation(() => {});
  const info = vi.spyOn(console, "info").mockImplementation(() => {});
  try {
    const old = { ...application("private-id"), data: {
      expiresAt: new Date(CUTOFF.getTime() - ADOPTION_RETENTION_ALERT_DELAY_MS - 1).toISOString(),
      nome_adotante: "private-person", sensitive: "private-cipher", keyVersion: "private-key",
    } };
    const fixture = createDependencies([[old]]);
    const result = await cleanupExpiredAdoptionApplications(undefined,
      { cutoff: CUTOFF, dryRun: true }, fixture.dependencies);
    assert.equal(result.deleted, 0);
    assert.deepEqual(JSON.parse(String(error.mock.calls[0][0])), {
      event: "adoption.retention.overdue", observedExpiredCount: 1, overdueCount: 1,
      oldestExpirationAgeMs: ADOPTION_RETENTION_ALERT_DELAY_MS + 1,
      toleranceMs: ADOPTION_RETENTION_ALERT_DELAY_MS,
    });
    assert.ok(!JSON.stringify(error.mock.calls).includes("private"));
    assert.deepEqual(fixture.deletedNames, []);
  } finally { error.mockRestore(); info.mockRestore(); }
});

test("cleanup records ordinary expiration lag without an overdue alert at the tolerance boundary", async () => {
  const error = vi.spyOn(console, "error").mockImplementation(() => {});
  const info = vi.spyOn(console, "info").mockImplementation(() => {});
  try {
    const fixture = createDependencies([[{
      ...application("boundary"), data: { expiresAt: new Date(CUTOFF.getTime() - ADOPTION_RETENTION_ALERT_DELAY_MS).toISOString() },
    }]]);
    await cleanupExpiredAdoptionApplications(undefined, { cutoff: CUTOFF }, fixture.dependencies);
    assert.equal(error.mock.calls.length, 0);
    assert.equal(JSON.parse(String(info.mock.calls[0][0])).event, "adoption.retention.observed");
  } finally { error.mockRestore(); info.mockRestore(); }
});

test("cleanup decrements encrypted documents by their own key and ignores plaintext records", async () => {
  const documents = [
    { ...application("old-1"), data: { sensitive: "ciphertext", keyVersion: "old-key" } },
    { ...application("old-2"), data: { sensitive: "ciphertext", keyVersion: "old-key" } },
    { ...application("new-1"), data: { sensitive: "ciphertext", keyVersion: "new-key" } },
    application("plaintext"),
  ];
  let deleted = false;
  const result = await cleanupExpiredAdoptionApplications(undefined, { cutoff: CUTOFF }, {
    createFirestoreClient: () => ({
      findExpiredApplications: async () => documents,
      async deleteDocumentsIfUnchanged(targets, increments) {
        assert.equal(targets.length, 4);
        assert.deepEqual(increments, [
          { documentPath: "system/keys", fieldPath: ["keys", "old-key", "counter"], amount: -2 },
          { documentPath: "system/keys", fieldPath: ["keys", "new-key", "counter"], amount: -1 },
        ]);
        deleted = true;
        return { deleted: targets.length };
      },
    }),
  });
  assert.equal(deleted, true);
  assert.equal(result.deleted, 4);
});

test("cleanup refuses encrypted records without a key before issuing any deletion", async () => {
  const original = application("missing-key");
  const fixture = createDependencies([[{
    ...original, data: { ...original.data, sensitive: "ciphertext" },
  }]]);
  await assert.rejects(() => cleanupExpiredAdoptionApplications(undefined, { cutoff: CUTOFF }, fixture.dependencies),
    /no encryption key reference/);
  assert.deepEqual(fixture.deletedNames, []);
});

function application(id: string): FirestoreDocument<Record<string, unknown>> {
  return {
    id,
    name: `${DOCUMENT_ROOT}/${id}`,
    updateTime: "2026-08-20T00:00:01.000Z",
    data: { expiresAt: "2026-08-20T00:00:00.000Z" },
  };
}

function createDependencies(
  pages: ReturnType<typeof application>[][],
): {
  deletedNames: string[];
  dependencies: AdoptionCleanupDependencies;
  requestedLimits: number[];
} {
  const deletedNames: string[] = [];
  const requestedLimits: number[] = [];
  const repository: AdoptionCleanupRepository = {
    async deleteDocumentsIfUnchanged(documents) {
      for (const document of documents) {
        assert.equal(document.updateTime, "2026-08-20T00:00:01.000Z");
      }
      deletedNames.push(...documents.map((document) => document.name));
      return { deleted: documents.length };
    },
    async findExpiredApplications(cutoff, limit) {
      assert.equal(cutoff.toISOString(), CUTOFF.toISOString());
      requestedLimits.push(limit);
      return pages.shift() ?? [];
    },
  };

  return {
    deletedNames,
    requestedLimits,
    dependencies: { createFirestoreClient: () => repository },
  };
}

test("cleanup deletes expired applications in bounded batches", async () => {
  const fixture = createDependencies([
    [application("request-1"), application("request-2")],
    [application("request-3")],
  ]);

  const result = await cleanupExpiredAdoptionApplications(
    undefined,
    { cutoff: CUTOFF, batchSize: 2, maxBatches: 5 },
    fixture.dependencies,
  );

  assert.deepEqual(result, {
    batches: 2,
    cutoff: CUTOFF.toISOString(),
    deleted: 3,
    hasMore: false,
    matched: 3,
  });
  assert.deepEqual(fixture.requestedLimits, [2, 2]);
  assert.deepEqual(fixture.deletedNames, [
    `${DOCUMENT_ROOT}/request-1`,
    `${DOCUMENT_ROOT}/request-2`,
    `${DOCUMENT_ROOT}/request-3`,
  ]);
});

test("cleanup reports remaining work after reaching the execution ceiling", async () => {
  const fixture = createDependencies([
    [application("request-1")],
    [application("request-2")],
  ]);

  const result = await cleanupExpiredAdoptionApplications(
    undefined,
    { cutoff: CUTOFF, batchSize: 1, maxBatches: 2 },
    fixture.dependencies,
  );

  assert.deepEqual(result, {
    batches: 2,
    cutoff: CUTOFF.toISOString(),
    deleted: 2,
    hasMore: true,
    matched: 2,
  });
});

test("cleanup dry-run reports candidates without deleting them", async () => {
  const fixture = createDependencies([
    [application("request-1"), application("request-2")],
  ]);

  const result = await cleanupExpiredAdoptionApplications(
    undefined,
    { cutoff: CUTOFF, batchSize: 2, dryRun: true },
    fixture.dependencies,
  );

  assert.deepEqual(result, {
    batches: 1,
    cutoff: CUTOFF.toISOString(),
    deleted: 0,
    hasMore: true,
    matched: 2,
  });
  assert.deepEqual(fixture.deletedNames, []);
});

test("cleanup validates bounds before creating the Firestore client", async () => {
  let clientCreated = false;
  const dependencies: AdoptionCleanupDependencies = {
    createFirestoreClient() {
      clientCreated = true;
      throw new Error("must not be called");
    },
  };

  await assert.rejects(
    () =>
      cleanupExpiredAdoptionApplications(
        undefined,
        { cutoff: CUTOFF, batchSize: 501 },
        dependencies,
      ),
    /batchSize must be between 1 and 499/,
  );
  assert.equal(clientCreated, false);
});

test("cleanup rejects documents without a valid read version before deleting the batch", async () => {
  const document = application("missing-version");
  document.updateTime = "";
  const fixture = createDependencies([[application("valid"), document]]);

  await assert.rejects(
    () => cleanupExpiredAdoptionApplications(undefined, { cutoff: CUTOFF }, fixture.dependencies),
    /missing a valid update time/,
  );
  assert.deepEqual(fixture.deletedNames, []);
});

test("cleanup sends read-version preconditions and propagates concurrent-change failures", async () => {
  const document = application("reopened");
  let commits = 0;
  const client = new FirestoreRestClient("test-project", {
    tokenProvider: async () => "test-token",
    fetcher: async (_input, init) => {
      commits += 1;
      assert.deepEqual(JSON.parse(String(init?.body)), {
        writes: [{
          delete: document.name,
          currentDocument: { updateTime: document.updateTime },
        }],
      });
      return Response.json(
        { error: { status: "FAILED_PRECONDITION", message: "Document changed since read" } },
        { status: 400 },
      );
    },
  });
  const dependencies: AdoptionCleanupDependencies = {
    createFirestoreClient: () => ({
      findExpiredApplications: async () => [document],
      deleteDocumentsIfUnchanged: (documents, increments) => client.deleteDocumentsIfUnchanged(documents, increments),
    }),
  };

  await assert.rejects(
    () => cleanupExpiredAdoptionApplications(undefined, { cutoff: CUTOFF }, dependencies),
    (error: unknown) => error instanceof FirestoreRestError && /Document changed/.test(error.message),
  );
  assert.equal(commits, 1);
});
