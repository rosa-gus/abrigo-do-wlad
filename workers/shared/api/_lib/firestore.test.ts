import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { test } from "vitest";

import {
  createFirestoreDocumentId,
  FirestoreRestClient,
  FirestoreRestError,
} from "./firestore.ts";

test("atomic commits send every document precondition together and return exact write revisions", async () => {
  const bodies: Array<{ writes: Array<Record<string, unknown>> }> = [];
  const revision = "2026-11-16T12:00:00.123456Z";
  const client = new FirestoreRestClient("test-project", {
    tokenProvider: async () => "synthetic",
    fetcher: mockFetch((_url, init) => {
      bodies.push(JSON.parse(String(init?.body)));
      return Response.json({ writeResults: [{ updateTime: revision }, { updateTime: revision }] });
    }),
  });
  const result = await client.commitAtomic([
    { kind: "create", path: "dogs/new-dog", data: { fotos: ["https://example.test/a.jpg"] } },
    { kind: "update", path: "media_assets/asset", updateTime: revision, data: { state: "ready", referencedBy: ["dogs/new-dog"] } },
  ]);
  assert.equal(bodies.length, 1);
  assert.deepEqual(bodies[0].writes[0].currentDocument, { exists: false });
  assert.deepEqual(bodies[0].writes[1].currentDocument, { updateTime: revision });
  assert.deepEqual(bodies[0].writes[1].updateMask, { fieldPaths: ["state", "referencedBy"] });
  assert.equal(result.writeResults?.[0].updateTime, revision);
  await assert.rejects(() => client.commitAtomic([
    { kind: "delete", path: "dogs/new-dog", updateTime: "bad" },
  ]), /valid timestamp/);
  await assert.rejects(() => client.commitAtomic([
    { kind: "create", path: "dogs/new-dog", data: { name: "a" } },
    { kind: "create", path: "dogs/new-dog", data: { name: "b" } },
  ]), /duplicate/);
  await assert.rejects(() => client.commitAtomic([
    { kind: "create", path: "../dogs/new-dog", data: { name: "a" } },
  ]), /root document/);
  assert.equal(bodies.length, 1);
});

test("bounded equality queries retain both duplicate legacy identities", async () => {
  let query: Record<string, unknown> = {};
  const client = new FirestoreRestClient("test-project", {
    tokenProvider: async () => "synthetic",
    fetcher: mockFetch((_url, init) => {
      query = JSON.parse(String(init?.body)).structuredQuery;
      return Response.json(["dog-a", "dog-b"].map(id => ({ document: {
        name: `projects/test-project/databases/(default)/documents/dogs/${id}`,
        fields: { id: { integerValue: "123" } },
      } })));
    }),
  });
  const matches = await client.findDocumentsByField("dogs", "id", 123);
  assert.equal(matches.length, 2);
  assert.deepEqual(query.where, { fieldFilter: {
    field: { fieldPath: "id" }, op: "EQUAL", value: { integerValue: "123" },
  } });
  assert.equal(query.limit, 2);
});

test("encrypted creation uses the same guarded commit for the document and key counter", async () => {
  const commits: Array<{ writes: Array<Record<string, unknown>> }> = [];
  const client = new FirestoreRestClient("test-project", {
    tokenProvider: async () => "test-token",
    fetcher: mockFetch((_url, init) => {
      commits.push(JSON.parse(String(init?.body)));
      // Firestore rejects the entire commit on duplicate creation.
      return commits.length === 1 ? Response.json({})
        : Response.json({ error: { message: "Already exists" } }, { status: 409 });
    }),
  });
  const options = {
    documentId: "request-1",
    increments: [{ documentPath: "system/keys", fieldPath: ["keys", "key-with-hyphens", "counter"], amount: 1 }],
  };
  await client.createDocument("adoption_application", { sensitive: "ciphertext" }, options);
  assert.equal(commits[0].writes.length, 2);
  assert.deepEqual(commits[0].writes[0].currentDocument, { exists: false });
  assert.deepEqual(commits[0].writes[1], {
    transform: {
      document: "projects/test-project/databases/(default)/documents/system/keys",
      fieldTransforms: [{ fieldPath: "`keys`.`key-with-hyphens`.`counter`", increment: { integerValue: "1" } }],
    },
    currentDocument: { exists: true },
  });
  await assert.rejects(() => client.createDocument("adoption_application", {}, options),
    (error: unknown) => error instanceof FirestoreRestError && error.status === 409);
  assert.equal(commits.length, 2); // No independent counter request after a failed commit.
});

