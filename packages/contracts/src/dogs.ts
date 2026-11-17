export { dogInputSchema, dogDetailsSchema, dogUpdateSchema, dogEntitySchema } from "./entities";
export type { Dog, DogInput, DogDetailsInput, DogUpdate } from "./entities";

export const DOG_LIST_FIELDS = ["id", "nome", "idade", "cateIdade", "sexo", "temperamento", "tags", "status", "fotos", "cor", "instaLink", "descricaoCompleta", "publicationStatus", "archivedAt", "purgeAfter", "archiveReason", "archivedBy", "adoptionCountedAt", "retainedPhotos", "schemaVersion", "updatedAt", "publishedAt"] as const;
export const DOG_DETAIL_FIELDS = [...DOG_LIST_FIELDS, "publicSlug"] as const;
