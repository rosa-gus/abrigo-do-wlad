import assert from "node:assert/strict";
import { afterEach, beforeEach, test, vi } from "vitest";

import { FirestoreRestClient, type AtomicDocumentWrite, type FirestoreDocument } from "../../../workers/shared/api/_lib/firestore";

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

const linkedImage = "https://res.cloudinary.com/test-cloud/image/upload/v1/abrigo-do-wlad/dogs/image-id.jpg";
const TEST_REVISION = "2026-11-01T12:00:00.000Z";

// Exercise the real media service while keeping only its Firestore I/O synthetic.
beforeEach(() => {
  const assets = new Map<string, FirestoreDocument<Record<string, unknown>>>();
  let revision = 0;
  vi.spyOn(FirestoreRestClient.prototype, "getDocument").mockImplementation(async (path) => {
    if (!path.startsWith("media_assets/")) throw new Error(`Unexpected unmocked document read: ${path}`);
    return assets.get(path) ?? null;
  });
  vi.spyOn(FirestoreRestClient.prototype, "commitAtomic").mockImplementation(async (writes: AtomicDocumentWrite[]) => {
    for (const write of writes) {
      const current = assets.get(write.path);
      if (write.kind === "delete") throw new Error("Unexpected registry delete");
      if (write.kind === "create") assert.equal(current, undefined);
      else assert.equal(write.updateTime, current?.updateTime);
    }
    return { writeResults: writes.map((write) => {
      if (write.kind === "delete") throw new Error("Unexpected registry delete");
      const updateTime = `registry-revision-${++revision}`;
      assets.set(write.path, {
        id: write.path.split("/").at(-1)!,
        name: `projects/test-project/databases/(default)/documents/${write.path}`,
        updateTime, data: { ...assets.get(write.path)?.data, ...write.data },
      });
      return { updateTime };
    }) };
  });
});

afterEach(() => vi.restoreAllMocks());

test("an older writer cannot delete media whose references may use a newer schema", async () => {
  const list = vi.spyOn(FirestoreRestClient.prototype, "listDocuments").mockResolvedValue([{
    id: "dog-1", name: "dogs/dog-1", updateTime: TEST_REVISION, data: { schemaVersion: 2, photos: [linkedImage] },
  }]);
  const fetcher = vi.spyOn(globalThis, "fetch");
  try {
    const response = await handleAdminApi(new Request("https://admin.example.test/api/admin/media/delete", {
      method: "POST", headers: { Origin: "https://admin.example.test", "Content-Type": "application/json" },
      body: JSON.stringify({ imageUrl: linkedImage }),
    }), env, identity, keyDependencies());
    assert.equal(response.status, 409);
    assert.equal(fetcher.mock.calls.length, 0);
  } finally { list.mockRestore(); fetcher.mockRestore(); }
});

for (const field of ["fotos", "retainedPhotos"]) {
  test.each([
    linkedImage,
    `${linkedImage}?variant=1`,
    `${linkedImage}#preview`,
    linkedImage.replace("/v1/", "/c_fill,w_200/v2/"),
    linkedImage.replace("image-id.jpg", "image-id.webp"),
    linkedImage.replace("image-id", "%69mage-id"),
    linkedImage.replace("/v1/", "/"),
    linkedImage.replace("/v1/", "/c_fill,w_200/f_webp/"),
  ].flatMap((url) => [[linkedImage, url], [url, linkedImage]]))(
    `media deletion protects ${field} across equivalent URLs: %s → %s`,
    async (storedUrl, imageUrl) => {
      const list = vi.spyOn(FirestoreRestClient.prototype, "listDocuments").mockResolvedValue([{
        id: "dog-1",
        name: "projects/test-project/databases/(default)/documents/dogs/dog-1",
        data: { [field]: [storedUrl] },
      }]);
      const fetcher = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Must not delete linked media"));
      try {
        const response = await handleAdminApi(
          new Request("https://admin.example.test/api/admin/media/delete", {
            method: "POST",
            headers: { Origin: "https://admin.example.test", "Content-Type": "application/json" },
            body: JSON.stringify({ imageUrl }),
          }),
          env, identity, keyDependencies(),
        );
        assert.equal(response.status, 409);
        assert.equal(fetcher.mock.calls.length, 0);
      } finally {
        fetcher.mockRestore();
        list.mockRestore();
      }
    },
  );
}

