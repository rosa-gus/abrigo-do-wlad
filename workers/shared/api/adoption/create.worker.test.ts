import { env } from "cloudflare:workers";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { buildValidAdoptionApplication } from "../../../../apps/public/src/test/fixtures/adoption";
import { FirestoreRestError } from "../_lib/firestore";
import type { CloudflareEnv } from "../_lib/env";
import {
  createAdoptionApplicationHandler,
  type AdoptionApplicationDependencies,
} from "./create";

const IDEMPOTENCY_KEY = "123e4567-e89b-42d3-a456-426614174000";
const NOW = new Date("2026-08-21T12:00:00.000Z");
const blockedFetch = vi.fn<typeof fetch>(async () => {
  throw new Error("External network access is disabled in Worker tests.");
});

function createEnv(overrides: Partial<CloudflareEnv> = {}): CloudflareEnv {
  return {
    KV: env.KV,
    APP_ENV: "test",
    ALLOWED_ORIGIN: "https://abrigo.test",
    RECAPTCHA_SECRET_KEY: "synthetic-recaptcha-secret",
    ...overrides,
  };
}

function createRequest(
  body: string = JSON.stringify(buildValidAdoptionApplication()),
  headers: Record<string, string> = {},
): Request {
  return new Request("https://abrigo.test/api/adoption/create", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": IDEMPOTENCY_KEY,
      Origin: "https://abrigo.test",
      "X-Forwarded-For": "198.51.100.27",
      ...headers,
    },
    body,
  });
}

function createHarness(
  overrides: Partial<AdoptionApplicationDependencies> = {},
) {
  const createDocument = vi.fn(
    async (
      _collectionId: string,
      _data: Record<string, unknown>,
      _options?: {
        serverTimestampFields?: string[];
        documentId?: string;
      },
    ) => {
      void _collectionId;
      void _data;
      void _options;
      return { id: IDEMPOTENCY_KEY };
    },
  );
  const verifyRecaptcha = vi.fn(async () => true);
  const encryptData = vi.fn(async () => ({
    encryptedData: "synthetic-ciphertext",
    keyVersion: "key-v1",
  }));
  const sendNotification = vi.fn(async () => true);

  const dependencies: AdoptionApplicationDependencies = {
    createFirestoreClient: () => ({ createDocument }),
    verifyRecaptcha,
    encryptData,
    sendNotification,
    now: () => NOW,
    ...overrides,
  };

  return {
    handler: createAdoptionApplicationHandler(dependencies),
    createDocument,
    verifyRecaptcha,
    encryptData,
    sendNotification,
  };
}

