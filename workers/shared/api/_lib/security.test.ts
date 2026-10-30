import assert from "node:assert/strict";
import { test } from "vitest";

import { getClientIp, verifyRecaptcha } from "./security";

test("uses Cloudflare's client IP rather than a client-controlled forwarded header", () => {
  assert.equal(getClientIp(new Request("https://abrigo.test", {
    headers: { "CF-Connecting-IP": "203.0.113.27", "X-Forwarded-For": "198.51.100.42" },
  })), "203.0.113.0");
});

test("does not treat an untrusted forwarded header as a verified client IP", () => {
  assert.equal(getClientIp(new Request("https://abrigo.test", {
    headers: { "X-Forwarded-For": "198.51.100.42" },
  })), "unknown");
});

const env = { RECAPTCHA_SECRET_KEY: "secret" };

function recaptchaResponse(overrides: Record<string, unknown> = {}) {
  return async (): Promise<Response> =>
    Response.json({
      success: true,
      score: 0.9,
      action: "submit_adoption",
      hostname: "abrigo.test",
      ...overrides,
    });
}

test("accepts a valid reCAPTCHA v3 response", async () => {
  const valid = await verifyRecaptcha("token", env, {
    expectedAction: "submit_adoption",
    expectedHostname: "abrigo.test",
    fetcher: recaptchaResponse(),
  });

  assert.equal(valid, true);
});

test("rejects a token issued for another action", async () => {
  const valid = await verifyRecaptcha("token", env, {
    expectedAction: "submit_adoption",
    expectedHostname: "abrigo.test",
    fetcher: recaptchaResponse({ action: "login" }),
  });

  assert.equal(valid, false);
});

test("rejects a token issued for another hostname", async () => {
  const valid = await verifyRecaptcha("token", env, {
    expectedAction: "submit_adoption",
    expectedHostname: "abrigo.test",
    fetcher: recaptchaResponse({ hostname: "example.test" }),
  });

  assert.equal(valid, false);
});

test("rejects v2-style responses without a score", async () => {
  const valid = await verifyRecaptcha("token", env, {
    expectedAction: "submit_adoption",
    expectedHostname: "abrigo.test",
    fetcher: recaptchaResponse({ score: undefined }),
  });

  assert.equal(valid, false);
});