test("media deletion still removes unlinked images in the managed folder", async () => {
  const list = vi.spyOn(FirestoreRestClient.prototype, "listDocuments").mockResolvedValue([{
    id: "dog-1",
    name: "projects/test-project/databases/(default)/documents/dogs/dog-1",
    data: { fotos: [linkedImage, "https://example.test/legacy.jpg"], retainedPhotos: [null] },
  }]);
  const fetcher = vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({ result: "ok" }));
  try {
    const response = await handleAdminApi(
      new Request("https://admin.example.test/api/admin/media/delete", {
        method: "POST",
        headers: { Origin: "https://admin.example.test", "Content-Type": "application/json" },
        body: JSON.stringify({ imageUrl: linkedImage.replace("image-id", "orphan") }),
      }),
      env, identity, keyDependencies(),
    );
    assert.equal(response.status, 200);
    assert.equal(fetcher.mock.calls.length, 1);
    const [url, init] = fetcher.mock.calls[0];
    assert.equal(String(url), "https://api.cloudinary.com/v1_1/test-cloud/image/destroy");
    assert.equal((init?.body as URLSearchParams).get("public_id"), "abrigo-do-wlad/dogs/orphan");
  } finally {
    fetcher.mockRestore();
    list.mockRestore();
  }
});

test("adoption list returns only the summary contract provided by the repository", async () => {
  const summaries = [{
    id: "application-1",
    nome_adotante: "Lívia",
    status: "pending",
    submittedAt: "2026-08-24T12:00:00.000Z",
    expiresAt: "2099-01-01T00:00:00.000Z",
  }];
  const response = await handleAdminApi(
    new Request("https://admin.example.test/api/admin/adoptions"),
    env,
    identity,
    keyDependencies({ listAdoptionApplications: async () => summaries }),
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { items: summaries, nextCursor: null });
});

test.each(["approved", "rejected", "pending"] as const)("adoption status %s saves its timestamp deadline with a read-version precondition", async (status) => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-10T12:00:00.000Z"));
  const name = "projects/test-project/databases/(default)/documents/adoption_application/application-1";
  const updateTime = "2026-10-10T11:00:00.000Z";
  const get = vi.spyOn(FirestoreRestClient.prototype, "getDocument").mockResolvedValue({
    id: "application-1", name, updateTime,
    data: {
      status: status === "pending" ? "approved" : "pending",
      submittedAt: "2026-10-01T12:00:00.000Z",
      expiresAt: status === "pending" ? "2026-10-17T03:00:00.000Z" : "2026-10-31T12:00:00.000Z",
      originalExpiresAt: "2026-10-31T12:00:00.000Z",
    },
  });
  const update = vi.spyOn(FirestoreRestClient.prototype, "updateDocument").mockResolvedValue({});
  try {
    const response = await handleAdminApi(new Request("https://admin.example.test/api/admin/adoptions/application-1/status", {
      method: "PATCH", headers: { Origin: "https://admin.example.test", "Content-Type": "application/json", "If-Match": `"${updateTime}"` },
      body: JSON.stringify({ status }),
    }), env, identity, keyDependencies());
    assert.equal(response.status, 200);
    const expiresAt = "2026-10-17T03:00:00.000Z";
    assert.deepEqual(update.mock.calls[0], [name, {
      status, expiresAt: new Date(expiresAt),
      originalExpiresAt: "2026-10-31T12:00:00.000Z",
      decisionExpiresAt: expiresAt,
    }, { expectedUpdateTime: updateTime }]);
    assert.equal((await response.json() as { expiresAt: string }).expiresAt, expiresAt);
  } finally {
    get.mockRestore(); update.mockRestore(); vi.useRealTimers();
  }
});

