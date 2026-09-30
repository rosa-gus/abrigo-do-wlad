import assert from "node:assert/strict";
import { test } from "vitest";

import type { AccessIdentity } from "./access";
import { handleAdminApi, type AdminApiDependencies } from "./admin-api";
import type { AdminNotification, NotificationInput } from "./notifications";

const identity: AccessIdentity = {
  email: "administrator@example.test",
  role: "administrator",
  subject: "test-subject",
};
const env = {
  CLOUDINARY_API_KEY: "test-key",
  CLOUDINARY_API_SECRET: "test-secret",
  CLOUDINARY_CLOUD_NAME: "test-cloud",
  FIREBASE_PROJECT_ID: "test-project",
} as Env;

const developerIdentity: AccessIdentity = {
  email: "developer@example.test",
  role: "developer",
  subject: "developer-subject",
};

function notificationResponse(
  input: NotificationInput,
  requestIdentity: AccessIdentity,
): AdminNotification {
  return {
    ...input,
    target: "admin",
    updatedAt: "2026-08-24T12:00:00.000Z",
    author: requestIdentity.email,
    expiresAt:
      input.expiration === "until_deleted"
        ? null
        : "2026-08-24T18:00:00.000Z",
  };
}

function keyDependencies(
  overrides: Partial<AdminApiDependencies> = {},
): AdminApiDependencies {
  return {
    listAdoptionApplications: async () => [],
    getAdoptionApplication: async (_env, id) => ({ id }),
    consumeUploadRateLimit: async () => true,
    listSystemKeys: async () => [],
    rotateSystemKey: async () => ({ id: "key-id", version: "v2" }),
    getAdminNotification: async () => null,
    saveAdminNotification: async (_env, input, requestIdentity) =>
      notificationResponse(input, requestIdentity),
    deleteAdminNotification: async () => undefined,
    listAdminAuditEvents: async () => [],
    recordAdminAuditEvent: async () => undefined,
    uploadCloudinaryImage: async () => ({
      bytes: 1_024,
      format: "jpg",
      height: 800,
      publicId: "abrigo-do-wlad/dogs/image-id",
      url: "https://res.cloudinary.com/test-cloud/image/upload/v1/abrigo-do-wlad/dogs/image-id.jpg",
      width: 1_200,
    }),
    saveDogTombstone: async (_env, input) => ({
      schemaVersion: 1,
      publicSlug: "test-dog",
      ...input,
    }),
    ...overrides,
  };
}

test("adoption list returns only the summary contract provided by the repository", async () => {
  const summaries = [{
    id: "application-1",
    nome_adotante: "Lívia",
    status: "pending",
    submittedAt: "2026-08-24T12:00:00.000Z",
  }];
  const response = await handleAdminApi(
    new Request("https://admin.example.test/api/admin/adoptions"),
    env,
    identity,
    keyDependencies({ listAdoptionApplications: async () => summaries }),
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), summaries);
});

test("adoption detail validates the id and loads one full application", async () => {
  let requestedId = "";
  const detail = {
    id: "application-1",
    nome_adotante: "Lívia",
    email: "livia@example.test",
  };
  const response = await handleAdminApi(
    new Request("https://admin.example.test/api/admin/adoptions/application-1"),
    env,
    identity,
    keyDependencies({
      getAdoptionApplication: async (_env, id) => {
        requestedId = id;
        return detail;
      },
    }),
  );

  assert.equal(response.status, 200);
  assert.equal(requestedId, "application-1");
  assert.deepEqual(await response.json(), detail);
});

test("admin API rejects state changes without a same-origin Origin header", async () => {
  const response = await handleAdminApi(
    new Request("https://admin.example.test/api/admin/media/upload", {
      method: "POST",
    }),
    env,
    identity,
    keyDependencies(),
  );

  assert.equal(response.status, 403);
});

test("admin API has no permanent dog deletion endpoint", async () => {
  const response = await handleAdminApi(
    new Request("https://admin.example.test/api/admin/dogs/123", {
      method: "DELETE",
      headers: { Origin: "https://admin.example.test" },
    }),
    env,
    identity,
    keyDependencies(),
  );
  assert.equal(response.status, 405);
  assert.equal(response.headers.get("Allow"), "GET, PATCH");
});

