import assert from "node:assert/strict";
import { test, vi } from "vitest";

import {
  handleAdminApi,
  handleAdminAsset,
  secureAssetResponse,
} from "./index";

const env = {
  APP_ENV: "production",
  KV: {} as KVNamespace,
  ASSETS: {
    async fetch() {
      return new Response("asset");
    },
    connect() {
      throw new Error("Asset socket connections are unavailable in unit tests.");
    },
  },
  UPLOAD_RATE_LIMITER: {
    async limit() {
      return { success: true };
    },
  },
  ADMIN_DEVELOPER_EMAILS: "developer@example.test",
  ADMIN_ADMINISTRATOR_EMAILS: "administrator@example.test",
  CF_ACCESS_AUD: "test-audience",
  CF_ACCESS_TEAM_DOMAIN: "abrigo.cloudflareaccess.com",
  FIREBASE_PROJECT_ID: "test-project",
  FIREBASE_CLIENT_EMAIL: "worker@example.test",
  FIREBASE_PRIVATE_KEY: "test-private-key",
  MASTER_KEY: "test-master-key",
  CLOUDINARY_CLOUD_NAME: "test-cloud",
  CLOUDINARY_API_KEY: "test-api-key",
  CLOUDINARY_API_SECRET: "test-api-secret",
} satisfies Env;

test("admin assets prevent search engine indexing", async () => {
  const response = secureAssetResponse(
    new Response("<!doctype html><title>Admin</title>", {
      headers: { "Content-Type": "text/html" },
    }),
  );

  assert.equal(
    response.headers.get("X-Robots-Tag"),
    "noindex, nofollow, noarchive, nosnippet",
  );
});

test("admin assets are served only after Access authentication", async () => {
  let authenticated = false;
  const response = await handleAdminAsset(
    new Request("https://admin.example.test/index.html"),
    env,
    async () => {
      authenticated = true;
      return {
        email: "administrator@example.test",
        role: "administrator",
        subject: "test-subject",
      };
    },
  );

  assert.equal(authenticated, true);
  assert.equal(response.status, 200);
  assert.equal(await response.text(), "asset");
  assert.equal(
    response.headers.get("X-Robots-Tag"),
    "noindex, nofollow, noarchive, nosnippet",
  );
  assert.match(response.headers.get("Content-Security-Policy") ?? "", /fonts\.googleapis\.com/);
  assert.doesNotMatch(
    response.headers.get("Content-Security-Policy") ?? "",
    /api\.cloudinary\.com/,
  );
});

test("admin assets reject missing Access credentials before reading ASSETS", async () => {
  let assetReads = 0;
  const protectedEnv = {
    ...env,
    ASSETS: {
      ...env.ASSETS,
      async fetch() {
        assetReads += 1;
        return new Response("must not be returned");
      },
    },
  } satisfies Env;
  const errorLog = vi.spyOn(console, "error").mockImplementation(() => undefined);

  try {
    const response = await handleAdminAsset(
      new Request("https://admin.example.test/index.html"),
      protectedEnv,
    );

    assert.equal(response.status, 401);
    assert.equal(assetReads, 0);
    assert.deepEqual(await response.json(), { error: "Unauthorized" });
  } finally {
    errorLog.mockRestore();
  }
});

test("admin session rejects requests without a Cloudflare Access assertion", async () => {
  const errorLog = vi.spyOn(console, "error").mockImplementation(() => undefined);

  try {
    const response = await handleAdminApi(
      new Request("https://admin.example.test/api/session"),
      env,
    );

    assert.equal(response.status, 401);
    assert.equal(response.headers.get("Cache-Control"), "no-store");
    assert.deepEqual(await response.json(), { error: "Unauthorized" });
  } finally {
    errorLog.mockRestore();
  }
});

test("admin session only accepts GET before authenticating the request", async () => {
  const response = await handleAdminApi(
    new Request("https://admin.example.test/api/session", { method: "POST" }),
    env,
  );

  assert.equal(response.status, 405);
  assert.equal(response.headers.get("Allow"), "GET");
});
