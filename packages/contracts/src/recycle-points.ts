export { recyclePointInputSchema, recyclePointUpdateSchema, recyclePointEntitySchema } from "./entities";
export type { RecyclePoint, RecyclePointInput, RecyclePointUpdate } from "./entities";

export const RECYCLE_LIST_FIELDS = ["zone", "neighborhood", "name", "address", "googleMapsUrl", "publicationStatus", "schemaVersion", "updatedAt", "publishedAt"] as const;
export const RECYCLE_DETAIL_FIELDS = RECYCLE_LIST_FIELDS;