test("admin API proxies uploads only after same-origin validation", async () => {
  const response = await handleAdminApi(
    new Request("https://admin.example.test/api/admin/media/upload", {
      method: "POST",
      headers: { Origin: "https://admin.example.test" },
    }),
    env,
    identity,
    keyDependencies(),
  );
  const payload = await response.json() as Record<string, unknown>;

  assert.equal(response.status, 201);
  assert.equal(payload.publicId, "abrigo-do-wlad/dogs/image-id");
  assert.equal("apiSecret" in payload, false);
});

test("admin API rate limits uploads per authenticated identity", async () => {
  let uploaded = false;
  let auditedOutcome = "";
  const response = await handleAdminApi(
    new Request("https://admin.example.test/api/admin/media/upload", {
      method: "POST",
      headers: { Origin: "https://admin.example.test" },
    }),
    env,
    identity,
    keyDependencies({
      consumeUploadRateLimit: async () => false,
      uploadCloudinaryImage: async () => {
        uploaded = true;
        throw new Error("must not upload");
      },
      recordAdminAuditEvent: async (_env, event) => {
        auditedOutcome = event.outcome;
      },
    }),
  );

  assert.equal(response.status, 429);
  assert.equal(response.headers.get("Retry-After"), "60");
  assert.equal(uploaded, false);
  assert.equal(auditedOutcome, "rejected");
});

test("admin API records successful mutations without request payloads", async () => {
  let audited: Parameters<AdminApiDependencies["recordAdminAuditEvent"]>[1] | undefined;
  const response = await handleAdminApi(
    new Request("https://admin.example.test/api/admin/media/upload", {
      method: "POST",
      headers: {
        "Cf-Ray": "test-ray-123",
        Origin: "https://admin.example.test",
      },
    }),
    env,
    identity,
    keyDependencies({
      recordAdminAuditEvent: async (_env, event) => {
        audited = event;
      },
    }),
  );

  assert.equal(response.status, 201);
  assert.equal(audited?.action, "media.uploaded");
  assert.equal(audited?.actor, identity.email);
  assert.equal(audited?.requestId, "test-ray-123");
  assert.equal(audited?.target, "cloudinary/dogs");
  assert.equal(audited?.outcome, "success");
  assert.equal("imageUrl" in (audited ?? {}), false);
});

test("dog updates reject more than six photos before accessing Firestore", async () => {
  const response = await handleAdminApi(
    new Request("https://admin.example.test/api/admin/dogs/123", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Origin: "https://admin.example.test",
      },
      body: JSON.stringify({
        fotos: Array.from(
          { length: 7 },
          (_, index) => `https://images.example.test/dog-${index}.jpg`,
        ),
      }),
    }),
    env,
    identity,
  );

  assert.equal(response.status, 400);
  assert.equal(
    (await response.json() as { error: string }).error,
    "Um cachorro pode ter no máximo 6 fotos.",
  );
});

test("dog updates reject more than five tags before accessing Firestore", async () => {
  const response = await handleAdminApi(
    new Request("https://admin.example.test/api/admin/dogs/123", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Origin: "https://admin.example.test",
      },
      body: JSON.stringify({
        tags: ["Dócil", "Ativo", "Tranquilo", "Sociável", "Carinhoso", "Brincalhão"],
      }),
    }),
    env,
    identity,
  );

  assert.equal(response.status, 400);
  assert.equal(
    (await response.json() as { error: string }).error,
    "Um cachorro pode ter no máximo 5 tags.",
  );
});

test("dog updates reject temperament longer than 80 characters before accessing Firestore", async () => {
  const response = await handleAdminApi(
    new Request("https://admin.example.test/api/admin/dogs/123", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Origin: "https://admin.example.test",
      },
      body: JSON.stringify({ temperamento: "a".repeat(81) }),
    }),
    env,
    identity,
  );

  assert.equal(response.status, 400);
  assert.equal(
    (await response.json() as { error: string }).error,
    "O temperamento deve ter no máximo 80 caracteres.",
  );
});

