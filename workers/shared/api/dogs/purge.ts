import type { CloudflareEnv } from "../_lib/env";
import {
  createFirestoreClient,
  type DeleteDocumentsResult,
} from "../_lib/firestore";
import { listDogPurgeCandidates, type DogPurgeSource } from "./purge-candidates";

const DEFAULT_BATCH_SIZE = 100;
const DEFAULT_MAX_BATCHES = 5;

export interface DogPurgeRepository extends DogPurgeSource {
  deleteDocumentsIfUnchanged(
    documents: Array<{ name: string; updateTime: string }>,
  ): Promise<DeleteDocumentsResult>;
}

export interface DogPurgeDependencies {
  createFirestoreClient(env: CloudflareEnv): DogPurgeRepository;
}

export interface DogPurgeOptions {
  cutoff: Date;
  batchSize?: number;
  maxBatches?: number;
  dryRun?: boolean;
}

export interface DogPurgeResult {
  batches: number;
  cutoff: string;
  deleted: number;
  hasMore: boolean;
  matched: number;
}

const productionDependencies: DogPurgeDependencies = { createFirestoreClient };

export async function purgeArchivedDogs(
  env: CloudflareEnv,
  options: DogPurgeOptions,
  dependencies: DogPurgeDependencies = productionDependencies,
): Promise<DogPurgeResult> {
  const { cutoff, dryRun = false } = options;
  const batchSize = options.batchSize ?? DEFAULT_BATCH_SIZE;
  const maxBatches = options.maxBatches ?? DEFAULT_MAX_BATCHES;
  if (!Number.isFinite(cutoff.getTime())) throw new TypeError("Dog purge cutoff must be a valid Date.");
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 500) {
    throw new RangeError("Dog purge batchSize must be between 1 and 500.");
  }
  if (!Number.isInteger(maxBatches) || maxBatches < 1 || maxBatches > 100) {
    throw new RangeError("Dog purge maxBatches must be between 1 and 100.");
  }

  const firestore = dependencies.createFirestoreClient(env);
  let batches = 0;
  let matched = 0;
  let deleted = 0;
  let hasMore = false;

  do {
    const candidates = await listDogPurgeCandidates(env, cutoff, batchSize, firestore);
    if (candidates.length === 0) break;
    batches += 1;
    matched += candidates.length;
    hasMore = candidates.length === batchSize;
    if (dryRun) break;

    const result = await firestore.deleteDocumentsIfUnchanged(
      candidates.map(({ documentName, updateTime }) => ({ name: documentName, updateTime })),
    );
    deleted += result.deleted;
  } while (hasMore && batches < maxBatches);

  return { batches, cutoff: cutoff.toISOString(), deleted, hasMore, matched };
}