describe("adoption application runtime", () => {
  beforeEach(async () => {
    await env.KV.delete("rate-limit:198.51.100.0");
    blockedFetch.mockClear();
    vi.stubGlobal("fetch", blockedFetch);
  });

  afterEach(() => {
    expect(blockedFetch).not.toHaveBeenCalled();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("persists a sanitized application and notifies the shelter", async () => {
    const harness = createHarness();
    const response = await harness.handler({
      request: createRequest(),
      env: createEnv(),
    });

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({
      message: "Application submitted successfully",
      data: {
        id: IDEMPOTENCY_KEY,
        notificationEmailSent: true,
      },
    });

    expect(harness.verifyRecaptcha).toHaveBeenCalledWith(
      "synthetic-captcha-token",
      expect.any(Object),
      {
        expectedAction: "submit_adoption",
        expectedHostname: "abrigo.test",
      },
    );
    expect(harness.encryptData).toHaveBeenCalledWith(
      expect.objectContaining({
        nome_adotante: "Pessoa Candidata Teste",
        email: "candidatura@example.test",
      }),
      expect.any(Object),
    );

    const [collection, document, options] =
      harness.createDocument.mock.calls[0];
    expect(collection).toBe("adoption_application");
    expect(options).toEqual({
      serverTimestampFields: ["submittedAt"],
      documentId: IDEMPOTENCY_KEY,
    });
    expect(document).toMatchObject({
      sensitive: "synthetic-ciphertext",
      keyVersion: "key-v1",
      expiresAt: new Date("2026-09-20T12:00:00.000Z"),
      status: "pending",
    });
    expect(document).not.toHaveProperty("nome_adotante");
    expect(document).not.toHaveProperty("captchaToken");
    expect(harness.sendNotification).toHaveBeenCalledOnce();
  });

  it("returns an idempotent success when Firestore reports a conflict", async () => {
    const createDocument = vi.fn(async () => {
      throw new FirestoreRestError("Already exists", 409);
    });
    const harness = createHarness({
      createFirestoreClient: () => ({ createDocument }),
    });

    const response = await harness.handler({
      request: createRequest(),
      env: createEnv(),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      message: "Application already submitted",
      data: { id: IDEMPOTENCY_KEY, duplicate: true },
    });
    expect(harness.sendNotification).not.toHaveBeenCalled();
  });

  it("rejects an unauthorized origin before processing the application", async () => {
    const harness = createHarness();
    const response = await harness.handler({
      request: createRequest(undefined, { Origin: "https://unauthorized.test" }),
      env: createEnv(),
    });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      message: "Forbidden: Invalid origin",
    });
    expect(harness.verifyRecaptcha).not.toHaveBeenCalled();
    expect(harness.encryptData).not.toHaveBeenCalled();
    expect(harness.createDocument).not.toHaveBeenCalled();
    expect(harness.sendNotification).not.toHaveBeenCalled();
  });

  it.each([401, 403])("handles Firestore HTTP %s without exposing internal details", async (status) => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const createDocument = vi.fn(async () => {
      throw new FirestoreRestError("Service account permission denied", status);
    });
    const harness = createHarness({
      createFirestoreClient: () => ({ createDocument }),
    });
    const response = await harness.handler({
      request: createRequest(),
      env: createEnv(),
    });

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      message: "Error creating adoption application",
    });
    expect(harness.sendNotification).not.toHaveBeenCalled();
  });

  it.each([401, 403, 200])("preserves the application when the webhook refuses authorization with HTTP %s", async (status) => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const webhookFetch = vi.fn(async () =>
      Response.json({ ok: false, error: "Unauthorized" }, { status }),
    );
    vi.stubGlobal("fetch", webhookFetch);
    const harness = createHarness();
    // Use the real notification implementation, with mocked persistence and HTTP.
    const handler = createAdoptionApplicationHandler({
      createFirestoreClient: () => ({ createDocument: harness.createDocument }),
      encryptData: harness.encryptData,
      verifyRecaptcha: harness.verifyRecaptcha,
      now: () => NOW,
    });
    const response = await handler({
      request: createRequest(),
      env: createEnv({
        EMAIL_WEBHOOK_URL: "https://webhook.example.test/email",
        EMAIL_WEBHOOK_SECRET: "synthetic-invalid-secret",
      }),
    });

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({
      message: "Application submitted successfully",
      data: { id: IDEMPOTENCY_KEY, notificationEmailSent: false },
      warning: "A candidatura foi salva, mas a notificação automática falhou. Guarde o ID e entre em contato com o abrigo.",
    });
    expect(harness.createDocument).toHaveBeenCalledOnce();
    expect(webhookFetch).toHaveBeenCalledOnce();
  });

  it("keeps the successful submission when notification fails", async () => {
    const harness = createHarness({
      sendNotification: vi.fn(async () => false),
    });

    const response = await harness.handler({
      request: createRequest(),
      env: createEnv(),
    });
    const body = await response.json<Record<string, unknown>>();

    expect(response.status).toBe(201);
    expect(body).toMatchObject({
      data: {
        id: IDEMPOTENCY_KEY,
        notificationEmailSent: false,
      },
    });
    expect(body.warning).toEqual(expect.any(String));
  });

  it("rejects a CAPTCHA failure before encryption and persistence", async () => {
    const harness = createHarness({
      verifyRecaptcha: vi.fn(async () => false),
    });

    const response = await harness.handler({
      request: createRequest(),
      env: createEnv(),
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      message: "reCAPTCHA validation failed",
    });
    expect(harness.encryptData).not.toHaveBeenCalled();
    expect(harness.createDocument).not.toHaveBeenCalled();
  });

  it("allows local development without a CAPTCHA token or secret", async () => {
    vi.stubGlobal("__ADOPTION_RECAPTCHA_BYPASS__", true);
    const harness = createHarness();
    const response = await harness.handler({
      request: createRequest(JSON.stringify(buildValidAdoptionApplication({
        captchaToken: "",
      }))),
      env: createEnv({ RECAPTCHA_SECRET_KEY: "" }),
    });

    expect(response.status).toBe(201);
    expect(harness.verifyRecaptcha).not.toHaveBeenCalled();
    expect(harness.createDocument).toHaveBeenCalledOnce();
    expect(harness.sendNotification).toHaveBeenCalledOnce();
  });

  it("requires CAPTCHA in production even with local APP_ENV", async () => {
    vi.stubGlobal("__ADOPTION_RECAPTCHA_BYPASS__", false);
    const verifyRecaptcha = vi.fn(async () => false);
    const harness = createHarness({ verifyRecaptcha });
    const response = await harness.handler({
      request: createRequest(JSON.stringify(buildValidAdoptionApplication({
        captchaToken: "",
      }))),
      env: createEnv({ APP_ENV: "local" }),
    });

    expect(response.status).toBe(400);
    expect(verifyRecaptcha).toHaveBeenCalledOnce();
    expect(harness.createDocument).not.toHaveBeenCalled();
  });

  it("rejects an invalid wizard payload before CAPTCHA", async () => {
    const harness = createHarness();
    const invalidPayload = buildValidAdoptionApplication({
      nome_adotante: "AB",
    });

    const response = await harness.handler({
      request: createRequest(JSON.stringify(invalidPayload)),
      env: createEnv(),
    });

    expect(response.status).toBe(400);
    expect(await response.json<Record<string, unknown>>()).toMatchObject({
      message: "Validation failed",
    });
    expect(harness.verifyRecaptcha).not.toHaveBeenCalled();
  });

  it("rejects malformed JSON", async () => {
    const harness = createHarness();

    const response = await harness.handler({
      request: createRequest("{"),
      env: createEnv(),
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ message: "Invalid JSON" });
    expect(harness.verifyRecaptcha).not.toHaveBeenCalled();
  });

  it("rejects a missing reCAPTCHA secret without calling Google", async () => {
    const harness = createHarness();

    const response = await harness.handler({
      request: createRequest(),
      env: createEnv({ RECAPTCHA_SECRET_KEY: "" }),
    });

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      message: "reCAPTCHA secret is not configured.",
    });
    expect(harness.verifyRecaptcha).not.toHaveBeenCalled();
  });

  it("converts unexpected persistence failures to a safe error", async () => {
    const createDocument = vi.fn(async () => {
      throw new FirestoreRestError("Unavailable", 503);
    });
    const harness = createHarness({
      createFirestoreClient: () => ({ createDocument }),
    });

    const response = await harness.handler({
      request: createRequest(),
      env: createEnv(),
    });

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      message: "Error creating adoption application",
    });
    expect(harness.sendNotification).not.toHaveBeenCalled();
  });
});