test("cleanup reserves one write for counters across multiple encryption keys", async () => {
  let writes: Array<Record<string, unknown>> = [];
  const client = new FirestoreRestClient("test-project", {
    tokenProvider: async () => "test-token",
    fetcher: mockFetch((_url, init) => {
      writes = JSON.parse(String(init?.body)).writes;
      return Response.json({});
    }),
  });
  const documents = Array.from({ length: 499 }, (_, index) => ({
    name: `projects/test-project/databases/(default)/documents/adoption_application/request-${index}`,
    updateTime: "2026-08-20T00:00:01Z",
  }));
  const result = await client.deleteDocumentsIfUnchanged(documents, [
    { documentPath: "system/keys", fieldPath: ["keys", "old-key", "counter"], amount: -200 },
    { documentPath: "system/keys", fieldPath: ["keys", "new-key", "counter"], amount: -299 },
  ]);
  assert.equal(result.deleted, 499);
  assert.equal(writes.length, 500);
  assert.deepEqual(writes[0].currentDocument, { updateTime: documents[0].updateTime });
  assert.deepEqual(writes[499], {
    transform: {
      document: "projects/test-project/databases/(default)/documents/system/keys",
      fieldTransforms: [
        { fieldPath: "`keys`.`old-key`.`counter`", increment: { integerValue: "-200" } },
        { fieldPath: "`keys`.`new-key`.`counter`", increment: { integerValue: "-299" } },
      ],
    },
    currentDocument: { exists: true },
  });
});

test("updateDocument returns the actual write version for a conditional follow-up", async () => {
  const client = new FirestoreRestClient("test-project", {
    fetcher: mockFetch(() => Response.json({ commitTime: "commit-time", writeResults: [{ updateTime: "document-version" }] })),
    tokenProvider: async () => "synthetic-token",
  });
  const result = await client.updateDocument(
    "projects/test-project/databases/(default)/documents/adoption_application/test",
    { notificationStatus: "pending" },
  );
  assert.equal(result.updateTime, "document-version");
});

function mockFetch(
  handler: (url: string, init?: RequestInit) => Response | Promise<Response>,
): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) =>
    handler(String(input), init)) as typeof fetch;
}

test("FirestoreRestClient authenticates with a service account JWT", async () => {
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const privateKeyPem = privateKey
    .export({ format: "pem", type: "pkcs8" })
    .toString();
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const fetcher = mockFetch((url, init) => {
    requests.push({ url, init });

    if (url === "https://oauth2.googleapis.com/token") {
      return Response.json({ access_token: "oauth-token", expires_in: 3600 });
    }

    return Response.json({
      name: "projects/test-auth/databases/(default)/documents/system/keys",
      fields: {},
    });
  });
  const client = new FirestoreRestClient(
    "test-auth",
    { fetcher },
    {
      FIREBASE_PROJECT_ID: "test-auth",
      FIREBASE_CLIENT_EMAIL: "worker@test-auth.iam.gserviceaccount.com",
      FIREBASE_PRIVATE_KEY: privateKeyPem,
    },
  );

  await client.getDocument("system/keys");

  assert.equal(requests.length, 2);
  assert.equal(requests[0]?.url, "https://oauth2.googleapis.com/token");
  const tokenBody = requests[0]?.init?.body as URLSearchParams;
  assert.equal(
    tokenBody.get("grant_type"),
    "urn:ietf:params:oauth:grant-type:jwt-bearer",
  );
  assert.equal(tokenBody.get("assertion")?.split(".").length, 3);
  assert.equal(
    new Headers(requests[1]?.init?.headers).get("Authorization"),
    "Bearer oauth-token",
  );
});

