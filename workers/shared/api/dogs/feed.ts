import type { FirestoreDocument, FirestoreRestClient } from "../_lib/firestore";
import { createFirestoreClient } from "../_lib/firestore";
import type { CloudflareEnv } from "../_lib/env";
import { jsonResponse } from "../_lib/env";
import { getKvStore } from "../_lib/kv";
import { isDogArchived } from "./archive";
import {
  ensureDogPublicSlug,
  isValidDogPublicSlug,
} from "./public-slug";

const DOGS_COLLECTION = "dogs";
const CURRENT_FEED_KEY = "dogs-feed:current";
const FEED_KEY_PREFIX = "dogs-feed:";
const FEED_SCHEMA_VERSION = 2;
const FEED_RETENTION_SECONDS = 3 * 24 * 60 * 60;
const DEFAULT_ITEMS_PER_PAGE = 6;
const MAX_ITEMS_PER_PAGE = 24;
const MAX_TAG_FILTERS = 15;
const ROTATION_TIME_ZONE = "America/Sao_Paulo";
const DOG_TAG_VALUES = new Set([
  "docil",
  "brincalhao",
  "medroso",
  "ativo",
  "tranquilo",
  "sociavel",
  "resiliente",
  "carinhoso",
  "amavel",
  "curioso",
  "timido",
  "independente",
  "protetor",
  "companheiro",
  "adaptavel",
]);

function normalizeDogTag(value: string): string | null {
  const normalized = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase()
    .trim();
  return DOG_TAG_VALUES.has(normalized) ? normalized : null;
}

export interface PublicDog {
  id: string;
  publicSlug: string;
  nome: string;
  idade: string;
  cateIdade: "filhote" | "adulto" | "idoso";
  sexo: string;
  temperamento: string;
  tags: string[];
  status: string;
  fotos: string[];
  cor: string;
  instaLink?: string;
  descricaoCompleta?: string;
}

export interface DogFeed {
  schemaVersion: typeof FEED_SCHEMA_VERSION;
  version: string;
  generatedAt: string;
  dogs: PublicDog[];
}

export interface DogFeedPage {
  dogs: PublicDog[];
  totalItems: number;
  currentPage: number;
  totalPages: number;
  itemsPerPage: number;
  version: string;
  tagCounts: Record<string, number>;
}

type DogFeedSource = Pick<FirestoreRestClient, "listDocuments">;

export interface DogFeedUpdateOptions {
  now?: Date;
  source?: DogFeedSource;
}