test("adoption detail validates the id and loads one full application", async () => {
  let requestedId = "";
  const detail = {
    id: "application-1",
    nome_adotante: "Lívia",
    email: "livia@example.test",
    expiresAt: "2099-01-01T00:00:00.000Z",
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

test("admin API rejects permanent deletion of published dogs", async () => {
  const find = vi.spyOn(FirestoreRestClient.prototype, "findDocumentsByField").mockResolvedValue([{
    id: "dog-1", name: "dogs/dog-1", updateTime: TEST_REVISION, data: { publicationStatus: "published" },
  }]);
  try {
    const response = await handleAdminApi(
      new Request("https://admin.example.test/api/admin/dogs/123", {
        method: "DELETE", headers: { Origin: "https://admin.example.test", "If-Match": `"${TEST_REVISION}"` },
      }), env, identity, keyDependencies(),
    );
    assert.equal(response.status, 409);
  } finally { find.mockRestore(); }
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
    (await response.json() as { error: { message: string } }).error.message,
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
    (await response.json() as { error: { message: string } }).error.message,
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
    (await response.json() as { error: { message: string } }).error.message,
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
    (await response.json() as { error: { message: string } }).error.message,
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
  let receivedRevision: string | undefined;
  const response = await handleAdminApi(
    new Request("https://admin.example.test/api/admin/system-keys/rotate", {
      method: "POST",
      headers: { Origin: "https://admin.example.test", "If-Match": '"absent"' },
    }),
    env,
    developerIdentity,
    keyDependencies({
      rotateSystemKey: async (_env, requestIdentity, revision) => {
        receivedIdentity = requestIdentity;
        receivedRevision = revision;
        return { id: "new-key-id", version: "v2" };
      },
    }),
  );

  assert.equal(response.status, 201);
  assert.deepEqual(await response.json(), { id: "new-key-id", version: "v2" });
  assert.deepEqual(receivedIdentity, developerIdentity);
  assert.equal(receivedRevision, "absent");
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
  let receivedRevision: string | undefined;
  const response = await handleAdminApi(
    new Request("https://admin.example.test/api/admin/notifications", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Origin: "https://admin.example.test",
        "If-Match": '"absent"',
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
      saveAdminNotification: async (_env, input, requestIdentity, now, revision) => {
        receivedInput = input;
        receivedRevision = revision;
        assert.equal(now, undefined);
        return notificationResponse(input, requestIdentity);
      },
    }),
  );

  assert.equal(response.status, 200);
  assert.equal(receivedRevision, "absent");
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
  let receivedRevision: string | undefined;
  const response = await handleAdminApi(
    new Request("https://admin.example.test/api/admin/notifications", {
      method: "DELETE",
      headers: { Origin: "https://admin.example.test", "If-Match": '"absent"' },
    }),
    env,
    developerIdentity,
    keyDependencies({
      deleteAdminNotification: async (_env, requestIdentity, revision) => {
        receivedIdentity = requestIdentity;
        receivedRevision = revision;
      },
    }),
  );

  assert.equal(response.status, 204);
  assert.deepEqual(receivedIdentity, developerIdentity);
  assert.equal(receivedRevision, "absent");
});

const completeDog = {
  nome: "Nina", idade: "2 anos", cateIdade: "adulto", sexo: "Fêmea",
  temperamento: "Dócil", tags: [], status: "Apenas Castrado", cor: "caramelo", fotos: [],
};
function publicationRequest(path: string, method: string, body?: unknown) {
  return new Request(`https://admin.example.test/api/admin/${path}`, {
    method, headers: { Origin: "https://admin.example.test", "Content-Type": "application/json", "If-Match": `"${body && typeof body === "object" && "expectedUpdateTime" in body ? body.expectedUpdateTime : TEST_REVISION}"` },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

test("new dog drafts persist partial fields and default to internal visibility", async () => {
  const create = vi.spyOn(FirestoreRestClient.prototype, "createDocument").mockResolvedValue({ id: "dog-1" });
  try {
    const response = await handleAdminApi(publicationRequest("dogs", "POST", { nome: "Nina" }), env, identity, keyDependencies());
    assert.equal(response.status, 201);
    const saved = create.mock.calls[0][1];
    assert.equal(saved.publicationStatus, "draft");
    assert.equal(saved.schemaVersion, 1);
    assert.equal(saved.status, "");
    assert.equal(saved.idade, "");
    assert.equal(saved.publishedAt, undefined);
    assert.ok(saved.updatedAt);
  } finally { create.mockRestore(); }
});

test.each([
  [{ nome: "Nina", publicationStatus: "draft" }, { publicationStatus: "published" }],
  [{ ...completeDog, publicationStatus: "published" }, { idade: "" }],
])("publication and published edits validate the entire resulting dog", async (stored, patch) => {
  const find = vi.spyOn(FirestoreRestClient.prototype, "findDocumentsByField").mockResolvedValue([{
    id: "dog-1", name: "dogs/dog-1", updateTime: TEST_REVISION, data: stored,
  }]);
  const update = vi.spyOn(FirestoreRestClient.prototype, "updateDocument").mockResolvedValue({});
  try {
    const response = await handleAdminApi(publicationRequest("dogs/123", "PATCH", patch), env, identity, keyDependencies());
    assert.equal(response.status, 400);
    assert.equal(update.mock.calls.length, 0);
  } finally { find.mockRestore(); update.mockRestore(); }
});

test("publishing a complete draft sets its first-publication timestamp and a write precondition", async () => {
  const updateTime = "2026-11-01T12:00:00.000Z";
  const find = vi.spyOn(FirestoreRestClient.prototype, "findDocumentsByField").mockResolvedValue([{
    id: "dog-1", name: "dogs/dog-1", updateTime, data: { ...completeDog, publicationStatus: "draft" },
  }]);
  const update = vi.spyOn(FirestoreRestClient.prototype, "updateDocument").mockResolvedValue({});
  try {
    const response = await handleAdminApi(publicationRequest("dogs/123", "PATCH", { publicationStatus: "published" }), env, identity, keyDependencies());
    assert.equal(response.status, 200);
    assert.equal(update.mock.calls[0][1].publicationStatus, "published");
    assert.ok(update.mock.calls[0][1].publishedAt);
    assert.deepEqual(update.mock.calls[0][2], { expectedUpdateTime: updateTime });
  } finally { find.mockRestore(); update.mockRestore(); }
});

test("unpublishing preserves photos and does not archive or count an adoption", async () => {
  const find = vi.spyOn(FirestoreRestClient.prototype, "findDocumentsByField").mockResolvedValue([{
    id: "dog-1", name: "dogs/dog-1", updateTime: TEST_REVISION, data: { ...completeDog, publicationStatus: "published", publishedAt: "2026-11-01T12:00:00.000Z" },
  }]);
  const update = vi.spyOn(FirestoreRestClient.prototype, "updateDocument").mockResolvedValue({});
  try {
    const response = await handleAdminApi(publicationRequest("dogs/123", "PATCH", { publicationStatus: "draft", idade: "" }), env, identity, keyDependencies());
    assert.equal(response.status, 200);
    const saved = update.mock.calls[0][1];
    assert.equal(saved.publicationStatus, "draft");
    assert.deepEqual(saved.fotos, []);
    assert.equal(saved.archivedAt, undefined);
    assert.equal(saved.purgeAfter, undefined);
    assert.equal(saved.adoptionCountedAt, undefined);
  } finally { find.mockRestore(); update.mockRestore(); }
});

test("restoring an archived dog always returns it as a draft", async () => {
  const find = vi.spyOn(FirestoreRestClient.prototype, "findDocumentsByField").mockResolvedValue([{
    id: "dog-1", name: "dogs/dog-1", updateTime: TEST_REVISION, data: { ...completeDog, archivedAt: "2026-11-01T12:00:00.000Z", publicationStatus: "published" },
  }]);
  const update = vi.spyOn(FirestoreRestClient.prototype, "updateDocument").mockResolvedValue({});
  try {
    const response = await handleAdminApi(publicationRequest("dogs/123/restore", "POST"), env, identity, keyDependencies());
    assert.equal(response.status, 200);
    assert.equal(update.mock.calls[0][1].publicationStatus, "draft");
    assert.equal(update.mock.calls[0][1].purgeAfter, null);
  } finally { find.mockRestore(); update.mockRestore(); }
});

test.each([undefined, "2026-11-01T00:00:00.000Z"])("archiving a draft does not expose its unpublished name (publishedAt %s)", async publishedAt => {
  const find = vi.spyOn(FirestoreRestClient.prototype, "findDocumentsByField").mockResolvedValue([{
    id: "dog-1", name: "dogs/dog-1", updateTime: TEST_REVISION, data: { nome: "Nome interno", publicationStatus: "draft", publishedAt },
  }]);
  const update = vi.spyOn(FirestoreRestClient.prototype, "updateDocument").mockResolvedValue({});
  const saveDogTombstone = vi.fn();
  try {
    const response = await handleAdminApi(publicationRequest("dogs/123/archive", "POST", { reason: "other" }), env, identity, keyDependencies({ saveDogTombstone }));
    assert.equal(response.status, 200);
    assert.equal(saveDogTombstone.mock.calls.length, 0);
  } finally { find.mockRestore(); update.mockRestore(); }
});

test("draft deletion requires the read document version", async () => {
  const updateTime = "2026-11-01T12:00:00.000Z";
  const find = vi.spyOn(FirestoreRestClient.prototype, "findDocumentsByField").mockResolvedValue([{
    id: "dog-1", name: "dogs/dog-1", updateTime, data: { nome: "Nina", publicationStatus: "draft" },
  }]);
  const remove = vi.spyOn(FirestoreRestClient.prototype, "deleteDocumentsIfUnchanged").mockResolvedValue({ deleted: 1 });
  try {
    const response = await handleAdminApi(publicationRequest("dogs/123", "DELETE"), env, identity, keyDependencies());
    assert.equal(response.status, 204);
    assert.deepEqual(remove.mock.calls[0][0], [{ name: "dogs/dog-1", updateTime }]);
  } finally { find.mockRestore(); remove.mockRestore(); }
});

test("recycle points accept partial drafts but reject incomplete publication", async () => {
  const create = vi.spyOn(FirestoreRestClient.prototype, "createDocument").mockResolvedValue({ id: "point-1" });
  const get = vi.spyOn(FirestoreRestClient.prototype, "getDocument").mockResolvedValue({
    id: "point-1", name: "recycle_points/point-1", updateTime: TEST_REVISION, data: { name: "Mercado", publicationStatus: "draft" },
  });
  const update = vi.spyOn(FirestoreRestClient.prototype, "updateDocument").mockResolvedValue({});
  try {
    const created = await handleAdminApi(publicationRequest("recycle-points", "POST", { name: "Mercado" }), env, identity, keyDependencies());
    assert.equal(created.status, 201);
    assert.equal(create.mock.calls[0][1].publicationStatus, "draft");
    assert.equal(create.mock.calls[0][1].schemaVersion, 1);
    const rejected = await handleAdminApi(publicationRequest("recycle-points/point-1", "PATCH", { publicationStatus: "published" }), env, identity, keyDependencies());
    assert.equal(rejected.status, 400);
    assert.equal(update.mock.calls.length, 0);
  } finally { create.mockRestore(); get.mockRestore(); update.mockRestore(); }
});

test.each(["dogs/123", "recycle-points/point-1"])("an older writer cannot mutate newer document versions at %s", async path => {
  const stored = { id: "record", name: "record", data: { ...completeDog, schemaVersion: 2, publicationStatus: "draft" } };
  const find = vi.spyOn(FirestoreRestClient.prototype, "findDocumentsByField").mockResolvedValue([stored]);
  const get = vi.spyOn(FirestoreRestClient.prototype, "getDocument").mockResolvedValue(stored);
  const update = vi.spyOn(FirestoreRestClient.prototype, "updateDocument").mockResolvedValue({});
  try {
    const response = await handleAdminApi(publicationRequest(path, "PATCH", { publicationStatus: "published" }), env, identity, keyDependencies());
    assert.equal(response.status, 409);
    assert.equal(update.mock.calls.length, 0);
  } finally { find.mockRestore(); get.mockRestore(); update.mockRestore(); }
});

test.each(["dogs/123", "recycle-points/point-1"])("stale editors cannot republish %s after another editor unpublishes it", async path => {
  const stored = {
    id: "record", name: "record", updateTime: "2026-11-02T00:00:00.000Z",
    data: { ...completeDog, name: "Mercado", zone: "Centro", neighborhood: "Vila", address: "Rua 1", publicationStatus: "draft" },
  };
  const find = vi.spyOn(FirestoreRestClient.prototype, "findDocumentsByField").mockResolvedValue([stored]);
  const get = vi.spyOn(FirestoreRestClient.prototype, "getDocument").mockResolvedValue(stored);
  const update = vi.spyOn(FirestoreRestClient.prototype, "updateDocument").mockResolvedValue({});
  try {
    const response = await handleAdminApi(publicationRequest(path, "PATCH", {
      publicationStatus: "published", expectedUpdateTime: "2026-11-01T00:00:00.000Z",
    }), env, identity, keyDependencies());
    assert.equal(response.status, 412);
    assert.equal(update.mock.calls.length, 0);
  } finally { find.mockRestore(); get.mockRestore(); update.mockRestore(); }
});