test("FirestoreRestClient does not rebind the fetch receiver", async () => {
  let calls = 0;
  const fetcher = async function (this: unknown): Promise<Response> {
    if (this !== undefined) {
      throw new TypeError("fetch was called with an incorrect this reference");
    }

    calls += 1;
    return Response.json({
      name: "projects/test-project/databases/(default)/documents/system/keys",
      fields: {},
    });
  } as typeof fetch;
  const client = new FirestoreRestClient("test-project", {
    fetcher,
    tokenProvider: async () => "test-token",
  });

  await client.getDocument("system/keys");

  assert.equal(calls, 1);
});

test("getDocument decodes Firestore REST values", async () => {
  const fetcher = mockFetch((url, init) => {
    assert.equal(
      url,
      "https://firestore.googleapis.com/v1/projects/test-project/databases/(default)/documents/system/keys",
    );
    assert.equal(
      new Headers(init?.headers).get("Authorization"),
      "Bearer test-token",
    );

    return Response.json({
      name: "projects/test-project/databases/(default)/documents/system/keys",
      fields: {
        active: { booleanValue: true },
        count: { integerValue: "2" },
        createdAt: { timestampValue: "2026-08-19T12:00:00Z" },
        tags: {
          arrayValue: {
            values: [{ stringValue: "active" }, { stringValue: "v2" }],
          },
        },
        nested: {
          mapValue: {
            fields: { key: { stringValue: "encrypted" } },
          },
        },
      },
    });
  });
  const client = new FirestoreRestClient("test-project", {
    fetcher,
    tokenProvider: async () => "test-token",
  });

  const document = await client.getDocument("system/keys");

  assert.deepEqual(document, {
    id: "keys",
    name: "projects/test-project/databases/(default)/documents/system/keys",
    data: {
      active: true,
      count: 2,
      createdAt: "2026-08-19T12:00:00Z",
      tags: ["active", "v2"],
      nested: { key: "encrypted" },
    },
    createTime: undefined,
    updateTime: undefined,
  });
});

test("findFirstDocument creates a document ID cursor query", async () => {
  let requestBody: Record<string, unknown> | undefined;
  const fetcher = mockFetch((_url, init) => {
    requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;

    return Response.json([
      {
        document: {
          name: "projects/test-project/databases/(default)/documents/dogs/dog-2",
          fields: { nome: { stringValue: "Wlad" } },
        },
      },
    ]);
  });
  const client = new FirestoreRestClient("test-project", {
    fetcher,
    tokenProvider: async () => "test-token",
  });

  const document = await client.findFirstDocument<{ nome: string }>(
    "dogs",
    "dog-1",
  );

  assert.equal(document?.id, "dog-2");
  assert.equal(document?.data.nome, "Wlad");
  assert.deepEqual(requestBody, {
    structuredQuery: {
      from: [{ collectionId: "dogs" }],
      orderBy: [
        {
          field: { fieldPath: "__name__" },
          direction: "ASCENDING",
        },
      ],
      limit: 1,
      where: {
        fieldFilter: {
          field: { fieldPath: "__name__" },
          op: "GREATER_THAN_OR_EQUAL",
          value: {
            referenceValue:
              "projects/test-project/databases/(default)/documents/dogs/dog-1",
          },
        },
      },
    },
  });
});

test("findDocumentsByTimestampBefore creates a bounded expiration query", async () => {
  let requestUrl = "";
  let requestBody: Record<string, unknown> | undefined;
  const fetcher = mockFetch((url, init) => {
    requestUrl = url;
    requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
    return Response.json([
      {
        document: {
          name: "projects/test-project/databases/(default)/documents/adoption_application/request-1",
          fields: {
            expiresAt: { timestampValue: "2026-08-20T00:00:00.000Z" },
          },
        },
      },
      { readTime: "2026-08-21T00:00:00.000Z" },
    ]);
  });
  const client = new FirestoreRestClient("test-project", {
    fetcher,
    tokenProvider: async () => "test-token",
  });
  const cutoff = new Date("2026-08-21T00:00:00.000Z");

  const documents = await client.findDocumentsByTimestampBefore(
    "adoption_application",
    "expiresAt",
    cutoff,
    200,
  );

  assert.equal(
    requestUrl,
    "https://firestore.googleapis.com/v1/projects/test-project/databases/(default)/documents:runQuery",
  );
  assert.equal(documents.length, 1);
  assert.equal(documents[0]?.id, "request-1");
  assert.deepEqual(requestBody, {
    structuredQuery: {
      from: [{ collectionId: "adoption_application" }],
      where: {
        fieldFilter: {
          field: { fieldPath: "expiresAt" },
          op: "LESS_THAN_OR_EQUAL",
          value: { timestampValue: "2026-08-21T00:00:00.000Z" },
        },
      },
      orderBy: [
        {
          field: { fieldPath: "expiresAt" },
          direction: "ASCENDING",
        },
        {
          field: { fieldPath: "__name__" },
          direction: "ASCENDING",
        },
      ],
      limit: 200,
    },
  });
});

