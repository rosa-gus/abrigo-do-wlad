import assert from "node:assert/strict";
import { test } from "vitest";

import {
  getIdempotencyKey,
  isValidIdempotencyKey,
  onRequest,
} from "./create";

test("accepts only UUID v4 idempotency keys", () => {
  const validKey = "123e4567-e89b-42d3-a456-426614174000";
  const request = new Request("https://abrigo.test/api/adoption/create", {
    headers: { "Idempotency-Key": validKey },
  });

  assert.equal(getIdempotencyKey(request), validKey);
  assert.equal(isValidIdempotencyKey(validKey), true);
  assert.equal(
    isValidIdempotencyKey("123e4567-e89b-12d3-a456-426614174000"),
    false,
  );
  assert.equal(isValidIdempotencyKey("../../another-document"), false);
});

test("rejects an invalid idempotency key before processing", async () => {
  const response = await onRequest({
    request: new Request("https://abrigo.test/api/adoption/create", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": "not-a-uuid",
        Origin: "https://abrigo.test",
        "X-Forwarded-For": "203.0.113.43",
      },
      body: "{}",
    }),
    env: {
      ALLOWED_ORIGIN: "https://abrigo.test",
      APP_ENV: "production",
      KV: {
        async get(): Promise<null> {
          return null;
        },
        async put(): Promise<void> {},
      },
    },
  });

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), {
    message: "Missing or invalid idempotency key",
  });
});

test("applies the shared rate limit before processing an application", async () => {
  const response = await onRequest({
    request: new Request("https://abrigo.test/api/adoption/create", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "https://abrigo.test",
        "X-Forwarded-For": "203.0.113.42",
      },
      body: "{}",
    }),
    env: {
      ALLOWED_ORIGIN: "https://abrigo.test",
      APP_ENV: "production",
      KV: {
        async get(): Promise<string> {
          return "5";
        },
        async put(): Promise<void> {},
      },
    },
  });

  assert.equal(response.status, 429);
  assert.deepEqual(await response.json(), {
    message: "Too many requests. Please try again later.",
  });
});