function rotationVersion(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: ROTATION_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function seededRandom(seed: string): () => number {
  let state = 2_166_136_261;
  for (let index = 0; index < seed.length; index += 1) {
    state ^= seed.charCodeAt(index);
    state = Math.imul(state, 16_777_619);
  }

  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}

export function seededShuffle<T>(items: readonly T[], seed: string): T[] {
  const shuffled = [...items];
  const random = seededRandom(seed);

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const selectedIndex = Math.floor(random() * (index + 1));
    [shuffled[index], shuffled[selectedIndex]] = [
      shuffled[selectedIndex],
      shuffled[index],
    ];
  }

  return shuffled;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function toPublicDog(
  document: FirestoreDocument<Record<string, unknown>>,
): Omit<PublicDog, "publicSlug"> | null {
  const data = document.data;
  if (
    typeof data.nome !== "string" ||
    typeof data.idade !== "string" ||
    !["filhote", "adulto", "idoso"].includes(String(data.cateIdade)) ||
    typeof data.sexo !== "string" ||
    typeof data.temperamento !== "string" ||
    !isStringArray(data.tags) ||
    typeof data.status !== "string" ||
    !isStringArray(data.fotos) ||
    typeof data.cor !== "string"
  ) {
    console.warn(JSON.stringify({
      event: "dogs.feed.document.skipped",
      documentId: document.id,
    }));
    return null;
  }

  const tags = data.tags.map(normalizeDogTag);
  if (tags.some((tag) => tag === null)) {
    console.warn(JSON.stringify({
      event: "dogs.feed.document.skipped",
      documentId: document.id,
      reason: "invalid_tag",
    }));
    return null;
  }

  return {
    id: document.id,
    nome: data.nome,
    idade: data.idade,
    cateIdade: data.cateIdade as PublicDog["cateIdade"],
    sexo: data.sexo,
    temperamento: data.temperamento,
    tags: tags as string[],
    status: data.status,
    fotos: data.fotos,
    cor: data.cor,
    ...(typeof data.instaLink === "string" && data.instaLink
      ? { instaLink: data.instaLink }
      : {}),
    ...(typeof data.descricaoCompleta === "string"
      ? { descricaoCompleta: data.descricaoCompleta }
      : {}),
  };
}

function isPublicDog(value: unknown): value is PublicDog {
  if (!value || typeof value !== "object") return false;
  const dog = value as Record<string, unknown>;
  return (
    typeof dog.id === "string" &&
    typeof dog.publicSlug === "string" &&
    isValidDogPublicSlug(dog.publicSlug) &&
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

function isDogFeed(value: unknown): value is DogFeed {
  if (!value || typeof value !== "object") return false;
  const feed = value as Record<string, unknown>;
  return (
    feed.schemaVersion === FEED_SCHEMA_VERSION &&
    typeof feed.version === "string" &&
    typeof feed.generatedAt === "string" &&
    Array.isArray(feed.dogs) &&
    feed.dogs.every(isPublicDog)
  );
}

function normalizeStoredDogFeed(value: unknown): DogFeed | null {
  if (!isDogFeed(value)) return null;

  const dogs: PublicDog[] = [];
  for (const dog of value.dogs) {
    const tags = dog.tags.map(normalizeDogTag);
    if (tags.some((tag) => tag === null)) return null;
    dogs.push({ ...dog, tags: tags as string[] });
  }

  return { ...value, dogs };
}

export async function updateDogFeed(
  env: CloudflareEnv,
  options: DogFeedUpdateOptions = {},
): Promise<DogFeed> {
  const now = options.now ?? new Date();
  const version = rotationVersion(now);
  const source = options.source ?? createFirestoreClient(env);
  const documents = await source.listDocuments<Record<string, unknown>>(
    DOGS_COLLECTION,
  );
  const sourceDogs = documents.flatMap((document) => {
    if (isDogArchived(document.data)) return [];
    const dog = toPublicDog(document);
    return dog ? [dog] : [];
  });
  const dogs: PublicDog[] = [];
  // Allocation is deliberately sequential so same-name collisions are stable.
  for (const dog of sourceDogs) {
    const slugRecord = await ensureDogPublicSlug(env, dog);
    dogs.push({ ...dog, publicSlug: slugRecord.slug });
  }
  const feed: DogFeed = {
    schemaVersion: FEED_SCHEMA_VERSION,
    version,
    generatedAt: now.toISOString(),
    dogs: seededShuffle(dogs, version),
  };
  const kv = getKvStore(env);

  // Keep a versioned copy for stable pagination and a self-contained current copy.
  // Using the full feed as the current value avoids cross-key replication ordering.
  await kv.set(`${FEED_KEY_PREFIX}${version}`, feed, {
    expirationTtl: FEED_RETENTION_SECONDS,
  });
  await kv.set(CURRENT_FEED_KEY, feed);

  console.log(JSON.stringify({
    event: "dogs.feed.updated",
    version,
    total: feed.dogs.length,
  }));
  return feed;
}

async function readDogFeed(
  env: CloudflareEnv,
  requestedVersion?: string,
): Promise<DogFeed | null> {
  const kv = getKvStore(env);
  const feed = await kv.get<unknown>(
    requestedVersion
      ? `${FEED_KEY_PREFIX}${requestedVersion}`
      : CURRENT_FEED_KEY,
  );
  const normalizedFeed = normalizeStoredDogFeed(feed);
  if (
    normalizedFeed &&
    (!requestedVersion || normalizedFeed.version === requestedVersion)
  ) {
    return normalizedFeed;
  }

  if (!requestedVersion) return null;

  // The current feed is a complete copy, not only a pointer. It remains a safe
  // fallback when its matching versioned key has expired or has not replicated
  // yet, so pagination does not reset to page one between requests.
  const currentFeed = await kv.get<unknown>(CURRENT_FEED_KEY);
  const normalizedCurrentFeed = normalizeStoredDogFeed(currentFeed);
  return normalizedCurrentFeed?.version === requestedVersion
    ? normalizedCurrentFeed
    : null;
}

export async function getCurrentDogFeed(env: CloudflareEnv): Promise<DogFeed> {
  return (await readDogFeed(env)) ?? updateDogFeed(env);
}

function positiveInteger(
  value: string | null,
  fallback: number,
  maximum?: number,
): number | null {
  if (value === null) return fallback;
  if (!/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || (maximum && parsed > maximum)) {
    return null;
  }
  return parsed;
}

function optionalFilter(value: string | null): string | undefined {
  const normalized = value?.trim();
  return !normalized || normalized === "all" ? undefined : normalized;
}

function countDogTags(dogs: readonly PublicDog[]): Record<string, number> {
  const counts: Record<string, number> = {};

  dogs.forEach((dog) => {
    const uniqueTags = new Set(
      dog.tags
        .map(normalizeDogTag)
        .filter((tag): tag is string => tag !== null),
    );
    uniqueTags.forEach((tag) => {
      counts[tag] = (counts[tag] ?? 0) + 1;
    });
  });

  return counts;
}

export function paginateDogFeed(feed: DogFeed, url: URL): DogFeedPage | null {
  const page = positiveInteger(url.searchParams.get("page"), 1);
  const itemsPerPage = positiveInteger(
    url.searchParams.get("limit"),
    DEFAULT_ITEMS_PER_PAGE,
    MAX_ITEMS_PER_PAGE,
  );
  if (!page || !itemsPerPage) return null;

  const cateIdade = optionalFilter(url.searchParams.get("cateIdade"));
  const cor = optionalFilter(url.searchParams.get("cor"));
  const tags = Array.from(new Set(
    url.searchParams
      .getAll("tag")
      .map(optionalFilter)
      .filter((tag): tag is string => Boolean(tag)),
  ));
  if (
    (cateIdade && !["filhote", "adulto", "idoso"].includes(cateIdade)) ||
    (cor && cor.length > 80) ||
    tags.length > MAX_TAG_FILTERS ||
    tags.some((tag) => !DOG_TAG_VALUES.has(tag))
  ) {
    return null;
  }

  const filtered = feed.dogs.filter((dog) =>
    (!cateIdade || dog.cateIdade === cateIdade) &&
    (!cor || dog.cor === cor) &&
    tags.every((tag) => dog.tags.includes(tag))
  );
  const totalItems = filtered.length;
  const totalPages = Math.ceil(totalItems / itemsPerPage);
  const start = (page - 1) * itemsPerPage;

  return {
    dogs: filtered.slice(start, start + itemsPerPage),
    totalItems,
    currentPage: page,
    totalPages,
    itemsPerPage,
    version: feed.version,
    tagCounts: countDogTags(feed.dogs),
  };
}

export async function getDogFeedResponse(
  request: Request,
  env: CloudflareEnv,
): Promise<Response> {
  if (request.method !== "GET") {
    return new Response(null, {
      status: 405,
      headers: { Allow: "GET", "Cache-Control": "no-store" },
    });
  }

  const url = new URL(request.url);
  const requestedVersion = optionalFilter(url.searchParams.get("version"));
  if (requestedVersion && !/^\d{4}-\d{2}-\d{2}$/.test(requestedVersion)) {
    return jsonResponse(400, { message: "Invalid feed version." });
  }

  try {
    const feed = requestedVersion
      ? await readDogFeed(env, requestedVersion)
      : await getCurrentDogFeed(env);
    if (!feed) {
      return jsonResponse(409, {
        message: "Requested feed version is no longer available.",
      });
    }
    const page = paginateDogFeed(feed, url);
    if (!page) {
      return jsonResponse(400, { message: "Invalid dog feed parameters." });
    }

    return jsonResponse(200, page, {
      "Cache-Control": "public, max-age=60, s-maxage=300",
    });
  } catch (error) {
    console.error(JSON.stringify({
      event: "dogs.feed.request.failed",
      message: error instanceof Error ? error.message : "Unknown failure",
    }));
    return jsonResponse(503, {
      message: "Dog feed is temporarily unavailable.",
    });
  }
}