test("deleteDocuments commits only documents from the configured database", async () => {
  let requestBody: Record<string, unknown> | undefined;
  const fetcher = mockFetch((_url, init) => {
    requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
    return Response.json({ commitTime: "2026-08-21T00:00:00.000Z" });
  });
  const client = new FirestoreRestClient("test-project", {
    fetcher,
    tokenProvider: async () => "test-token",
  });
  const names = [
    "projects/test-project/databases/(default)/documents/adoption_application/request-1",
    "projects/test-project/databases/(default)/documents/adoption_application/request-2",
  ];

  const result = await client.deleteDocuments(names);

  assert.deepEqual(result, {
    deleted: 2,
    commitTime: "2026-08-21T00:00:00.000Z",
  });
  assert.deepEqual(requestBody, {
    writes: names.map((name) => ({ delete: name })),
  });

  await assert.rejects(
    () =>
      client.deleteDocuments([
        "projects/other-project/databases/(default)/documents/adoption_application/request-1",
      ]),
    /outside this database/,
  );
});

test("conditional deletes require the scanned document version", async () => {
  let requestBody: Record<string, unknown> | undefined;
  const client = new FirestoreRestClient("test-project", {
    fetcher: mockFetch((_url, init) => {
      requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return Response.json({ commitTime: "2026-10-29T00:00:00.000Z" });
    }),
    tokenProvider: async () => "test-token",
  });
  const name = "projects/test-project/databases/(default)/documents/dogs/dog-1";
  const updateTime = "2026-09-29T00:00:00.000Z";
  const result = await client.deleteDocumentsIfUnchanged([{ name, updateTime }]);
  assert.equal(result.deleted, 1);
  assert.deepEqual(requestBody, {
    writes: [{ delete: name, currentDocument: { updateTime } }],
  });
});

test("createDocument encodes data and applies a server timestamp", async () => {
  let requestUrl = "";
  let requestBody: Record<string, unknown> | undefined;
  const fetcher = mockFetch((url, init) => {
    requestUrl = url;
    requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
    return Response.json({ commitTime: "2026-08-19T12:00:00Z" });
  });
  const client = new FirestoreRestClient("test-project", {
    fetcher,
    tokenProvider: async () => "test-token",
    documentIdGenerator: () => "application-1",
  });
  const expiresAt = new Date("2026-09-18T12:00:00Z");

  const result = await client.createDocument(
    "adoption_application",
    {
      status: "pending",
      attempts: 1,
      expiresAt,
      metadata: { accepted: true },
    },
    { serverTimestampFields: ["submittedAt"] },
  );

  assert.equal(
    requestUrl,
    "https://firestore.googleapis.com/v1/projects/test-project/databases/(default)/documents:commit",
  );
  assert.deepEqual(result, {
    id: "application-1",
    commitTime: "2026-08-19T12:00:00Z",
  });
  assert.deepEqual(requestBody, {
    writes: [
      {
        update: {
          name: "projects/test-project/databases/(default)/documents/adoption_application/application-1",
          fields: {
            status: { stringValue: "pending" },
            attempts: { integerValue: "1" },
            expiresAt: { timestampValue: "2026-09-18T12:00:00.000Z" },
            metadata: {
              mapValue: {
                fields: { accepted: { booleanValue: true } },
              },
            },
          },
        },
        currentDocument: { exists: false },
        updateTransforms: [
          { fieldPath: "submittedAt", setToServerValue: "REQUEST_TIME" },
        ],
      },
    ],
  });
});

