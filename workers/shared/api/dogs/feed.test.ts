import assert from "node:assert/strict";
import { test, vi } from "vitest";

import type { CloudflareEnv } from "../_lib/env";
import type { FirestoreDocument } from "../_lib/firestore";
import {
  getDogFeedResponse,
  paginateDogFeed,
  seededShuffle,
  updateDogFeed,
  type DogFeed,
  type PublicDog,
} from "./feed";

function dog(id: string, overrides: Partial<PublicDog> = {}): PublicDog {
  return {
    id,
    publicSlug: `cao-${id}`,
    nome: `Cão ${id}`,
    idade: "2 anos",
    cateIdade: "adulto",
    sexo: "Macho",
    temperamento: "Dócil",
    tags: ["docil"],
    status: "Disponível para Adoção",
    fotos: [`https://res.cloudinary.com/example/image/upload/${id}.jpg`],
    cor: "caramelo",
    ...overrides,
  };
}

function document(item: PublicDog): FirestoreDocument<Record<string, unknown>> {
  const { id, ...data } = item;
  return {
    id,
    name: `projects/test/databases/(default)/documents/dogs/${id}`,
    data,
  };
}

function kvEnv(initial: Record<string, unknown> = {}): {
  env: CloudflareEnv;
  values: Map<string, string>;
  writes: Array<{ key: string; expirationTtl?: number }>;
} {
  const values = new Map(
    Object.entries(initial).map(([key, value]) => [key, JSON.stringify(value)]),
  );
  const writes: Array<{ key: string; expirationTtl?: number }> = [];
  return {
    env: {
      NODE_ENV: "production",
      KV: {
        async get(key) {
          return values.get(key) ?? null;
        },
        async put(key, value, options) {
          values.set(key, String(value));
          writes.push({ key, expirationTtl: options?.expirationTtl });
        },
      },
    },
    values,
    writes,
  };
}

test("seededShuffle is deterministic without mutating the source", () => {
  const source = ["a", "b", "c", "d", "e"];
  const first = seededShuffle(source, "2026-08-24");
  const second = seededShuffle(source, "2026-08-24");

  assert.deepEqual(first, second);
  assert.deepEqual(source, ["a", "b", "c", "d", "e"]);
  assert.notDeepEqual(first, seededShuffle(source, "2026-08-25"));
});

test("updateDogFeed stores a versioned daily feed before its current pointer", async () => {
  const { env, values, writes } = kvEnv();
  const sourceDogs = [dog("dog-1"), dog("dog-2", { cateIdade: "filhote" })];

  const feed = await updateDogFeed(env, {
    now: new Date("2026-08-24T12:00:00.000Z"),
    source: {
      async listDocuments() {
        return sourceDogs.map(document);
      },
    },
  });

  assert.equal(feed.version, "2026-08-24");
  assert.equal(feed.dogs.length, 2);
  assert.deepEqual(writes.map((write) => write.key), [
    "dogs-public-slug:slug:cao-dog-1",
    "dogs-public-slug:id:dog-1",
    "dogs-public-slug:slug:cao-dog-2",
    "dogs-public-slug:id:dog-2",
    "dogs-feed:2026-08-24",
    "dogs-feed:current",
  ]);
  assert.ok(writes[4]?.expirationTtl);
  assert.deepEqual(
    JSON.parse(values.get("dogs-feed:current") ?? "null"),
    feed,
  );
});

test("updateDogFeed excludes archived dogs", async () => {
  const { env } = kvEnv();
  const active = document(dog("active"));
  const archived = document(dog("archived"));
  archived.data.archivedAt = "2026-09-29T10:00:00.000Z";
  const feed = await updateDogFeed(env, {
    source: { async listDocuments() { return [active, archived]; } },
  });
  assert.deepEqual(feed.dogs.map((item) => item.id), ["active"]);
});

test("updateDogFeed preserves legacy temperament longer than 80 characters", async () => {
  const { env } = kvEnv();
  const legacyTemperament = "Temperamento legado ".repeat(5);

  const feed = await updateDogFeed(env, {
    now: new Date("2026-08-24T12:00:00.000Z"),
    source: {
      async listDocuments() {
        return [document(dog("legacy", { temperamento: legacyTemperament }))];
      },
    },
  });

  assert.ok(legacyTemperament.length > 80);
  assert.equal(feed.dogs[0]?.temperamento, legacyTemperament);
});

test("updateDogFeed preserves a legacy free-form age", async () => {
  const { env } = kvEnv();
  const legacyAge = "aproximadamente dois anos";

  const feed = await updateDogFeed(env, {
    now: new Date("2026-08-24T12:00:00.000Z"),
    source: {
      async listDocuments() {
        return [document(dog("legacy-age", { idade: legacyAge }))];
      },
    },
  });

  assert.equal(feed.dogs[0]?.idade, legacyAge);
});

test("updateDogFeed normalizes legacy tag labels", async () => {
  const { env } = kvEnv();

  const feed = await updateDogFeed(env, {
    source: {
      async listDocuments() {
        return [document(dog("legacy-tags", { tags: ["Dócil", "Sociável"] }))];
      },
    },
  });

  assert.deepEqual(feed.dogs[0]?.tags, ["docil", "sociavel"]);
});

