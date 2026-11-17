import {
  FirestoreRestError,
  type FirestoreDocument,
  type FirestoreRestClient,
} from "../firestore";

export const FEED_PUBLICATION_PATH = "system/dog-feed-publication";
const LEASE_MS = 60_000;
type Repository = Pick<FirestoreRestClient, "getDocument" | "createDocument" | "updateDocument">;
type PublicationState = Record<string, unknown> & {
  leaseId?: string;
  leaseExpiresAt?: string;
  version?: string;
};

export class PublicationBusyError extends Error {
  constructor() { super("Dog feed publication is already in progress."); }
}

export function isPublicationConflict(error: unknown): boolean {
  return error instanceof FirestoreRestError && (
    [409, 412].includes(error.status)
    || error.code === "FAILED_PRECONDITION"
    || error.code === "ABORTED"
    || error.code === "ALREADY_EXISTS"
  );
}

export interface FeedPublicationLease {
  id: string;
  updateTime: string;
  expiresAt: Date;
}

/** The Firestore revision fences a worker whose lease expired while KV was slow. */
export async function acquireFeedPublicationLease(
  repository: Repository,
  now = new Date(),
): Promise<FeedPublicationLease> {
  const existing = await repository.getDocument<PublicationState>(FEED_PUBLICATION_PATH);
  if (existing?.data.leaseId && typeof existing.data.leaseExpiresAt === "string"
    && Date.parse(existing.data.leaseExpiresAt) > now.getTime()) {
    throw new PublicationBusyError();
  }
  const id = crypto.randomUUID();
  const expiresAt = new Date(now.getTime() + LEASE_MS);
  const data = { leaseId: id, leaseExpiresAt: expiresAt.toISOString() };
  try {
    if (existing && !existing.updateTime) throw new Error("Publication revision unavailable.");
    const result = existing
      ? await repository.updateDocument(existing.name, data, { expectedUpdateTime: existing.updateTime })
      : await repository.createDocument("system", data, { documentId: "dog-feed-publication" });
    if (!result.updateTime) throw new Error("Publication lease revision unavailable.");
    return { id, updateTime: result.updateTime, expiresAt };
  } catch (error) {
    if (isPublicationConflict(error)) throw new PublicationBusyError();
    throw error;
  }
}

export async function promoteFeedSnapshot(
  repository: Repository,
  lease: FeedPublicationLease,
  version: string,
  now = new Date(),
): Promise<void> {
  if (now.getTime() >= lease.expiresAt.getTime()) throw new PublicationBusyError();
  const current = await repository.getDocument<PublicationState>(FEED_PUBLICATION_PATH);
  if (!current || current.data.leaseId !== lease.id || current.updateTime !== lease.updateTime) {
    throw new PublicationBusyError();
  }
  try {
    await repository.updateDocument(current.name, {
      version,
      publishedAt: now.toISOString(),
      leaseId: null,
      leaseExpiresAt: null,
    }, { expectedUpdateTime: lease.updateTime });
  } catch (error) {
    if (isPublicationConflict(error)) throw new PublicationBusyError();
    throw error;
  }
}

export async function currentFeedSnapshotVersion(repository: Repository): Promise<string | undefined> {
  const current: FirestoreDocument<PublicationState> | null = await repository.getDocument(FEED_PUBLICATION_PATH);
  return typeof current?.data.version === "string" ? current.data.version : undefined;
}
