export const PUBLICATION_STATUSES = ["draft", "published"] as const;
export type PublicationStatus = (typeof PUBLICATION_STATUSES)[number];

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
