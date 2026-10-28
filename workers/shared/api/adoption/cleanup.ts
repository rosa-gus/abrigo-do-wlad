import type { CloudflareEnv } from "../_lib/env";
import {
  createFirestoreClient,
  type DeleteDocumentsResult,
  type FirestoreDocument,
} from "../_lib/firestore";

const ADOPTION_APPLICATIONS_COLLECTION = "adoption_application";
const EXPIRATION_FIELD = "expiresAt";
const DEFAULT_BATCH_SIZE = 200;
const DEFAULT_MAX_BATCHES = 25;
const MAX_BATCH_SIZE = 500;

type ExpiredApplication = FirestoreDocument<Record<string, unknown>>;

export interface AdoptionCleanupRepository {
  deleteDocumentsIfUnchanged(
    documents: Array<{ name: string; updateTime: string }>,
  ): Promise<DeleteDocumentsResult>;
  findExpiredApplications(
    cutoff: Date,
    limit: number,
  ): Promise<ExpiredApplication[]>;
}

export interface AdoptionCleanupDependencies {
  createFirestoreClient(env?: CloudflareEnv): AdoptionCleanupRepository;
}

export interface AdoptionCleanupOptions {
  cutoff?: Date;
  batchSize?: number;
  dryRun?: boolean;
  maxBatches?: number;
}

export interface AdoptionCleanupResult {
  batches: number;
  cutoff: string;
  deleted: number;
  hasMore: boolean;
  matched: number;
}

const productionDependencies: AdoptionCleanupDependencies = {
  createFirestoreClient(env) {
    const firestore = createFirestoreClient(env);

    return {
      deleteDocumentsIfUnchanged: (documents) =>
        firestore.deleteDocumentsIfUnchanged(documents),
      findExpiredApplications: (cutoff, limit) =>
        firestore.findDocumentsByTimestampBefore<Record<string, unknown>>(
          ADOPTION_APPLICATIONS_COLLECTION,
          EXPIRATION_FIELD,
          cutoff,
          limit,
        ),
    };
  },
};

function requireIntegerInRange(
  value: number,
  name: string,
  minimum: number,
  maximum: number,
): void {
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new RangeError(`${name} must be between ${minimum} and ${maximum}.`);
  }
}

export async function cleanupExpiredAdoptionApplications(
  env?: CloudflareEnv,
  options: AdoptionCleanupOptions = {},
  dependencies: AdoptionCleanupDependencies = productionDependencies,
): Promise<AdoptionCleanupResult> {
  const cutoff = options.cutoff ?? new Date();
  const batchSize = options.batchSize ?? DEFAULT_BATCH_SIZE;
  const maxBatches = options.maxBatches ?? DEFAULT_MAX_BATCHES;

  if (Number.isNaN(cutoff.getTime())) {
    throw new TypeError("Adoption cleanup cutoff must be a valid Date.");
  }

  requireIntegerInRange(batchSize, "Adoption cleanup batchSize", 1, MAX_BATCH_SIZE);
  requireIntegerInRange(maxBatches, "Adoption cleanup maxBatches", 1, 100);

  const firestore = dependencies.createFirestoreClient(env);
  let batches = 0;
  let deleted = 0;
  let matched = 0;

  if (options.dryRun) {
    const documents = await firestore.findExpiredApplications(cutoff, batchSize);
    return {
      batches: documents.length > 0 ? 1 : 0,
      cutoff: cutoff.toISOString(),
      deleted: 0,
      hasMore: documents.length === batchSize,
      matched: documents.length,
    };
  }

  while (batches < maxBatches) {
    const documents = await firestore.findExpiredApplications(cutoff, batchSize);

    if (documents.length === 0) {
      return {
        batches,
        cutoff: cutoff.toISOString(),
        deleted,
        hasMore: false,
        matched,
      };
    }

    const deletion = await firestore.deleteDocumentsIfUnchanged(
      documents.map((document) => {
        if (typeof document.updateTime !== "string" || !Number.isFinite(Date.parse(document.updateTime))) {
          throw new Error(`Expired application ${document.id} is missing a valid update time.`);
        }
        return { name: document.name, updateTime: document.updateTime };
      }),
    );
    matched += documents.length;
    deleted += deletion.deleted;
    batches += 1;

    if (documents.length < batchSize) {
      return {
        batches,
        cutoff: cutoff.toISOString(),
        deleted,
        hasMore: false,
        matched,
      };
    }
  }

  return {
    batches,
    cutoff: cutoff.toISOString(),
    deleted,
    hasMore: true,
    matched,
  };
}
