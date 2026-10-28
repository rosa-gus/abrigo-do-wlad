import assert from "node:assert/strict";
import { test, vi } from "vitest";

import type { CloudflareEnv } from "../_lib/env";
import type { DogFeed, PublicDog } from "./feed";
import { getDogProfileBySlugResponse } from "./profile";
import type { DogTombstone } from "./tombstone";

function dog(id = "dog-1"): PublicDog {
  return {
    id,
    publicSlug: "pacoca",
    nome: "Paçoca",
    idade: "2 anos",
    cateIdade: "adulto",
    sexo: "Macho",
    temperamento: "Dócil",
    tags: ["docil"],
    status: "Vacinado e Castrado",
    fotos: [],
    cor: "caramelo",
  };
}

function feed(dogs: PublicDog[], generatedAt = "2026-08-28T14:00:00.000Z"): DogFeed {
  return {
    schemaVersion: 2,
    version: "2026-08-28",
    generatedAt,
    dogs,
  };
}

function tombstone(
  removedAt = "2026-08-28T15:00:00.000Z",
): DogTombstone {
  return {
    schemaVersion: 1,
    id: "dog-1",
    publicSlug: "pacoca",
    nome: "Paçoca",
    status: "adopted",
    removedAt,
  };
}

function envWith(values: Record<string, unknown>): CloudflareEnv {
  const allValues = {
    "dogs-public-slug:slug:pacoca": {
      schemaVersion: 1,
      id: "dog-1",
      slug: "pacoca",
    },
    ...values,
  };
  return {
    APP_ENV: "production",
    KV: {
      async get(key) {
        const value = allValues[key];
        return value === undefined ? null : JSON.stringify(value);
      },
      async put() {},
    },
  };
}

test("returns an available dog from the current feed", async () => {
  const currentDog = dog();
  const response = await getDogProfileBySlugResponse(
    new Request("https://abrigo.test/api/dogs/by-slug/pacoca"),
    envWith({ "dogs-feed:current": feed([currentDog]) }),
    "pacoca",
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { state: "available", dog: currentDog });
});

test("returns an available dog through its public slug registry", async () => {
  const currentDog = dog();
  const response = await getDogProfileBySlugResponse(
    new Request("https://abrigo.test/api/dogs/by-slug/pacoca"),
    envWith({
      "dogs-public-slug:slug:pacoca": {
        schemaVersion: 1,
        id: "dog-1",
        slug: "pacoca",
      },
      "dogs-feed:current": feed([currentDog]),
    }),
    "pacoca",
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    state: "available",
    dog: currentDog,
  });
});

test("a tombstone newer than the feed wins over a stale available dog", async () => {
  const removedDog = tombstone();
  const response = await getDogProfileBySlugResponse(
    new Request("https://abrigo.test/api/dogs/by-slug/pacoca"),
    envWith({
      "dogs-feed:current": feed([dog()]),
      "dogs-tombstone:dog-1": removedDog,
    }),
    "pacoca",
  );

  assert.equal(response.status, 410);
  assert.deepEqual(await response.json(), {
    state: "unavailable",
    tombstone: removedDog,
  });
});

test("a newer feed can supersede an orphan tombstone", async () => {
  const currentDog = dog();
  const response = await getDogProfileBySlugResponse(
    new Request("https://abrigo.test/api/dogs/by-slug/pacoca"),
    envWith({
      "dogs-feed:current": feed([currentDog], "2026-08-28T16:00:00.000Z"),
      "dogs-tombstone:dog-1": tombstone(),
    }),
    "pacoca",
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { state: "available", dog: currentDog });
});

test("returns a tombstone even when the current feed cannot be read", async () => {
  const removedDog = tombstone();
  const errorLog = vi.spyOn(console, "error").mockImplementation(() => undefined);
  const env: CloudflareEnv = {
    APP_ENV: "production",
    KV: {
      async get(key) {
        if (key === "dogs-public-slug:slug:pacoca") {
          return JSON.stringify({ schemaVersion: 1, id: "dog-1", slug: "pacoca" });
        }
        if (key === "dogs-tombstone:dog-1") return JSON.stringify(removedDog);
        throw new Error("feed unavailable");
      },
      async put() {},
    },
  };

  const response = await getDogProfileBySlugResponse(
    new Request("https://abrigo.test/api/dogs/by-slug/pacoca"),
    env,
    "pacoca",
  );

  assert.equal(response.status, 410);
  assert.deepEqual(await response.json(), {
    state: "unavailable",
    tombstone: removedDog,
  });
  errorLog.mockRestore();
});

test("distinguishes unknown and invalid public slugs", async () => {
  const env = envWith({ "dogs-feed:current": feed([]) });
  const missingResponse = await getDogProfileBySlugResponse(
    new Request("https://abrigo.test/api/dogs/by-slug/missing"),
    env,
    "missing",
  );
  const invalidResponse = await getDogProfileBySlugResponse(
    new Request("https://abrigo.test/api/dogs/by-slug/invalid%2Fslug"),
    env,
    "invalid%2Fslug",
  );

  assert.equal(missingResponse.status, 404);
  assert.equal(invalidResponse.status, 400);
});