test("createDocument uses an explicit idempotency document ID", async () => {
  let requestBody: Record<string, unknown> | undefined;
  const client = new FirestoreRestClient("test-project", {
    fetcher: mockFetch((_url, init) => {
      requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return Response.json({ commitTime: "2026-08-20T12:00:00Z" });
    }),
    tokenProvider: async () => "test-token",
    documentIdGenerator: () => "must-not-be-used",
  });
  const documentId = "123e4567-e89b-42d3-a456-426614174000";

  const result = await client.createDocument(
    "adoption_application",
    { status: "pending" },
    { documentId },
  );

  assert.equal(result.id, documentId);
  assert.deepEqual(requestBody, {
    writes: [
      {
        update: {
          name: `projects/test-project/databases/(default)/documents/adoption_application/${documentId}`,
          fields: { status: { stringValue: "pending" } },
        },
        currentDocument: { exists: false },
      },
    ],
  });
});

test("getDocument maps a not found response to null", async () => {
  const client = new FirestoreRestClient("test-project", {
    fetcher: mockFetch(() =>
      Response.json(
        { error: { message: "Document not found" } },
        { status: 404 },
      ),
    ),
    tokenProvider: async () => "test-token",
  });

  assert.equal(await client.getDocument("system/missing"), null);
});

test("listDocuments and field lookup build bounded structured queries", async () => {
  const bodies: Record<string, unknown>[] = [];
  const client = new FirestoreRestClient("test-project", {
    fetcher: mockFetch((_url, init) => {
      bodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
      return Response.json([]);
    }),
    tokenProvider: async () => "test-token",
  });

  await client.listDocuments("dogs", {
    direction: "DESCENDING",
    limit: 50,
    orderBy: "nome",
  });
  await client.findFirstDocumentByField("dogs", "id", 123);

  assert.deepEqual(bodies[0], {
    structuredQuery: {
      from: [{ collectionId: "dogs" }],
      orderBy: [
        { field: { fieldPath: "nome" }, direction: "DESCENDING" },
        { field: { fieldPath: "__name__" }, direction: "DESCENDING" },
      ],
      limit: 50,
    },
  });
  assert.deepEqual(bodies[1], {
    structuredQuery: {
      from: [{ collectionId: "dogs" }],
      where: {
        fieldFilter: {
          field: { fieldPath: "id" },
          op: "EQUAL",
          value: { integerValue: "123" },
        },
      },
      limit: 1,
    },
  });
});

test("listDocuments paginates beyond Firestore's per-query limit", async () => {
  const bodies: Record<string, unknown>[] = [];
  const firstPage = Array.from({ length: 500 }, (_, index) => ({
    document: {
      name: `projects/test-project/databases/(default)/documents/dogs/dog-${index}`,
      fields: { nome: { stringValue: `Dog ${index}` } },
    },
  }));
  const client = new FirestoreRestClient("test-project", {
    fetcher: mockFetch((_url, init) => {
      bodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
      return Response.json(
        bodies.length === 1
          ? firstPage
          : [{
              document: {
                name: "projects/test-project/databases/(default)/documents/dogs/dog-500",
                fields: { nome: { stringValue: "Dog 500" } },
              },
            }],
      );
    }),
    tokenProvider: async () => "test-token",
  });

  const documents = await client.listDocuments<{ nome: string }>("dogs", {
    orderBy: "nome",
  });

  assert.equal(documents.length, 501);
  assert.equal(bodies.length, 2);
  assert.deepEqual(bodies[1], {
    structuredQuery: {
      from: [{ collectionId: "dogs" }],
      orderBy: [
        { field: { fieldPath: "nome" }, direction: "ASCENDING" },
        { field: { fieldPath: "__name__" }, direction: "ASCENDING" },
      ],
      limit: 500,
      startAt: {
        values: [
          { stringValue: "Dog 499" },
          {
            referenceValue:
              "projects/test-project/databases/(default)/documents/dogs/dog-499",
          },
        ],
        before: false,
      },
    },
  });
});

