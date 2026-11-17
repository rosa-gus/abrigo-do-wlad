import { env as bindings } from "cloudflare:workers";
import { exportJWK, generateKeyPair, SignJWT, type JWTPayload } from "jose";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { FirestoreRestClient } from "../../../workers/shared/api/_lib/firestore";
import worker from "./index";

const team = "synthetic-security.cloudflareaccess.com";
const issuer = `https://${team}`;
let keys: Awaited<ReturnType<typeof generateKeyPair>>;
let wrongKeys: Awaited<ReturnType<typeof generateKeyPair>>;
let jwks: object;
const assets = vi.fn(async () => new Response("synthetic asset"));
const network = vi.fn<typeof fetch>();
const ctx = { waitUntil: vi.fn() };

function environment(): Env {
  return {
    KV: bindings.KV,
    APP_ENV: "production",
    CF_ACCESS_TEAM_DOMAIN: team,
    CF_ACCESS_AUD: "synthetic-admin-audience",
    ADMIN_ADMINISTRATOR_EMAILS: "administrator@example.test",
    ADMIN_DEVELOPER_EMAILS: "developer@example.test",
    UPLOAD_RATE_LIMITER: { limit: async () => ({ success: true }) },
    ASSETS: { fetch: assets } as unknown as Fetcher,
  };
}

async function token(overrides: JWTPayload = {}, omit: string[] = [], invalidSignature = false) {
  const now = Math.floor(Date.now() / 1000);
  const payload: JWTPayload = {
    iss: issuer, aud: "synthetic-admin-audience", sub: "synthetic-subject",
    email: "administrator@example.test", iat: now, exp: now + 300, ...overrides,
  };
  for (const name of omit) delete payload[name];
  return new SignJWT(payload).setProtectedHeader({ alg: "RS256", kid: "synthetic-key" })
    .sign(invalidSignature ? wrongKeys.privateKey : keys.privateKey);
}

function request(path: string, assertion?: string, method = "GET", origin?: string) {
  const headers = new Headers();
  if (assertion) headers.set("Cf-Access-Jwt-Assertion", assertion);
  if (origin) headers.set("Origin", origin);
  return new Request(`https://admin.example.test${path}`, { method, headers });
}

beforeAll(async () => {
  keys = await generateKeyPair("RS256");
  wrongKeys = await generateKeyPair("RS256");
  jwks = { keys: [{ ...await exportJWK(keys.publicKey), kid: "synthetic-key", alg: "RS256", use: "sig" }] };
});
beforeEach(() => {
  assets.mockClear();
  network.mockReset().mockImplementation(async input => {
    if (String(input) === `${issuer}/cdn-cgi/access/certs`) return Response.json(jwks);
    throw new Error("Remote services are disabled in admin runtime tests.");
  });
  vi.stubGlobal("fetch", network);
  vi.spyOn(FirestoreRestClient.prototype, "getDocument").mockImplementation(async () => {
    throw new Error("Unexpected Firestore access.");
  });
});
afterEach(() => {
  for (const [input] of network.mock.calls) expect(String(input)).toBe(`${issuer}/cdn-cgi/access/certs`);
  expect(FirestoreRestClient.prototype.getDocument).not.toHaveBeenCalled();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("admin security in workerd with real Access signature verification", () => {
  it("accepts a signed session and authenticates assets", async () => {
    const assertion = await token();
    const session = await worker.fetch(request("/api/session", assertion), environment(), ctx);
    expect(session.status).toBe(200);
    expect(await session.json()).toEqual({ email: "administrator@example.test", role: "administrator" });
    expect((await worker.fetch(request("/", assertion), environment(), ctx)).status).toBe(200);
    expect(assets).toHaveBeenCalledOnce();
  });

  it("rejects missing assertions, invalid signatures, issuer, audience, expiry and identities before services", async () => {
    const assertions = [undefined,
      await token({}, [], true), await token({ iss: "https://other.cloudflareaccess.com" }),
      await token({ aud: "another-application" }), await token({ exp: Math.floor(Date.now() / 1000) - 1 }),
      await token({ email: "unknown@example.test" }), await token({ sub: "" }),
    ];
    for (const assertion of assertions) {
      for (const path of ["/api/session", "/api/admin/dogs", "/api/admin/media/upload", "/"]) {
        expect((await worker.fetch(request(path, assertion), environment(), ctx)).status).toBe(401);
      }
    }
    expect(assets).not.toHaveBeenCalled();
  });

  it.each(["exp", "iat", "iss", "aud", "sub", "email"])("requires the %s claim", async claim => {
    expect((await worker.fetch(request("/api/session", await token({}, [claim])), environment(), ctx)).status).toBe(401);
  });

  it("rejects a valid signature using an algorithm outside the Access contract", async () => {
    const ec = await generateKeyPair("ES256");
    const assertion = await new SignJWT({ email: "administrator@example.test", sub: "subject" })
      .setProtectedHeader({ alg: "ES256", kid: "synthetic-key" }).setIssuer(issuer)
      .setAudience("synthetic-admin-audience").setIssuedAt().setExpirationTime("5m").sign(ec.privateKey);
    expect((await worker.fetch(request("/api/session", assertion), environment(), ctx)).status).toBe(401);
  });

  it.each([
    ["GET", "/api/admin/dog-identity-inventory"], ["GET", "/api/admin/audit-log"],
    ["GET", "/api/admin/system-keys"], ["POST", "/api/admin/system-keys/rotate"],
    ["GET", "/api/admin/migrations"], ["POST", "/api/admin/migrations/plan"],
    ["POST", "/api/admin/migrations/apply"], ["PUT", "/api/admin/notifications"],
    ["DELETE", "/api/admin/notifications"],
  ])("denies administrator %s %s", async (method, path) => {
    const response = await worker.fetch(request(path, await token(), method, "https://admin.example.test"), environment(), ctx);
    expect(response.status).toBe(403);
    expect(assets).not.toHaveBeenCalled();
  });

  it.each([
    ["POST", "/api/admin/dogs"], ["PATCH", "/api/admin/dogs/doc:dog"],
    ["DELETE", "/api/admin/dogs/doc:dog"], ["POST", "/api/admin/dogs/doc:dog/archive"],
    ["POST", "/api/admin/dogs/doc:dog/restore"], ["POST", "/api/admin/recycle-points"],
    ["PATCH", "/api/admin/recycle-points/point"], ["DELETE", "/api/admin/recycle-points/point"],
    ["PATCH", "/api/admin/adoptions/application/status"], ["PATCH", "/api/admin/system/settings"],
    ["POST", "/api/admin/media/upload"], ["POST", "/api/admin/media/delete"],
    ["PUT", "/api/admin/notifications"], ["DELETE", "/api/admin/notifications"],
    ["POST", "/api/admin/system-keys/rotate"], ["POST", "/api/admin/migrations/plan"],
    ["POST", "/api/admin/migrations/apply"],
  ])("rejects cross-origin developer %s %s", async (method, path) => {
    const response = await worker.fetch(request(path, await token({ email: "developer@example.test" }), method, "https://hostile.example.test"), environment(), ctx);
    expect(response.status).toBe(403);
    expect(assets).not.toHaveBeenCalled();
  });
});
