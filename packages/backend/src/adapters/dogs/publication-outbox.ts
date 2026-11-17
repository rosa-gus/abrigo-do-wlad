import {
  createFirestoreClient,
  type AtomicDocumentWrite,
  type FirestoreRestClient,
} from "../firestore";
import type { CloudflareEnv } from "../env";
import { saveDogTombstone, deleteDogTombstone } from "./tombstone";
import { isDogArchived } from "@abrigo/domain/dogs/archive";
import { isPublished } from "@abrigo/domain/publication";
import { updateHeroDog } from "../hero-dog/update";
import { updateDogFeed } from "./feed";
import { PublicationBusyError, isPublicationConflict } from "./publication-state";

export const PUBLICATION_OUTBOX_COLLECTION = "publication_outbox";
const BATCH_SIZE = 25;
const JOB_LEASE_MS = 90_000;
const MAX_BACKOFF_MS = 60 * 60_000;
type Repository = Pick<FirestoreRestClient,
  "findDocumentsByTimestampBefore" | "updateDocument" | "getDocument">;

export function dogPublicationOutboxWrite(id: string, now = new Date(), targets: readonly string[] = [], action = "dog.updated"): AtomicDocumentWrite {
  return { kind: "create", path: `${PUBLICATION_OUTBOX_COLLECTION}/${id}`, data: {
    action, targets: targets.filter(target => target.startsWith("dogs/")),
    kind: "dogs.feed.refresh", state: "pending", attempts: 0,
    createdAt: now, nextAttemptAt: now,
  } };
}

export interface PublicationBatchResult { processed: number; failed: number; deferred: number }

/** A bounded batch; expired claims are included by nextAttemptAt and can be reclaimed. */
export async function processDogPublicationOutbox(
  env: CloudflareEnv,
  options: {
    now?: Date;
    repository?: Repository;
    publish?: () => Promise<unknown>;
  } = {},
): Promise<PublicationBatchResult> {
  const repository = options.repository ?? createFirestoreClient(env);
  const now = options.now ?? new Date();
  const publish = options.publish ?? (() => updateDogFeed(env));
  const jobs = await repository.findDocumentsByTimestampBefore<Record<string, unknown>>(
    PUBLICATION_OUTBOX_COLLECTION, "nextAttemptAt", now, BATCH_SIZE,
  );
  let oldestDueAgeMs = 0;
  let maxAttempts = 0;
  for (const job of jobs) {
    const createdAt = typeof job.data.createdAt === "string" ? Date.parse(job.data.createdAt)
      : job.data.createdAt instanceof Date ? job.data.createdAt.getTime() : NaN;
    if (Number.isFinite(createdAt)) oldestDueAgeMs = Math.max(oldestDueAgeMs, now.getTime() - createdAt);
  }
  const result: PublicationBatchResult = { processed: 0, failed: 0, deferred: 0 };
  for (const job of jobs) {
    if (!job.updateTime) throw new Error("Publication job revision unavailable.");
    if (job.data.state === "completed") continue;
    const claimId = crypto.randomUUID();
    const attempts = typeof job.data.attempts === "number" ? job.data.attempts + 1 : 1;
    maxAttempts = Math.max(maxAttempts, attempts);
    let claimRevision: string;
    try {
      const claimed = await repository.updateDocument(job.name, {
        state: "processing", claimId, attempts,
        nextAttemptAt: new Date(now.getTime() + JOB_LEASE_MS),
      }, { expectedUpdateTime: job.updateTime });
      if (!claimed.updateTime) throw new Error("Publication claim revision unavailable.");
      claimRevision = claimed.updateTime;
    } catch (error) {
      if (isPublicationConflict(error)) { result.deferred += 1; continue; }
      throw error;
    }
    try {
      const observedVersions = new Map<string, string | undefined>();
      if (!options.publish) {
        for (const path of Array.isArray(job.data.targets) ? job.data.targets : []) {
          if (typeof path !== "string" || !/^dogs\/[A-Za-z0-9_-]{1,128}$/.test(path)) continue;
          const dog = await repository.getDocument(path);
          observedVersions.set(path, dog?.updateTime);
          if (dog && isDogArchived(dog.data) && isPublished(dog.data)
            && typeof dog.data.publishedAt === "string" && typeof dog.data.archivedAt === "string") {
            await saveDogTombstone(env, {
              id: dog.id, nome: typeof dog.data.nome === "string" ? dog.data.nome : "Cão",
              removedAt: dog.data.archivedAt,
              status: dog.data.archiveReason === "adopted_via_site" ? "adopted" : "unavailable",
            });
          } else if (dog || job.data.action === "dog.deleted") {
            await deleteDogTombstone(env, path.split("/")[1]);
          }
        }
        const hero = await updateHeroDog(env);
        if (hero.status >= 400) throw new Error("Hero reconciliation failed.");
      }
      await publish();
      // KV can finish out of order. Never acknowledge a stale projection: a
      // changed source leaves this job recoverable even if a newer job finished.
      for (const [path, observed] of observedVersions) {
        const current = await repository.getDocument(path);
        if (current?.updateTime !== observed) throw new Error("Projection source changed.");
      }
      await repository.updateDocument(job.name, {
        state: "completed", completedAt: new Date(), claimId: null,
        // A far future timestamp keeps completed entries out of due queries.
        nextAttemptAt: new Date("9999-01-01T00:00:00.000Z"),
      }, { expectedUpdateTime: claimRevision });
      result.processed += 1;
    } catch (error) {
      const backoff = Math.min(MAX_BACKOFF_MS, 1000 * 2 ** Math.min(attempts, 12));
      try {
        await repository.updateDocument(job.name, {
          state: "pending", claimId: null,
          nextAttemptAt: new Date(Date.now() + backoff),
          // Only a classification is persisted; upstream errors may contain sensitive data.
          lastFailure: error instanceof PublicationBusyError ? "busy" : "publication_failed",
        }, { expectedUpdateTime: claimRevision });
      } catch (recordError) {
        // A lost result remains recoverable after the original claim deadline.
        if (!isPublicationConflict(recordError)) throw recordError;
      }
      result.failed += 1;
    }
  }
  console.info(JSON.stringify({ event: "dogs.publication.batch", oldestDueAgeMs, maxAttempts, ...result }));
  return result;
}
