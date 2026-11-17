/** Public projections are intentionally separate from administrative records. */
export interface PublicDog<TStatus extends string = string> {
  id: string; publicSlug: string; nome: string; idade: string;
  cateIdade: "filhote" | "adulto" | "idoso";
  sexo: string; temperamento: string; tags: string[]; status: TStatus;
  fotos: string[]; cor: string; instaLink?: string; descricaoCompleta?: string;
}
export interface DogFeed {
  schemaVersion: 2; version: string; generatedAt: string; dogs: PublicDog[];
}
export interface DogFeedPage<TDog extends PublicDog = PublicDog, TCounts = Record<string, number>> {
  dogs: TDog[]; totalItems: number; currentPage: number; totalPages: number;
  itemsPerPage: number; version: string; tagCounts: TCounts;
}
export type DogTombstoneStatus = "adopted" | "unavailable";
export interface DogTombstone {
  schemaVersion: 1; id: string; publicSlug: string; nome: string;
  status: DogTombstoneStatus; removedAt: string;
}
export type DogTombstoneInput = Omit<DogTombstone, "schemaVersion" | "publicSlug">;
export type DogProfile<TDog extends PublicDog = PublicDog> =
  | { state: "available"; dog: TDog }
  | { state: "unavailable"; tombstone: DogTombstone };
export interface PublicRecyclePoint {
  id?: string; zone: string; neighborhood: string; name?: string; address: string; googleMapsUrl?: string;
}
export interface PublicSystemSettings { acceptingApplications: boolean }