test("dog updates reject free-form ages before accessing Firestore", async () => {
  const response = await handleAdminApi(
    new Request("https://admin.example.test/api/admin/dogs/123", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Origin: "https://admin.example.test",
      },
      body: JSON.stringify({ idade: "aaaaaaaaaaaaaaaa" }),
    }),
    env,
    identity,
  );

  assert.equal(response.status, 400);
  assert.equal(
    (await response.json() as { error: string }).error,
    "Informe uma idade válida, como 1 ano, 8 meses ou 2-3 anos.",
  );
});

test("dog updates reject removed health statuses before accessing Firestore", async () => {
  for (const status of ["Adotado", "Em tratamento", "Vacinado", "Castrado"]) {
    const response = await handleAdminApi(
      new Request("https://admin.example.test/api/admin/dogs/123", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Origin: "https://admin.example.test",
        },
        body: JSON.stringify({ status }),
      }),
      env,
      identity,
    );

    assert.equal(response.status, 400);
  }
});

test("administrator identities cannot list system keys", async () => {
  let called = false;
  const response = await handleAdminApi(
    new Request("https://admin.example.test/api/admin/system-keys"),
    env,
    identity,
    keyDependencies({
      listSystemKeys: async () => {
        called = true;
        return [];
      },
    }),
  );

  assert.equal(response.status, 403);
  assert.equal(called, false);
});

test("administrator identities cannot rotate system keys", async () => {
  let called = false;
  const response = await handleAdminApi(
    new Request("https://admin.example.test/api/admin/system-keys/rotate", {
      method: "POST",
      headers: { Origin: "https://admin.example.test" },
    }),
    env,
    identity,
    keyDependencies({
      rotateSystemKey: async () => {
        called = true;
        return { id: "forbidden", version: "v999" };
      },
    }),
  );

  assert.equal(response.status, 403);
  assert.equal(called, false);
});

test("developer identities can list sanitized system-key metadata", async () => {
  const metadata = [{
    id: "key-id",
    version: "v1",
    createdAt: "2026-08-22T12:00:00.000Z",
    author: developerIdentity.email,
    counter: 4,
    active: true,
  }];
  const response = await handleAdminApi(
    new Request("https://admin.example.test/api/admin/system-keys"),
    env,
    developerIdentity,
    keyDependencies({ listSystemKeys: async () => metadata }),
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), metadata);
  assert.equal("key" in metadata[0], false);
});

test("only developer identities can read the bounded audit trail", async () => {
  let called = false;
  const administratorResponse = await handleAdminApi(
    new Request("https://admin.example.test/api/admin/audit-log"),
    env,
    identity,
    keyDependencies({
      listAdminAuditEvents: async () => {
        called = true;
        return [];
      },
    }),
  );

  assert.equal(administratorResponse.status, 403);
  assert.equal(called, false);

  const developerResponse = await handleAdminApi(
    new Request("https://admin.example.test/api/admin/audit-log"),
    env,
    developerIdentity,
    keyDependencies({
      listAdminAuditEvents: async () => {
        called = true;
        return [];
      },
    }),
  );

  assert.equal(developerResponse.status, 200);
  assert.equal(called, true);
  assert.deepEqual(await developerResponse.json(), []);
});

test("developer identities can rotate system keys", async () => {
  let receivedIdentity: AccessIdentity | undefined;
  const response = await handleAdminApi(
    new Request("https://admin.example.test/api/admin/system-keys/rotate", {
      method: "POST",
      headers: { Origin: "https://admin.example.test" },
    }),
    env,
    developerIdentity,
    keyDependencies({
      rotateSystemKey: async (_env, requestIdentity) => {
        receivedIdentity = requestIdentity;
        return { id: "new-key-id", version: "v2" };
      },
    }),
  );

  assert.equal(response.status, 201);
  assert.deepEqual(await response.json(), { id: "new-key-id", version: "v2" });
  assert.deepEqual(receivedIdentity, developerIdentity);
});

