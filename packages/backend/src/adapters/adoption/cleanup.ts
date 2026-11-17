import type { CloudflareEnv } from "../env";
import { encryptionCounterIncrement } from "../encryption-counters";
import {
  createFirestoreClient,
  type DeleteDocumentsResult,
  type DocumentFieldIncrement,
  type FirestoreDocument,
} from "../firestore";

const ADOPTION_APPLICATIONS_COLLECTION = "adoption_application";
const EXPIRATION_FIELD = "expiresAt";
const DEFAULT_BATCH_SIZE = 200;
const DEFAULT_MAX_BATCHES = 25;
// Reserve one write for the aggregated key counter transforms.
const MAX_BATCH_SIZE = 499;
// One complete daily cron interval is tolerated; access is denied at expiresAt independently.
export const ADOPTION_RETENTION_ALERT_DELAY_MS = 24 * 60 * 60 * 1_000;

type ExpiredApplication = FirestoreDocument<Record<string, unknown>>;

export interface AdoptionCleanupRepository {
  deleteDocumentsIfUnchanged(
    documents: Array<{ name: string; updateTime: string }>,
    increments?: DocumentFieldIncrement[],
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
  retentionAlertDelayMs?: number;
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
      deleteDocumentsIfUnchanged: (documents, increments) =>
        firestore.deleteDocumentsIfUnchanged(documents, increments),
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

function reportRetentionDelay(documents: ExpiredApplication[], cutoff: Date, toleranceMs: number): void {
  const ages = documents.flatMap(({ data }) => {
    const expiry = typeof data.expiresAt === "string" ? Date.parse(data.expiresAt) : NaN;
    return Number.isFinite(expiry) && expiry <= cutoff.getTime() ? [cutoff.getTime() - expiry] : [];
  });
  if (ages.length === 0) return;
  const overdueCount = ages.filter((age) => age > toleranceMs).length;
  const metric = {
    event: overdueCount > 0 ? "adoption.retention.overdue" : "adoption.retention.observed",
    observedExpiredCount: ages.length,
    overdueCount,
    oldestExpirationAgeMs: Math.max(...ages),
    toleranceMs,
  };
  // Aggregate counts/ages only: never log document IDs, payloads or encryption keys.
  if (overdueCount > 0) console.error(JSON.stringify(metric));
  else console.info(JSON.stringify(metric));
}

export async function cleanupExpiredAdoptionApplications(
  env?: CloudflareEnv,
  options: AdoptionCleanupOptions = {},
  dependencies: AdoptionCleanupDependencies = productionDependencies,
): Promise<AdoptionCleanupResult> {
  const cutoff = options.cutoff ?? new Date();
  const batchSize = options.batchSize ?? DEFAULT_BATCH_SIZE;
  const maxBatches = options.maxBatches ?? DEFAULT_MAX_BATCHES;
  const retentionAlertDelayMs = options.retentionAlertDelayMs ?? ADOPTION_RETENTION_ALERT_DELAY_MS;

  if (Number.isNaN(cutoff.getTime())) {
    throw new TypeError("Adoption cleanup cutoff must be a valid Date.");
  }

  requireIntegerInRange(batchSize, "Adoption cleanup batchSize", 1, MAX_BATCH_SIZE);
  requireIntegerInRange(maxBatches, "Adoption cleanup maxBatches", 1, 100);
  if (!Number.isFinite(retentionAlertDelayMs) || retentionAlertDelayMs < 0) {
    throw new RangeError("Adoption retention alert delay must be nonnegative and finite.");
  }

  const firestore = dependencies.createFirestoreClient(env);
  let batches = 0;
  let deleted = 0;
  let matched = 0;

  if (options.dryRun) {
    const documents = await firestore.findExpiredApplications(cutoff, batchSize);
    reportRetentionDelay(documents, cutoff, retentionAlertDelayMs);
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
    reportRetentionDelay(documents, cutoff, retentionAlertDelayMs);

    if (documents.length === 0) {
      return {
        batches,
        cutoff: cutoff.toISOString(),
        deleted,
        hasMore: false,
        matched,
      };
    }

    const counts = new Map<string, number>();
    const deletion = await firestore.deleteDocumentsIfUnchanged(
      documents.map((document) => {
        if (typeof document.updateTime !== "string" || !Number.isFinite(Date.parse(document.updateTime))) {
          throw new Error(`Expired application ${document.id} is missing a valid update time.`);
        }
        const encrypted = typeof document.data.sensitive === "string";
        if (encrypted && (typeof document.data.keyVersion !== "string" || !document.data.keyVersion)) {
          throw new Error(`Expired application ${document.id} has no encryption key reference.`);
        }
        if (encrypted) {
          const keyId = document.data.keyVersion as string;
          counts.set(keyId, (counts.get(keyId) ?? 0) - 1);
        }
        return { name: document.name, updateTime: document.updateTime };
      }),
      [...counts].map(([keyId, amount]) => encryptionCounterIncrement(keyId, amount)),
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
