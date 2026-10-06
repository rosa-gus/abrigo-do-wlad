import assert from "node:assert/strict";
import { test } from "vitest";

import worker, { type AppEnv } from "./index";

function createEnv(): AppEnv {
  return {
    ASSETS: {
      async fetch(request: Request): Promise<Response> {
        return new Response(`asset:${new URL(request.url).pathname}`);
      },
    },
    KV: {
      async get(): Promise<string> {
        return JSON.stringify({ id: "hero-123", nome: "Bidu" });
      },
      async put(): Promise<void> {},
    },
    APP_ENV: "production",
  };
}

test("GET /api/hero-dog returns the current hero dog", async () => {
  const response = await worker.fetch(
    new Request("https://example.com/api/hero-dog"),
    createEnv(),
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    message: "Hero dog fetched successfully.",
    data: { id: "hero-123", nome: "Bidu" },
  });
});

test("the legacy /api/hero-dog/get route is not exposed", async () => {
  const response = await worker.fetch(
    new Request("https://example.com/api/hero-dog/get"),
    createEnv(),
  );

  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), { message: "Route not found." });
});

test("GET /api/dogs returns a filtered page from the KV feed", async () => {
  const feed = {
    schemaVersion: 2,
    version: "2026-08-24",
    generatedAt: "2026-08-24T03:00:00.000Z",
    dogs: [
      {
        id: "dog-1",
        publicSlug: "bidu",
        nome: "Bidu",
        idade: "2 anos",
        cateIdade: "adulto",
        sexo: "Macho",
        temperamento: "Dócil",
        tags: ["docil"],
        status: "Disponível para Adoção",
        fotos: [],
        cor: "caramelo",
      },
    ],
  };
  const dogEnv: AppEnv = {
    ...createEnv(),
    KV: {
      async get(key): Promise<string | null> {
        if (key === "dogs-feed:current") return JSON.stringify(feed);
        if (key === `dogs-feed:${feed.version}`) return JSON.stringify(feed);
        return null;
      },
      async put(): Promise<void> {},
    },
  };
  const response = await worker.fetch(
    new Request("https://example.com/api/dogs?cateIdade=adulto"),
    dogEnv,
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    dogs: feed.dogs,
    totalItems: 1,
    currentPage: 1,
    totalPages: 1,
    itemsPerPage: 6,
    version: "2026-08-24",
    tagCounts: { docil: 1 },
  });
});

test("GET /api/dogs/by-slug/:slug returns one dog independently from pagination", async () => {
  const currentDog = {
    id: "dog-1",
    publicSlug: "bidu",
    nome: "Bidu",
    idade: "2 anos",
    cateIdade: "adulto",
    sexo: "Macho",
    temperamento: "Dócil",
    tags: ["docil"],
    status: "Vacinado e Castrado",
    fotos: [],
    cor: "caramelo",
  };
  const dogEnv: AppEnv = {
    ...createEnv(),
    KV: {
      async get(key): Promise<string | null> {
        if (key === "dogs-public-slug:slug:bidu") {
          return JSON.stringify({ schemaVersion: 1, id: "dog-1", slug: "bidu" });
        }
        if (key === "dogs-tombstone:dog-1") return null;
        if (key === "dogs-feed:current") {
          return JSON.stringify({
            schemaVersion: 2,
            version: "2026-08-28",
            generatedAt: "2026-08-28T03:00:00.000Z",
            dogs: [currentDog],
          });
        }
        return null;
      },
      async put(): Promise<void> {},
    },
  };

  const response = await worker.fetch(
    new Request("https://example.com/api/dogs/by-slug/bidu"),
    dogEnv,
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    state: "available",
    dog: currentDog,
  });
});

test("unknown API routes return JSON 404 without falling back to the SPA", async () => {
  const response = await worker.fetch(
    new Request("https://example.com/api/unknown"),
    createEnv(),
  );

  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), { message: "Route not found." });
});

test("non-API routes are delegated to the Static Assets binding", async () => {
  const response = await worker.fetch(
    new Request("https://example.com/sobre"),
    createEnv(),
  );

  assert.equal(response.status, 200);
  assert.equal(await response.text(), "asset:/sobre");
});
