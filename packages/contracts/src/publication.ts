export const PUBLICATION_STATUSES = ["draft", "published"] as const;
export type PublicationStatus = (typeof PUBLICATION_STATUSES)[number];
