import {
  createFirestoreClient,
  type FirestoreDocument,
} from "../_lib/firestore";
import type { CloudflareEnv } from "../_lib/env";
import { isDogPurgeEligible } from "./archive";

export interface DogPurgeCandidate {
  documentName: string;
  dogId: string;
  archivedAt: string;
  purgeAfter: string;
}

export interface DogPurgeSource {
  findDocumentsByTimestampBefore(
    collection: string,
    field: string,
    cutoff: Date,
    limit: number,
  ): Promise<FirestoreDocument<Record<string, unknown>>[]>;
}

export async function listDogPurgeCandidates(
  env: CloudflareEnv,
  now: Date = new Date(),
  limit = 100,
  source: DogPurgeSource = createFirestoreClient(env),
): Promise<DogPurgeCandidate[]> {
  if (!Number.isFinite(now.getTime())) throw new TypeError("Invalid purge cutoff.");
  if (!Number.isInteger(limit) || limit < 1 || limit > 500) {
    throw new RangeError("Purge candidate limit must be between 1 and 500.");
  }
  const documents = await source.findDocumentsByTimestampBefore(
    "dogs", "purgeAfter", now, limit,
  );
  return documents.filter((document: FirestoreDocument<Record<string, unknown>>) =>
    isDogPurgeEligible(document.data, now)
  ).map((document) => ({
    documentName: document.name,
    dogId: document.id,
    archivedAt: document.data.archivedAt as string,
    purgeAfter: document.data.purgeAfter as string,
  }));
}