test("countDocuments uses a Firestore aggregation query", async () => {
  let requestUrl = "";
  let requestBody: Record<string, unknown> | undefined;
  const client = new FirestoreRestClient("test-project", {
    fetcher: mockFetch((url, init) => {
      requestUrl = url;
      requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return Response.json([{
        result: {
          aggregateFields: { count: { integerValue: "1203" } },
        },
      }]);
    }),
    tokenProvider: async () => "test-token",
  });

  assert.equal(await client.countDocuments("dogs"), 1203);
  assert.equal(
    requestUrl,
    "https://firestore.googleapis.com/v1/projects/test-project/databases/(default)/documents:runAggregationQuery",
  );
  assert.deepEqual(requestBody, {
    structuredAggregationQuery: {
      aggregations: [{ alias: "count", count: {} }],
      structuredQuery: { from: [{ collectionId: "dogs" }] },
    },
  });
});

test("findDocumentsByTimestampRange restricts dashboard expiration reads", async () => {
  let requestBody: Record<string, unknown> | undefined;
  const client = new FirestoreRestClient("test-project", {
    fetcher: mockFetch((_url, init) => {
      requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return Response.json([]);
    }),
    tokenProvider: async () => "test-token",
  });
  const start = new Date("2026-08-25T12:00:00.000Z");
  const end = new Date("2026-08-30T12:00:00.000Z");

  await client.findDocumentsByTimestampRange(
    "adoption_application",
    "expiresAt",
    start,
    end,
  );

  assert.deepEqual(requestBody, {
    structuredQuery: {
      from: [{ collectionId: "adoption_application" }],
      where: {
        compositeFilter: {
          op: "AND",
          filters: [
            {
              fieldFilter: {
                field: { fieldPath: "expiresAt" },
                op: "GREATER_THAN_OR_EQUAL",
                value: { timestampValue: start.toISOString() },
              },
            },
            {
              fieldFilter: {
                field: { fieldPath: "expiresAt" },
                op: "LESS_THAN_OR_EQUAL",
                value: { timestampValue: end.toISOString() },
              },
            },
          ],
        },
      },
      orderBy: [
        { field: { fieldPath: "expiresAt" }, direction: "ASCENDING" },
        { field: { fieldPath: "__name__" }, direction: "ASCENDING" },
      ],
      limit: 500,
    },
  });
});

test("deleteDocumentAndIncrementField commits both changes atomically", async () => {
  const requests: Array<{ url: string; body?: Record<string, unknown> }> = [];
  const dogName =
    "projects/test-project/databases/(default)/documents/dogs/dog-1";
  const statisticsName =
    "projects/test-project/databases/(default)/documents/system/statistics";
  const client = new FirestoreRestClient("test-project", {
    fetcher: mockFetch((url, init) => {
      requests.push({
        url,
        body: init?.body
          ? JSON.parse(String(init.body)) as Record<string, unknown>
          : undefined,
      });
      if (url.endsWith("/documents/system/statistics")) {
        return Response.json({
          name: statisticsName,
          fields: { adoptionsCount: { integerValue: "7" } },
        });
      }
      return Response.json({ commitTime: "2026-08-25T12:00:00.000Z" });
    }),
    tokenProvider: async () => "test-token",
  });

  const result = await client.deleteDocumentAndIncrementField(
    dogName,
    "system/statistics",
    "adoptionsCount",
    1,
  );

  assert.deepEqual(result, {
    deleted: 1,
    commitTime: "2026-08-25T12:00:00.000Z",
  });
  assert.equal(requests.length, 2);
  assert.deepEqual(requests[1]?.body, {
    writes: [
      {
        delete: dogName,
        currentDocument: { exists: true },
      },
      {
        transform: {
          document: statisticsName,
          fieldTransforms: [{
            fieldPath: "adoptionsCount",
            increment: { integerValue: "1" },
          }],
        },
        currentDocument: { exists: true },
      },
    ],
  });
});

