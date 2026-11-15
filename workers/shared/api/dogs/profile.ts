import { createFirestoreClient } from "../_lib/firestore";
import { isPublished } from "../../publication";
import { isDogArchived } from "./archive";
import type { CloudflareEnv } from "../_lib/env";
import { jsonResponse } from "../_lib/env";
import { getCurrentDogFeed, type DogFeed, type PublicDog } from "./feed";
import {
  getDogPublicSlugBySlug,
  isValidDogPublicSlug,
} from "./public-slug";
import {
  getDogTombstone,
  type DogTombstone,
} from "./tombstone";

export type DogProfilePayload =
  | { state: "available"; dog: PublicDog }
  | { state: "unavailable"; tombstone: DogTombstone };

export type DogProfileResolution =
  | DogProfilePayload
  | { state: "not_found" };

function tombstoneIsNewerThanFeed(
  tombstone: DogTombstone,
  feedGeneratedAt: string,
): boolean {
  return Date.parse(tombstone.removedAt) >= Date.parse(feedGeneratedAt);
}

function unavailableResponse(tombstone: DogTombstone): Response {
  return jsonResponse(410, {
    state: "unavailable",
    tombstone,
  } satisfies DogProfilePayload, {
    "Cache-Control": "no-store",
  });
}

export async function resolveDogProfile(
  env: CloudflareEnv,
  dogId: string,
): Promise<DogProfileResolution> {
  const document = await createFirestoreClient(env).getDocument(`dogs/${dogId}`);
  if (document && !isDogArchived(document.data) && !isPublished(document.data)) {
    return { state: "not_found" };
  }
  if (document && isDogArchived(document.data) && (!isPublished(document.data) || !document.data.publishedAt)) {
    return { state: "not_found" };
  }
  const tombstone = await getDogTombstone(env, dogId);
  if (!document && !tombstone) return { state: "not_found" };
  if (document && isDogArchived(document.data)) {
    return tombstone ? { state: "unavailable", tombstone } : { state: "not_found" };
  }
  let feed: DogFeed;
  try {
    feed = await getCurrentDogFeed(env);
  } catch (error) {
    if (tombstone) return { state: "unavailable", tombstone };
    throw error;
  }

  const dog = feed.dogs.find((item) => item.id === dogId);
  if (
    tombstone &&
    (!dog || tombstoneIsNewerThanFeed(tombstone, feed.generatedAt))
  ) {
    return { state: "unavailable", tombstone };
  }
  if (dog) return { state: "available", dog };
  if (tombstone) return { state: "unavailable", tombstone };
  return { state: "not_found" };
}

export async function resolveDogProfileBySlug(
  env: CloudflareEnv,
  publicSlug: string,
): Promise<DogProfileResolution> {
  if (!isValidDogPublicSlug(publicSlug)) return { state: "not_found" };

  const slugRecord = await getDogPublicSlugBySlug(env, publicSlug);
  if (slugRecord) return resolveDogProfile(env, slugRecord.id);

  // A stale feed is rebuilt here on first access, backfilling slug records.
  const feed = await getCurrentDogFeed(env);
  const dog = feed.dogs.find((item) => item.publicSlug === publicSlug);
  return dog ? resolveDogProfile(env, dog.id) : { state: "not_found" };
}

function profileResponse(profile: DogProfileResolution): Response {
  if (profile.state === "unavailable") {
    return unavailableResponse(profile.tombstone);
  }
  if (profile.state === "available") {
    return jsonResponse(200, {
      state: "available",
      dog: profile.dog,
    } satisfies DogProfilePayload, {
      "Cache-Control": "no-store",
    });
  }
  return jsonResponse(404, { message: "Dog not found." });
}

export async function getDogProfileBySlugResponse(
  request: Request,
  env: CloudflareEnv,
  publicSlug: string,
): Promise<Response> {
  if (request.method !== "GET") {
    return new Response(null, {
      status: 405,
      headers: { Allow: "GET", "Cache-Control": "no-store" },
    });
  }
  if (!isValidDogPublicSlug(publicSlug)) {
    return jsonResponse(400, { message: "Invalid dog public slug." });
  }

  try {
    return profileResponse(await resolveDogProfileBySlug(env, publicSlug));
  } catch (error) {
    console.error(JSON.stringify({
      event: "dogs.profile-by-slug.request.failed",
      publicSlug,
      message: error instanceof Error ? error.message : "Unknown failure",
    }));
    return jsonResponse(503, { message: "Dog profile is temporarily unavailable." });
  }
}
