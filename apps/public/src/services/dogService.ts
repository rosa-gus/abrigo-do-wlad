import {
  TAGS_MAP,
  type Dog,
  type DogFilters,
  type DogProfile,
  type DogTagCounts,
  type DogTombstone,
} from "@/types/dogs";

export type DogFeedPage = import("@abrigo/contracts/public").DogFeedPage<Dog, DogTagCounts>;

export class DogFeedVersionError extends Error {
  constructor() {
    super("A versão da lista de cães expirou.");
    this.name = "DogFeedVersionError";
  }
}

export class DogProfileNotFoundError extends Error {
  constructor() {
    super("O cachorro solicitado não foi encontrado.");
    this.name = "DogProfileNotFoundError";
  }
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isDog(value: unknown): value is Dog {
  if (!value || typeof value !== "object") return false;
  const dog = value as Record<string, unknown>;
  return (
    typeof dog.id === "string" &&
    typeof dog.publicSlug === "string" &&
    typeof dog.nome === "string" &&
    typeof dog.idade === "string" &&
    ["filhote", "adulto", "idoso"].includes(String(dog.cateIdade)) &&
    typeof dog.sexo === "string" &&
    typeof dog.temperamento === "string" &&
    isStringArray(dog.tags) &&
    typeof dog.status === "string" &&
    isStringArray(dog.fotos) &&
    typeof dog.cor === "string"
  );
}

function isDogTombstone(value: unknown): value is DogTombstone {
  if (!value || typeof value !== "object") return false;
  const tombstone = value as Record<string, unknown>;
  return (
    tombstone.schemaVersion === 1 &&
    typeof tombstone.id === "string" &&
    typeof tombstone.publicSlug === "string" &&
    typeof tombstone.nome === "string" &&
    (tombstone.status === "adopted" || tombstone.status === "unavailable") &&
    typeof tombstone.removedAt === "string"
  );
}

function isDogProfile(value: unknown): value is DogProfile {
  if (!value || typeof value !== "object") return false;
  const profile = value as Record<string, unknown>;
  return (
    (profile.state === "available" && isDog(profile.dog)) ||
    (profile.state === "unavailable" && isDogTombstone(profile.tombstone))
  );
}

function isDogFeedPage(value: unknown): value is DogFeedPage {
  if (!value || typeof value !== "object") return false;
  const page = value as Record<string, unknown>;
  return (
    Array.isArray(page.dogs) &&
    page.dogs.every(isDog) &&
    typeof page.totalItems === "number" &&
    typeof page.currentPage === "number" &&
    typeof page.totalPages === "number" &&
    typeof page.itemsPerPage === "number" &&
    typeof page.version === "string" &&
    isDogTagCounts(page.tagCounts)
  );
}

function isDogTagCounts(value: unknown): value is DogTagCounts {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;

  return Object.entries(value).every(
    ([tag, count]) =>
      Object.hasOwn(TAGS_MAP, tag) &&
      typeof count === "number" &&
      Number.isInteger(count) &&
      count > 0,
  );
}

export async function getDogFeedPage(
  filters: DogFilters,
  page: number,
  itemsPerPage: number,
  version?: string,
  signal?: AbortSignal,
): Promise<DogFeedPage> {
  const params = new URLSearchParams({
    page: String(page),
    limit: String(itemsPerPage),
  });
  if (filters.cateIdade && filters.cateIdade !== "all") {
    params.set("cateIdade", filters.cateIdade);
  }
  if (filters.cor && filters.cor !== "all") {
    params.set("cor", filters.cor);
  }
  filters.tags?.forEach((tag) => params.append("tag", tag));
  if (version) {
    params.set("version", version);
  }

  const response = await fetch(`/api/dogs?${params.toString()}`, {
    headers: { Accept: "application/json" },
    signal,
  });
  if (response.status === 409 && version) {
    throw new DogFeedVersionError();
  }
  if (!response.ok) {
    throw new Error(`Falha ao carregar cães (HTTP ${response.status}).`);
  }

  const payload: unknown = await response.json();
  if (!isDogFeedPage(payload)) {
    throw new Error("A API retornou uma lista de cães inválida.");
  }
  return payload;
}

export async function getDogProfileBySlug(
  publicSlug: string,
  signal?: AbortSignal,
): Promise<DogProfile> {
  const response = await fetch(
    `/api/dogs/by-slug/${encodeURIComponent(publicSlug)}`,
    {
      headers: { Accept: "application/json" },
      signal,
    },
  );
  if (response.status === 404) throw new DogProfileNotFoundError();

  const payload: unknown = await response.json().catch(() => null);
  if (response.status === 410 && isDogProfile(payload) && payload.state === "unavailable") {
    return payload;
  }
  if (!response.ok) {
    throw new Error(`Falha ao carregar o cachorro (HTTP ${response.status}).`);
  }
  if (!isDogProfile(payload) || payload.state !== "available") {
    throw new Error("A API retornou um perfil de cachorro inválido.");
  }
  return payload;
}