test("administrator identities can read the current admin notification", async () => {
  const notification = {
    message: "Manutenção programada para hoje.",
    type: "info" as const,
    target: "admin" as const,
    updatedAt: "2026-08-24T12:00:00.000Z",
    author: developerIdentity.email,
    expiration: "until_deleted" as const,
    expiresAt: null,
  };
  const response = await handleAdminApi(
    new Request("https://admin.example.test/api/admin/notifications"),
    env,
    identity,
    keyDependencies({ getAdminNotification: async () => notification }),
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), notification);
});

test("administrator identities cannot change the admin notification", async () => {
  let called = false;
  const response = await handleAdminApi(
    new Request("https://admin.example.test/api/admin/notifications", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Origin: "https://admin.example.test",
      },
      body: JSON.stringify({
        message: "Alerta",
        type: "urgent",
        expiration: "1h",
      }),
    }),
    env,
    identity,
    keyDependencies({
      saveAdminNotification: async (_env, input, requestIdentity) => {
        called = true;
        return notificationResponse(input, requestIdentity);
      },
    }),
  );

  assert.equal(response.status, 403);
  assert.equal(called, false);
});

test("developer identities can replace the single admin notification", async () => {
  let receivedInput: NotificationInput | undefined;
  const response = await handleAdminApi(
    new Request("https://admin.example.test/api/admin/notifications", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Origin: "https://admin.example.test",
      },
      body: JSON.stringify({
        message: "  Atenção ao prazo.  ",
        type: "urgent",
        expiration: "6h",
      }),
    }),
    env,
    developerIdentity,
    keyDependencies({
      saveAdminNotification: async (_env, input, requestIdentity) => {
        receivedInput = input;
        return notificationResponse(input, requestIdentity);
      },
    }),
  );

  assert.equal(response.status, 200);
  assert.deepEqual(receivedInput, {
    message: "Atenção ao prazo.",
    type: "urgent",
    expiration: "6h",
  });
  assert.deepEqual(await response.json(), {
    message: "Atenção ao prazo.",
    type: "urgent",
    target: "admin",
    updatedAt: "2026-08-24T12:00:00.000Z",
    author: developerIdentity.email,
    expiration: "6h",
    expiresAt: "2026-08-24T18:00:00.000Z",
  });
});

test("notification updates reject unsupported types", async () => {
  let called = false;
  const response = await handleAdminApi(
    new Request("https://admin.example.test/api/admin/notifications", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Origin: "https://admin.example.test",
      },
      body: JSON.stringify({
        message: "Alerta",
        type: "critical",
        expiration: "1h",
      }),
    }),
    env,
    developerIdentity,
    keyDependencies({
      saveAdminNotification: async (_env, input, requestIdentity) => {
        called = true;
        return notificationResponse(input, requestIdentity);
      },
    }),
  );

  assert.equal(response.status, 400);
  assert.equal(called, false);
});

test("notification updates reject unsupported expiration options", async () => {
  let called = false;
  const response = await handleAdminApi(
    new Request("https://admin.example.test/api/admin/notifications", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Origin: "https://admin.example.test",
      },
      body: JSON.stringify({
        message: "Alerta",
        type: "info",
        expiration: "24h",
      }),
    }),
    env,
    developerIdentity,
    keyDependencies({
      saveAdminNotification: async (_env, input, requestIdentity) => {
        called = true;
        return notificationResponse(input, requestIdentity);
      },
    }),
  );

  assert.equal(response.status, 400);
  assert.equal(called, false);
});

test("developer identities can remove the admin notification", async () => {
  let receivedIdentity: AccessIdentity | undefined;
  const response = await handleAdminApi(
    new Request("https://admin.example.test/api/admin/notifications", {
      method: "DELETE",
      headers: { Origin: "https://admin.example.test" },
    }),
    env,
    developerIdentity,
    keyDependencies({
      deleteAdminNotification: async (_env, requestIdentity) => {
        receivedIdentity = requestIdentity;
      },
    }),
  );

  assert.equal(response.status, 204);
  assert.deepEqual(receivedIdentity, developerIdentity);
});