test("updateDocument uses an existence precondition and an update mask", async () => {
  let body: Record<string, unknown> | undefined;
  const client = new FirestoreRestClient("test-project", {
    fetcher: mockFetch((_url, init) => {
      body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return Response.json({ commitTime: "2026-08-21T00:00:00Z" });
    }),
    tokenProvider: async () => "test-token",
  });
  const name = "projects/test-project/databases/(default)/documents/dogs/dog-1";

  await client.updateDocument(name, { nome: "Wlad", tags: ["Dócil"] });

  assert.deepEqual(body, {
    writes: [{
      update: {
        name,
        fields: {
          nome: { stringValue: "Wlad" },
          tags: { arrayValue: { values: [{ stringValue: "Dócil" }] } },
        },
      },
      updateMask: { fieldPaths: ["nome", "tags"] },
      currentDocument: { exists: true },
    }],
  });
});

test("archiving and adoption count share one guarded commit with a timestamp deadline", async () => {
  const dogName = "projects/test-project/databases/(default)/documents/dogs/dog-1";
  const statisticsName = "projects/test-project/databases/(default)/documents/system/statistics";
  let commit: { writes: Array<Record<string, unknown>> } | undefined;
  const client = new FirestoreRestClient("test-project", {
    fetcher: mockFetch((url, init) => {
      if (url.endsWith("/documents/system/statistics")) {
        return Response.json({ name: statisticsName, fields: {} });
      }
      commit = JSON.parse(String(init?.body)) as { writes: Array<Record<string, unknown>> };
      return Response.json({ commitTime: "2026-09-29T10:00:00Z" });
    }),
    tokenProvider: async () => "test-token",
  });
  await client.updateDocumentAndIncrementField(
    dogName,
    { archivedAt: "2026-09-29T10:00:00.000Z", purgeAfter: new Date("2026-10-29T10:00:00.000Z") },
    "system/statistics", "adoptionsCount", 1,
    { expectedUpdateTime: "2026-09-29T09:59:00Z" },
  );
  assert.equal(commit?.writes.length, 2);
  assert.deepEqual(commit?.writes[0], {
    update: {
      name: dogName,
      fields: {
        archivedAt: { stringValue: "2026-09-29T10:00:00.000Z" },
        purgeAfter: { timestampValue: "2026-10-29T10:00:00.000Z" },
      },
    },
    updateMask: { fieldPaths: ["archivedAt", "purgeAfter"] },
    currentDocument: { updateTime: "2026-09-29T09:59:00Z" },
  });
  assert.deepEqual(commit?.writes[1], {
    transform: {
      document: statisticsName,
      fieldTransforms: [{ fieldPath: "adoptionsCount", increment: { integerValue: "1" } }],
    },
    currentDocument: { exists: true },
  });
});

test("updateDocument can guard security-sensitive writes with an update-time precondition", async () => {
  let body: Record<string, unknown> | undefined;
  const client = new FirestoreRestClient("test-project", {
    fetcher: mockFetch((_url, init) => {
      body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return Response.json({ commitTime: "2026-08-21T00:00:01Z" });
    }),
    tokenProvider: async () => "test-token",
  });
  const name = "projects/test-project/databases/(default)/documents/system/keys";

  await client.updateDocument(
    name,
    { active_key_id: "new-key" },
    { expectedUpdateTime: "2026-08-21T00:00:00Z" },
  );

  assert.deepEqual(body, {
    writes: [{
      update: {
        name,
        fields: { active_key_id: { stringValue: "new-key" } },
      },
      updateMask: { fieldPaths: ["active_key_id"] },
      currentDocument: { updateTime: "2026-08-21T00:00:00Z" },
    }],
  });
});

test("Firestore API errors retain their status and message", async () => {
  const client = new FirestoreRestClient("test-project", {
    fetcher: mockFetch(() =>
      Response.json(
        { error: { message: "Permission denied" } },
        { status: 403 },
      ),
    ),
    tokenProvider: async () => "test-token",
  });

  await assert.rejects(
    () => client.findFirstDocument("dogs"),
    (error: unknown) => {
      assert.ok(error instanceof FirestoreRestError);
      assert.equal(error.status, 403);
      assert.match(error.message, /Permission denied/);
      return true;
    },
  );
});

test("generated Firestore document IDs use the expected format", () => {
  const id = createFirestoreDocumentId();

  assert.match(id, /^[A-Za-z0-9]{20}$/);
});
