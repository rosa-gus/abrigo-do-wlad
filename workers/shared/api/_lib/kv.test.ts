import { test } from "vitest";
import assert from "node:assert/strict";

import { getKvStore } from "./kv.ts";
import type { CloudflareEnv } from "./env";

test("kv handles object values and counter operations", async () => {
  const kv = getKvStore();
  const key = "test:kv:store";

  await kv.set(key, { name: "Wlad", visits: 1 });

  const value = await kv.get<{ name: string; visits: number }>(key);
  assert.deepEqual(value, { name: "Wlad", visits: 1 });

  const count = await kv.incr("test:kv:counter");
  assert.equal(count, 1);

  const ttl = await kv.expire("test:kv:counter", 60);
  assert.equal(ttl, 1);
});

test("local KV isolates projects and leaves production values intact", async () => {
  const values = new Map<string, string>([["dogs-feed:current", "production"]]);
  const writes: Array<{ key: string; expirationTtl?: number }> = [];
  const binding: NonNullable<CloudflareEnv["KV"]> = {
    async get(key) { return values.get(key) ?? null; },
    async put(key, value, options) {
      values.set(key, String(value));
      writes.push({ key, expirationTtl: options?.expirationTtl });
    },
  };
  const first = getKvStore({
    KV: binding, APP_ENV: "local", FIREBASE_PROJECT_ID: "dev-one",
  });
  const second = getKvStore({
    KV: binding, APP_ENV: "local", FIREBASE_PROJECT_ID: "dev-two",
  });
  const production = getKvStore({ KV: binding, APP_ENV: "production" });

  assert.equal(await first.get("dogs-feed:current"), null);
  await first.set("dogs-feed:current", "development");
  assert.equal(await first.get("dogs-feed:current"), "development");
  assert.equal(await second.get("dogs-feed:current"), null);
  assert.equal(await production.get("dogs-feed:current"), "production");

  assert.equal(await first.incr("counter"), 1);
  assert.equal(await second.incr("counter"), 1);
  assert.equal(await first.incr("counter"), 2);
  assert.equal(await first.expire("counter", 60), 1);
  assert.deepEqual(writes.at(-1), {
    key: "local:dev-one:counter", expirationTtl: 60,
  });

  // Public and admin share the same application environment and project scope.
  const admin = getKvStore({
    KV: binding, APP_ENV: "local", FIREBASE_PROJECT_ID: "dev-one",
  });
  assert.equal(await admin.get("dogs-feed:current"), "development");
});
