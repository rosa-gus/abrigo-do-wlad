import assert from "node:assert/strict";
import { test } from "vitest";

import type { CloudflareEnv } from "../_lib/env";
import {
  dogProfilePath,
  dogSlugFromName,
  ensureDogPublicSlug,
  getDogPublicSlugBySlug,
} from "./public-slug";

function createKvEnv() {
  const values = new Map<string, string>();
  const env: CloudflareEnv = {
    APP_ENV: "production",
    KV: {
      async get(key) {
        return values.get(key) ?? null;
      },
      async put(key, value) {
        values.set(key, String(value));
      },
    },
  };
  return { env, values };
}

test("creates readable dog slugs and their short public paths", () => {
  assert.equal(dogSlugFromName("  Paçoca & Café  "), "pacoca-cafe");
  assert.equal(dogSlugFromName("🐶"), "cao");
  assert.equal(dogProfilePath("pacoca-cafe"), "/caes/pacoca-cafe");
});

test("keeps an allocated slug immutable when the dog name changes", async () => {
  const { env } = createKvEnv();
  const first = await ensureDogPublicSlug(env, { id: "dog-1", nome: "Paçoca" });
  const renamed = await ensureDogPublicSlug(env, { id: "dog-1", nome: "Jujuba" });

  assert.equal(first.slug, "pacoca");
  assert.deepEqual(renamed, first);
});

test("allocates stable numeric suffixes when dog names collide", async () => {
  const { env } = createKvEnv();
  const first = await ensureDogPublicSlug(env, { id: "dog-1", nome: "Paçoca" });
  const second = await ensureDogPublicSlug(env, { id: "dog-2", nome: "Paçoca" });

  assert.equal(first.slug, "pacoca");
  assert.equal(second.slug, "pacoca-2");
  assert.equal((await getDogPublicSlugBySlug(env, "pacoca-2"))?.id, "dog-2");
});
