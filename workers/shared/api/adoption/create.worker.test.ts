import { env } from "cloudflare:workers";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { buildValidAdoptionApplication } from "../../../../apps/public/src/test/fixtures/adoption";
import { FirestoreRestError, type FirestoreDocument } from "../_lib/firestore";
import type { CloudflareEnv } from "../_lib/env";
import {
  createAdoptionApplicationHandler,
  fingerprintApplication,
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
    ADOPTION_RATE_LIMITER: { limit: async () => ({ success: true }) },
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
      "CF-Connecting-IP": "198.51.100.27",
      ...headers,
    },
    body,
  });
}

function createHarness(
  overrides: Partial<AdoptionApplicationDependencies> = {},
) {
  let savedDocument: FirestoreDocument<Record<string, unknown>> | null = null;
  const getDocument = vi.fn(async () => savedDocument);
  const updateDocument = vi.fn(async (_name: string, data: Record<string, unknown>) => {
    if (savedDocument) savedDocument = { ...savedDocument, data: { ...savedDocument.data, ...data } };
    return { commitTime: NOW.toISOString(), updateTime: NOW.toISOString() };
  });
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
      void _options;
      savedDocument = { id: IDEMPOTENCY_KEY, name: `projects/test/databases/(default)/documents/adoption_application/${IDEMPOTENCY_KEY}`, data: _data, updateTime: NOW.toISOString() };
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
    isAcceptingApplications: async () => true,
    createFirestoreClient: () => ({ createDocument, getDocument, updateDocument }),
    verifyRecaptcha,
    encryptData,
    sendNotification,
    now: () => NOW,
    ...overrides,
  };

  return {
    handler: createAdoptionApplicationHandler(dependencies),
    createDocument,
    getDocument,
    updateDocument,
    verifyRecaptcha,
    encryptData,
    sendNotification,
  };
}

describe("adoption application runtime", () => {
  beforeEach(() => {
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

  it("rejects paused applications before verification, encryption or persistence", async () => {
    const harness = createHarness({ isAcceptingApplications: async () => false });
    const response = await harness.handler({ request: createRequest(), env: createEnv() });
    expect(response.status).toBe(403);
    expect(harness.verifyRecaptcha).not.toHaveBeenCalled();
    expect(harness.encryptData).not.toHaveBeenCalled();
    expect(harness.createDocument).not.toHaveBeenCalled();
    expect(harness.sendNotification).not.toHaveBeenCalled();
  });

  it("does not accept an application when availability cannot be verified", async () => {
    const harness = createHarness({ isAcceptingApplications: async () => { throw new Error("offline"); } });
    const response = await harness.handler({ request: createRequest(), env: createEnv() });
    expect(response.status).toBe(503);
    expect(harness.createDocument).not.toHaveBeenCalled();
    expect(harness.sendNotification).not.toHaveBeenCalled();
  });

  it("does not process an application if the rate limiter fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const harness = createHarness();
    const response = await harness.handler({
      request: createRequest(),
      env: createEnv({ ADOPTION_RATE_LIMITER: { limit: async () => { throw new Error("unavailable"); } } }),
    });
    expect(response.status).toBe(503);
    expect(harness.createDocument).not.toHaveBeenCalled();
    expect(harness.verifyRecaptcha).not.toHaveBeenCalled();
  });

  it("returns an idempotent success when Firestore reports a conflict", async () => {
    const createDocument = vi.fn(async () => {
      throw new FirestoreRestError("Already exists", 409);
    });
    const requestFingerprint = await fingerprintApplication(buildValidAdoptionApplication());
    const harness = createHarness({
      createFirestoreClient: () => ({ createDocument, getDocument: async () => ({ id: IDEMPOTENCY_KEY, name: "saved", data: { requestFingerprint, notificationStatus: "sent" } }), updateDocument: async () => ({}) }),
    });

    const response = await harness.handler({
      request: createRequest(),
      env: createEnv(),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      message: "Application already submitted",
      data: { id: IDEMPOTENCY_KEY, duplicate: true, notificationEmailSent: true },
    });
    expect(harness.sendNotification).not.toHaveBeenCalled();
  });

  it("rejects changed answers under an already-saved idempotency key", async () => {
    const harness = createHarness();
    expect((await harness.handler({ request: createRequest(), env: createEnv() })).status).toBe(201);
    harness.createDocument.mockRejectedValueOnce(new FirestoreRestError("Already exists", 409));
    const changed = buildValidAdoptionApplication({ nome_adotante: "Outra pessoa candidata" });
    const response = await harness.handler({ request: createRequest(JSON.stringify(changed)), env: createEnv() });
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ code: "IDEMPOTENCY_CONTENT_MISMATCH" });
    expect(harness.sendNotification).toHaveBeenCalledOnce();
  });

  it("preserves a recorded notification failure on an identical retry", async () => {
    const sendNotification = vi.fn(async () => false);
    const harness = createHarness({ sendNotification });
    const first = await harness.handler({ request: createRequest(), env: createEnv() });
    const body = await first.json<{ warning: string }>();
    harness.createDocument.mockRejectedValueOnce(new FirestoreRestError("Already exists", 409));
    const retry = await harness.handler({ request: createRequest(), env: createEnv() });
    expect(retry.status).toBe(200);
    expect(await retry.json()).toMatchObject({ warning: body.warning, data: { duplicate: true, notificationEmailSent: false } });
    expect(sendNotification).toHaveBeenCalledOnce();
    expect(harness.updateDocument).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ notificationStatus: "failed" }), expect.any(Object));
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
      createFirestoreClient: () => ({ createDocument, getDocument: async () => null, updateDocument: async () => ({}) }),
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
      isAcceptingApplications: async () => true,
      createFirestoreClient: () => ({ createDocument: harness.createDocument, getDocument: harness.getDocument, updateDocument: harness.updateDocument }),
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
      warning: "A candidatura foi salva, mas a notificação automática ainda não foi confirmada. Guarde o ID e entre em contato com o abrigo se necessário.",
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
      createFirestoreClient: () => ({ createDocument, getDocument: async () => null, updateDocument: async () => ({}) }),
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
