import assert from "node:assert/strict";
import { test } from "vitest";
import { FirestoreRestClient, FirestoreRestError } from "../_lib/firestore";

import {
  cleanupExpiredAdoptionApplications,
  type AdoptionCleanupDependencies,
  type AdoptionCleanupRepository,
} from "./cleanup";

const CUTOFF = new Date("2026-08-21T03:00:00.000Z");
const DOCUMENT_ROOT =
  "projects/test-project/databases/(default)/documents/adoption_application";

function application(id: string) {
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
    /batchSize must be between 1 and 500/,
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
      deleteDocumentsIfUnchanged: (documents) => client.deleteDocumentsIfUnchanged(documents),
    }),
  };

  await assert.rejects(
    () => cleanupExpiredAdoptionApplications(undefined, { cutoff: CUTOFF }, dependencies),
    (error: unknown) => error instanceof FirestoreRestError && /Document changed/.test(error.message),
  );
  assert.equal(commits, 1);
});