test("paginateDogFeed filters before slicing the requested page", () => {
  const feed: DogFeed = {
    schemaVersion: 2,
    version: "2026-08-24",
    generatedAt: "2026-08-24T03:00:00.000Z",
    dogs: [
      dog("1", { cateIdade: "adulto", tags: ["docil"] }),
      dog("2", { cateIdade: "filhote", tags: ["ativo"] }),
      dog("3", { cateIdade: "adulto", tags: ["docil"] }),
    ],
  };
  const page = paginateDogFeed(
    feed,
    new URL("https://abrigo.test/api/dogs?cateIdade=adulto&tag=docil&limit=1&page=2"),
  );

  assert.deepEqual(page, {
    dogs: [feed.dogs[2]],
    totalItems: 2,
    currentPage: 2,
    totalPages: 2,
    itemsPerPage: 1,
    version: "2026-08-24",
    tagCounts: { docil: 2, ativo: 1 },
  });
});

test("paginateDogFeed combines repeated tag filters", () => {
  const feed: DogFeed = {
    schemaVersion: 2,
    version: "2026-08-24",
    generatedAt: "2026-08-24T03:00:00.000Z",
    dogs: [
      dog("1", { tags: ["docil", "sociavel"] }),
      dog("2", { tags: ["docil"] }),
      dog("3", { tags: ["sociavel", "ativo"] }),
    ],
  };
  const page = paginateDogFeed(
    feed,
    new URL("https://abrigo.test/api/dogs?tag=docil&tag=sociavel"),
  );

  assert.deepEqual(page?.dogs, [feed.dogs[0]]);
  assert.equal(page?.totalItems, 1);
});

test("paginateDogFeed rejects tags outside the public contract", () => {
  const feed: DogFeed = {
    schemaVersion: 2,
    version: "2026-08-24",
    generatedAt: "2026-08-24T03:00:00.000Z",
    dogs: [dog("1")],
  };

  assert.equal(
    paginateDogFeed(feed, new URL("https://abrigo.test/api/dogs?tag=Dócil")),
    null,
  );
});

test("GET dog feed reads the requested KV version and returns only one page", async () => {
  const feed: DogFeed = {
    schemaVersion: 2,
    version: "2026-08-24",
    generatedAt: "2026-08-24T03:00:00.000Z",
    dogs: [dog("1"), dog("2"), dog("3")],
  };
  const { env } = kvEnv({
    "dogs-feed:current": feed,
    "dogs-feed:2026-08-24": feed,
  });
  const response = await getDogFeedResponse(
    new Request("https://abrigo.test/api/dogs?page=2&limit=2&version=2026-08-24"),
    env,
  );

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Cache-Control"), "public, max-age=60, s-maxage=300");
  assert.deepEqual(await response.json(), {
    dogs: [feed.dogs[2]],
    totalItems: 3,
    currentPage: 2,
    totalPages: 2,
    itemsPerPage: 2,
    version: "2026-08-24",
    tagCounts: { docil: 3 },
  });
});

test("GET dog feed normalizes legacy tag labels before filtering", async () => {
  const legacyDog = dog("legacy", { tags: ["Dócil", "Sociável"] });
  const feed: DogFeed = {
    schemaVersion: 2,
    version: "2026-08-24",
    generatedAt: "2026-08-24T03:00:00.000Z",
    dogs: [legacyDog, dog("active", { tags: ["Ativo"] })],
  };
  const { env } = kvEnv({ "dogs-feed:current": feed });
  const response = await getDogFeedResponse(
    new Request("https://abrigo.test/api/dogs?tag=docil"),
    env,
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    dogs: [{ ...legacyDog, tags: ["docil", "sociavel"] }],
    totalItems: 1,
    currentPage: 1,
    totalPages: 1,
    itemsPerPage: 6,
    version: "2026-08-24",
    tagCounts: { docil: 1, sociavel: 1, ativo: 1 },
  });
});

test("GET dog feed falls back to the matching current copy when its versioned key is missing", async () => {
  const feed: DogFeed = {
    schemaVersion: 2,
    version: "2026-08-24",
    generatedAt: "2026-08-24T03:00:00.000Z",
    dogs: [dog("1"), dog("2"), dog("3")],
  };
  const { env } = kvEnv({
    "dogs-feed:current": feed,
  });
  const response = await getDogFeedResponse(
    new Request("https://abrigo.test/api/dogs?page=2&limit=2&version=2026-08-24"),
    env,
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    dogs: [feed.dogs[2]],
    totalItems: 3,
    currentPage: 2,
    totalPages: 2,
    itemsPerPage: 2,
    version: "2026-08-24",
    tagCounts: { docil: 3 },
  });
});

test("GET dog feed reports an expired requested version without rebuilding it", async () => {
  const { env } = kvEnv();
  const response = await getDogFeedResponse(
    new Request("https://abrigo.test/api/dogs?version=2026-08-20"),
    env,
  );

  assert.equal(response.status, 409);
});

test("GET dog feed returns a structured unavailable response when KV fails", async () => {
  const errorLog = vi.spyOn(console, "error").mockImplementation(() => undefined);
  try {
    const response = await getDogFeedResponse(
      new Request("https://abrigo.test/api/dogs"),
      {
        NODE_ENV: "production",
        KV: {
          async get() {
            throw new Error("KV unavailable");
          },
          async put() {},
        },
      },
    );

    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), {
      message: "Dog feed is temporarily unavailable.",
    });
  } finally {
    errorLog.mockRestore();
  }
});
