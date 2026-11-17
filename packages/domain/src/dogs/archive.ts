export const DOG_ARCHIVE_RETENTION_DAYS = 30;
const DAY_MS = 86_400_000;

export type DogArchiveReason = "adopted_via_site" | "other";

export function dogArchiveDates(now: Date = new Date()): {
  archivedAt: string;
  purgeAfter: string;
} {
  if (!Number.isFinite(now.getTime())) throw new TypeError("Invalid archive date.");
  return {
    archivedAt: now.toISOString(),
    purgeAfter: new Date(now.getTime() + DOG_ARCHIVE_RETENTION_DAYS * DAY_MS).toISOString(),
  };
}

export function isDogArchived(data: { archivedAt?: unknown }): boolean {
  return typeof data.archivedAt === "string" && data.archivedAt.length > 0;
}

export function isDogPurgeEligible(data: { archivedAt?: unknown; purgeAfter?: unknown }, now: Date): boolean {
  if (!isDogArchived(data) || typeof data.purgeAfter !== "string") return false;
  const archivedAt = Date.parse(data.archivedAt as string);
  const purgeAfter = Date.parse(data.purgeAfter);
  return Number.isFinite(archivedAt)
    && Number.isFinite(purgeAfter)
    && purgeAfter >= archivedAt + DOG_ARCHIVE_RETENTION_DAYS * DAY_MS
    && now.getTime() >= purgeAfter;
}
