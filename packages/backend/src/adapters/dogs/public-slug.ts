import type { CloudflareEnv } from "../env";
import { getKvStore } from "../kv";

const DOG_PUBLIC_SLUG_SCHEMA_VERSION = 1;
const DOG_PUBLIC_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;
const DOG_PUBLIC_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const DOG_PUBLIC_SLUG_MAX_LENGTH = 96;
const DOG_PUBLIC_SLUG_BY_ID_PREFIX = "dogs-public-slug:id:";
const DOG_PUBLIC_SLUG_OWNER_PREFIX = "dogs-public-slug:slug:";
const MAX_SLUG_ATTEMPTS = 10_000;

export interface DogPublicSlugRecord {
  schemaVersion: typeof DOG_PUBLIC_SLUG_SCHEMA_VERSION;
  id: string;
  slug: string;
}

export interface DogPublicSlugSubject {
  id: string;
  nome: string;
}

export function isValidPublicDogId(id: string): boolean {
  return DOG_PUBLIC_ID_PATTERN.test(id);
}

export function isValidDogPublicSlug(slug: string): boolean {
  return slug.length <= DOG_PUBLIC_SLUG_MAX_LENGTH &&
    DOG_PUBLIC_SLUG_PATTERN.test(slug);
}

export function dogSlugFromName(nome: string): string {
  const slug = nome
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/g, "");

  return slug || "cao";
}

export function dogProfilePath(publicSlug: string): string {
  if (!isValidDogPublicSlug(publicSlug)) {
    throw new Error("Invalid dog public slug.");
  }
  return `/caes/${publicSlug}`;
}

function publicSlugByIdKey(id: string): string {
  if (!isValidPublicDogId(id)) throw new Error("Invalid public dog ID.");
  return `${DOG_PUBLIC_SLUG_BY_ID_PREFIX}${id}`;
}

function publicSlugOwnerKey(slug: string): string {
  if (!isValidDogPublicSlug(slug)) throw new Error("Invalid dog public slug.");
  return `${DOG_PUBLIC_SLUG_OWNER_PREFIX}${slug}`;
}

function isDogPublicSlugRecord(value: unknown): value is DogPublicSlugRecord {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return record.schemaVersion === DOG_PUBLIC_SLUG_SCHEMA_VERSION &&
    typeof record.id === "string" &&
    isValidPublicDogId(record.id) &&
    typeof record.slug === "string" &&
    isValidDogPublicSlug(record.slug);
}

function collisionCandidate(base: string, attempt: number): string {
  if (attempt === 1) return base;
  const suffix = `-${attempt}`;
  return `${base.slice(0, DOG_PUBLIC_SLUG_MAX_LENGTH - suffix.length)}${suffix}`;
}

export async function getDogPublicSlugById(
  env: CloudflareEnv,
  id: string,
): Promise<DogPublicSlugRecord | null> {
  const record = await getKvStore(env).get<unknown>(publicSlugByIdKey(id));
  return isDogPublicSlugRecord(record) && record.id === id ? record : null;
}

export async function getDogPublicSlugBySlug(
  env: CloudflareEnv,
  slug: string,
): Promise<DogPublicSlugRecord | null> {
  const record = await getKvStore(env).get<unknown>(publicSlugOwnerKey(slug));
  return isDogPublicSlugRecord(record) && record.slug === slug ? record : null;
}

export async function ensureDogPublicSlug(
  env: CloudflareEnv,
  subject: DogPublicSlugSubject,
): Promise<DogPublicSlugRecord> {
  if (!isValidPublicDogId(subject.id) || !subject.nome.trim()) {
    throw new Error("Invalid dog public slug subject.");
  }

  const existing = await getDogPublicSlugById(env, subject.id);
  if (existing) return existing;

  const kv = getKvStore(env);
  const base = dogSlugFromName(subject.nome);
  for (let attempt = 1; attempt <= MAX_SLUG_ATTEMPTS; attempt += 1) {
    const slug = collisionCandidate(base, attempt);
    const owner = await getDogPublicSlugBySlug(env, slug);
    if (owner?.id === subject.id) {
      await kv.set(publicSlugByIdKey(subject.id), owner);
      return owner;
    }
    if (owner) continue;

    const record: DogPublicSlugRecord = {
      schemaVersion: DOG_PUBLIC_SLUG_SCHEMA_VERSION,
      id: subject.id,
      slug,
    };
    // Write the owner first so a partial write cannot expose an unreserved slug.
    await kv.set(publicSlugOwnerKey(slug), record);
    await kv.set(publicSlugByIdKey(subject.id), record);
    return record;
  }

  throw new Error("Unable to allocate a unique dog public slug.");
}
