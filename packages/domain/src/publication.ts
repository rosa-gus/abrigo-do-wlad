import type { PublicationStatus } from "@abrigo/contracts/publication";
export { PUBLICATION_STATUSES } from "@abrigo/contracts/publication";
export type { PublicationStatus } from "@abrigo/contracts/publication";

export function isPublished(data: { publicationStatus?: unknown }): boolean {
  return data.publicationStatus === "published";
}

export function publicationMetadata(
  previous: { publishedAt?: unknown },
  status: PublicationStatus,
  now = new Date().toISOString(),
): { updatedAt: string; publishedAt?: string } {
  return {
    updatedAt: now,
    ...(status === "published" && typeof previous.publishedAt !== "string"
      ? { publishedAt: now }
      : {}),
  };
}
