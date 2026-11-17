import type { CloudflareEnv } from "../env";
import { getKvStore } from "../kv";
import {
  ensureDogPublicSlug,
  isValidDogPublicSlug,
  isValidPublicDogId,
} from "./public-slug";

const DOG_TOMBSTONE_KEY_PREFIX = "dogs-tombstone:";
const DOG_TOMBSTONE_SCHEMA_VERSION = 1;

import type { DogTombstone, DogTombstoneInput } from "@abrigo/contracts/public";
export type { DogTombstone, DogTombstoneInput, DogTombstoneStatus } from "@abrigo/contracts/public";

function dogTombstoneKey(id: string): string {
  if (!isValidPublicDogId(id)) {
    throw new Error("Invalid public dog ID.");
  }
  return `${DOG_TOMBSTONE_KEY_PREFIX}${id}`;
}

function isDogTombstone(value: unknown): value is DogTombstone {
  if (!value || typeof value !== "object") return false;
  const tombstone = value as Record<string, unknown>;
  return (
    tombstone.schemaVersion === DOG_TOMBSTONE_SCHEMA_VERSION &&
    typeof tombstone.id === "string" &&
    isValidPublicDogId(tombstone.id) &&
    typeof tombstone.publicSlug === "string" &&
    isValidDogPublicSlug(tombstone.publicSlug) &&
    typeof tombstone.nome === "string" &&
    tombstone.nome.trim().length > 0 &&
    (tombstone.status === "adopted" || tombstone.status === "unavailable") &&
    typeof tombstone.removedAt === "string" &&
    Number.isFinite(Date.parse(tombstone.removedAt))
  );
}

export async function saveDogTombstone(
  env: CloudflareEnv,
  input: DogTombstoneInput,
): Promise<DogTombstone> {
  const slugRecord = await ensureDogPublicSlug(env, input);
  const tombstone: DogTombstone = {
    schemaVersion: DOG_TOMBSTONE_SCHEMA_VERSION,
    ...input,
    publicSlug: slugRecord.slug,
    nome: input.nome.trim(),
  };
  if (!isDogTombstone(tombstone)) {
    throw new Error("Invalid dog tombstone.");
  }

  await getKvStore(env).set(dogTombstoneKey(tombstone.id), tombstone);
  return tombstone;
}

export async function getDogTombstone(
  env: CloudflareEnv,
  id: string,
): Promise<DogTombstone | null> {
  const tombstone = await getKvStore(env).get<unknown>(dogTombstoneKey(id));
  return isDogTombstone(tombstone) && tombstone.id === id ? tombstone : null;
}

export async function deleteDogTombstone(env: CloudflareEnv, id: string): Promise<void> {
  await getKvStore(env).delete(dogTombstoneKey(id));
}
