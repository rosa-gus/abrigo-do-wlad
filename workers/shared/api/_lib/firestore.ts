import { importPKCS8, SignJWT } from "jose";

import {
  getEnvValue,
  type CloudflareEnv,
  type CloudflareStringEnvKey,
} from "./env";

const FIRESTORE_SCOPE = "https://www.googleapis.com/auth/datastore";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const TOKEN_EXPIRATION_SECONDS = 3600;
const TOKEN_REFRESH_MARGIN_MS = 60_000;
const AUTO_ID_CHARACTERS =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
const AUTO_ID_LENGTH = 20;
const MAX_COMMIT_WRITES = 500;
const MAX_QUERY_LIMIT = 500;

type FirestoreValue =
  | { nullValue: null }
  | { booleanValue: boolean }
  | { integerValue: string }
  | { doubleValue: number | string }
  | { timestampValue: string }
  | { stringValue: string }
  | { bytesValue: string }
  | { referenceValue: string }
  | { geoPointValue: { latitude: number; longitude: number } }
  | { arrayValue: { values?: FirestoreValue[] } }
  | { mapValue: { fields?: Record<string, FirestoreValue> } };

interface FirestoreApiDocument {
  name: string;
  fields?: Record<string, FirestoreValue>;
  createTime?: string;
  updateTime?: string;
}

interface RunQueryResult {
  document?: FirestoreApiDocument;
}

interface RunAggregationQueryResult {
  result?: {
    aggregateFields?: Record<string, FirestoreValue>;
  };
}

interface GoogleTokenResponse {
  access_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
}

interface CachedAccessToken {
  cacheKey: string;
  token: string;
  expiresAt: number;
}

export interface FirestoreDocument<T extends Record<string, unknown>> {
  id: string;
  name: string;
  data: T;
  createTime?: string;
  updateTime?: string;
}

export interface CreateDocumentOptions {
  serverTimestampFields?: string[];
  documentId?: string;
}

export interface DeleteDocumentsResult {
  commitTime?: string;
  deleted: number;
}

export interface DeleteDocumentAndIncrementResult {
  commitTime?: string;
  deleted: 1;
}

export interface UpdateDocumentOptions {
  serverTimestampFields?: string[];
  expectedUpdateTime?: string;
}

export interface FirestoreRestClientOptions {
  fetcher?: typeof fetch;
  tokenProvider?: () => Promise<string>;
  documentIdGenerator?: () => string;
}

let cachedAccessToken: CachedAccessToken | undefined;

function requireEnvValue(
  env: CloudflareEnv | undefined,
  key: CloudflareStringEnvKey,
): string {
  const value = getEnvValue(env, key)?.trim();

  if (!value) {
    throw new Error(`${key} is not defined in environment variables.`);
  }

  return value;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary);
}

function decodeDouble(value: number | string): number {
  if (typeof value === "number") {
    return value;
  }

  if (value === "NaN") {
    return Number.NaN;
  }

  if (value === "Infinity") {
    return Number.POSITIVE_INFINITY;
  }

  if (value === "-Infinity") {
    return Number.NEGATIVE_INFINITY;
  }

  return Number(value);
}

export function encodeFirestoreValue(value: unknown): FirestoreValue {
  if (value === null) {
    return { nullValue: null };
  }

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) {
      throw new TypeError(
        "Cannot encode an invalid Date as a Firestore value.",
      );
    }

    return { timestampValue: value.toISOString() };
  }

  if (value instanceof Uint8Array) {
    return { bytesValue: bytesToBase64(value) };
  }

  switch (typeof value) {
    case "boolean":
      return { booleanValue: value };
    case "string":
      return { stringValue: value };
    case "bigint":
      return { integerValue: value.toString() };
    case "number":
      if (Number.isInteger(value) && Number.isFinite(value)) {
        return { integerValue: value.toString() };
      }

      if (Number.isNaN(value)) {
        return { doubleValue: "NaN" };
      }

      if (value === Number.POSITIVE_INFINITY) {
        return { doubleValue: "Infinity" };
      }

      if (value === Number.NEGATIVE_INFINITY) {
        return { doubleValue: "-Infinity" };
      }

      return { doubleValue: value };
    case "object": {
      if (Array.isArray(value)) {
        return {
          arrayValue: {
            values: value.map((item) => encodeFirestoreValue(item)),
          },
        };
      }

      const prototype = Object.getPrototypeOf(value);
      if (prototype !== Object.prototype && prototype !== null) {
        throw new TypeError(
          "Only plain objects can be encoded as Firestore maps.",
        );
      }

      const fields = Object.fromEntries(
        Object.entries(value)
          .filter(([, fieldValue]) => fieldValue !== undefined)
          .map(([fieldName, fieldValue]) => [
            fieldName,
            encodeFirestoreValue(fieldValue),
          ]),
      );

      return { mapValue: { fields } };
    }
    default:
      throw new TypeError(`Unsupported Firestore value type: ${typeof value}`);
  }
}

export function decodeFirestoreValue(value: FirestoreValue): unknown {
  if ("nullValue" in value) {
    return null;
  }

  if ("booleanValue" in value) {
    return value.booleanValue;
  }

  if ("integerValue" in value) {
    const integer = Number(value.integerValue);
    return Number.isSafeInteger(integer) ? integer : value.integerValue;
  }

  if ("doubleValue" in value) {
    return decodeDouble(value.doubleValue);
  }

  if ("timestampValue" in value) {
    return value.timestampValue;
  }

  if ("stringValue" in value) {
    return value.stringValue;
  }

  if ("bytesValue" in value) {
    return value.bytesValue;
  }

  if ("referenceValue" in value) {
    return value.referenceValue;
  }

  if ("geoPointValue" in value) {
    return value.geoPointValue;
  }

  if ("arrayValue" in value) {
    return (value.arrayValue.values ?? []).map(decodeFirestoreValue);
  }

  return Object.fromEntries(
    Object.entries(value.mapValue.fields ?? {}).map(
      ([fieldName, fieldValue]) => [
        fieldName,
        decodeFirestoreValue(fieldValue),
      ],
    ),
  );
}

function encodeDocumentFields(
  data: Record<string, unknown>,
): Record<string, FirestoreValue> {
  return Object.fromEntries(
    Object.entries(data)
      .filter(([, value]) => value !== undefined)
      .map(([fieldName, value]) => [fieldName, encodeFirestoreValue(value)]),
  );
}

function decodeDocument<T extends Record<string, unknown>>(
  document: FirestoreApiDocument,
): FirestoreDocument<T> {
  const id = document.name.split("/").at(-1);

  if (!id) {
    throw new Error(
      `Firestore returned an invalid document name: ${document.name}`,
    );
  }

  return {
    id,
    name: document.name,
    data: Object.fromEntries(
      Object.entries(document.fields ?? {}).map(([fieldName, value]) => [
        fieldName,
        decodeFirestoreValue(value),
      ]),
    ) as T,
    createTime: document.createTime,
    updateTime: document.updateTime,
  };
}

function assertCollectionId(collectionId: string): void {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(collectionId)) {
    throw new TypeError("Firestore collection ID contains invalid characters.");
  }
}

function assertFieldPath(fieldPath: string): void {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(fieldPath)) {
    throw new TypeError("Firestore field path contains invalid characters.");
  }
}

function assertDocumentName(documentName: string, documentsRoot: string): void {
  if (
    !documentName.startsWith(`${documentsRoot}/`) ||
    documentName.includes("//") ||
    documentName.split("/").length < documentsRoot.split("/").length + 2
  ) {
    throw new TypeError("Firestore document target is outside this database.");
  }
}

export function createFirestoreDocumentId(): string {
  const id: string[] = [];
  const maxValidByte =
    Math.floor(256 / AUTO_ID_CHARACTERS.length) * AUTO_ID_CHARACTERS.length;

  while (id.length < AUTO_ID_LENGTH) {
    const randomBytes = crypto.getRandomValues(new Uint8Array(AUTO_ID_LENGTH));

    for (const randomByte of randomBytes) {
      if (randomByte < maxValidByte) {
        id.push(AUTO_ID_CHARACTERS[randomByte % AUTO_ID_CHARACTERS.length]);
      }

      if (id.length === AUTO_ID_LENGTH) {
        break;
      }
    }
  }

  return id.join("");
}

async function requestGoogleAccessToken(
  env: CloudflareEnv | undefined,
  fetcher: typeof fetch,
): Promise<string> {
  const clientEmail = requireEnvValue(env, "FIREBASE_CLIENT_EMAIL");
  const privateKey = requireEnvValue(env, "FIREBASE_PRIVATE_KEY").replace(
    /\\n/g,
    "\n",
  );
  const cacheKey = `${requireEnvValue(env, "FIREBASE_PROJECT_ID")}:${clientEmail}`;
  const now = Date.now();

  if (
    cachedAccessToken?.cacheKey === cacheKey &&
    cachedAccessToken.expiresAt - TOKEN_REFRESH_MARGIN_MS > now
  ) {
    return cachedAccessToken.token;
  }

  const issuedAt = Math.floor(now / 1000);
  const signingKey = await importPKCS8(privateKey, "RS256");
  const assertion = await new SignJWT({ scope: FIRESTORE_SCOPE })
    .setProtectedHeader({ alg: "RS256", typ: "JWT" })
    .setIssuer(clientEmail)
    .setAudience(GOOGLE_TOKEN_URL)
    .setIssuedAt(issuedAt)
    .setExpirationTime(issuedAt + TOKEN_EXPIRATION_SECONDS)
    .sign(signingKey);

  const response = await fetcher(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  const payload = (await response.json()) as GoogleTokenResponse;

  if (!response.ok || !payload.access_token) {
    const reason =
      payload.error_description ?? payload.error ?? `HTTP ${response.status}`;
    throw new Error(
      `Unable to authenticate the Firestore service account: ${reason}`,
    );
  }

  const expiresIn = payload.expires_in ?? TOKEN_EXPIRATION_SECONDS;
  cachedAccessToken = {
    cacheKey,
    token: payload.access_token,
    expiresAt: now + expiresIn * 1000,
  };

  return payload.access_token;
}

export class FirestoreRestError extends Error {
  readonly status: number;
  readonly details?: unknown;

  constructor(message: string, status: number, details?: unknown) {
    super(message);
    this.name = "FirestoreRestError";
    this.status = status;
    this.details = details;
  }
}

export class FirestoreRestClient {
  private readonly databaseRoot: string;
  private readonly documentsRoot: string;
  private readonly fetcher: typeof fetch;
  private readonly tokenProvider: () => Promise<string>;
  private readonly documentIdGenerator: () => string;

  constructor(
    projectId: string,
    options: FirestoreRestClientOptions = {},
    env?: CloudflareEnv,
  ) {
    this.databaseRoot = `projects/${projectId}/databases/(default)`;
    this.documentsRoot = `${this.databaseRoot}/documents`;
    const fetcher = options.fetcher ?? fetch;
    this.fetcher = (input, init) => fetcher(input, init);
    this.tokenProvider =
      options.tokenProvider ??
      (() => requestGoogleAccessToken(env, this.fetcher));
    this.documentIdGenerator =
      options.documentIdGenerator ?? createFirestoreDocumentId;
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const token = await this.tokenProvider();
    const response = await this.fetcher(
      `https://firestore.googleapis.com/v1/${path}`,
      {
        ...init,
        headers: {
          Authorization: `Bearer ${token}`,
          ...(init.body ? { "Content-Type": "application/json" } : {}),
          ...init.headers,
        },
      },
    );

    if (!response.ok) {
      const rawDetails = await response.text();
      let details: unknown = rawDetails;

      try {
        details = JSON.parse(rawDetails) as unknown;
      } catch {
        // The API occasionally returns a plain-text error response.
      }

      const apiMessage =
        typeof details === "object" &&
        details !== null &&
        "error" in details &&
        typeof details.error === "object" &&
        details.error !== null &&
        "message" in details.error &&
        typeof details.error.message === "string"
          ? details.error.message
          : response.statusText;

      throw new FirestoreRestError(
        `Firestore request failed (${response.status}): ${apiMessage}`,
        response.status,
        details,
      );
    }

    return (await response.json()) as T;
  }

  private async runPaginatedQuery<T extends Record<string, unknown>>(
    structuredQuery: Record<string, unknown>,
    cursorFieldPaths: string[],
    totalLimit?: number,
  ): Promise<FirestoreDocument<T>[]> {
    if (
      totalLimit !== undefined &&
      (!Number.isInteger(totalLimit) || totalLimit < 1)
    ) {
      throw new RangeError("Firestore query limit must be a positive integer.");
    }

    const documents: FirestoreDocument<T>[] = [];
    let cursorValues: FirestoreValue[] | undefined;

    while (totalLimit === undefined || documents.length < totalLimit) {
      const remaining =
        totalLimit === undefined
          ? MAX_QUERY_LIMIT
          : Math.min(MAX_QUERY_LIMIT, totalLimit - documents.length);
      const results = await this.request<RunQueryResult[]>(
        `${this.documentsRoot}:runQuery`,
        {
          method: "POST",
          body: JSON.stringify({
            structuredQuery: {
              ...structuredQuery,
              limit: remaining,
              ...(cursorValues
                ? { startAt: { values: cursorValues, before: false } }
                : {}),
            },
          }),
        },
      );
      const page = results.flatMap((result) =>
        result.document ? [result.document] : [],
      );

      documents.push(...page.map((document) => decodeDocument<T>(document)));
      if (page.length < remaining) break;

      const lastDocument = page.at(-1);
      if (!lastDocument) break;
      cursorValues = cursorFieldPaths.map((fieldPath) => {
        if (fieldPath === "__name__") {
          return { referenceValue: lastDocument.name };
        }

        const value = lastDocument.fields?.[fieldPath];
        if (!value) {
          throw new Error(
            `Firestore query result is missing cursor field ${fieldPath}.`,
          );
        }
        return value;
      });
    }

    return documents;
  }

  async getDocument<T extends Record<string, unknown>>(
    documentPath: string,
  ): Promise<FirestoreDocument<T> | null> {
    const encodedPath = documentPath
      .split("/")
      .map((segment) => encodeURIComponent(segment))
      .join("/");

    try {
      const document = await this.request<FirestoreApiDocument>(
        `${this.documentsRoot}/${encodedPath}`,
      );
      return decodeDocument<T>(document);
    } catch (error) {
      if (error instanceof FirestoreRestError && error.status === 404) {
        return null;
      }

      throw error;
    }
  }

  async findFirstDocument<T extends Record<string, unknown>>(
    collectionId: string,
    startingDocumentId?: string,
  ): Promise<FirestoreDocument<T> | null> {
    assertCollectionId(collectionId);

    const structuredQuery: Record<string, unknown> = {
      from: [{ collectionId }],
      orderBy: [
        {
          field: { fieldPath: "__name__" },
          direction: "ASCENDING",
        },
      ],
      limit: 1,
    };

    if (startingDocumentId) {
      structuredQuery.where = {
        fieldFilter: {
          field: { fieldPath: "__name__" },
          op: "GREATER_THAN_OR_EQUAL",
          value: {
            referenceValue: `${this.documentsRoot}/${collectionId}/${startingDocumentId}`,
          },
        },
      };
    }

    const results = await this.request<RunQueryResult[]>(
      `${this.documentsRoot}:runQuery`,
      {
        method: "POST",
        body: JSON.stringify({ structuredQuery }),
      },
    );
    const document = results.find((result) => result.document)?.document;

    return document ? decodeDocument<T>(document) : null;
  }

  async listDocuments<T extends Record<string, unknown>>(
    collectionId: string,
    options: {
      direction?: "ASCENDING" | "DESCENDING";
      limit?: number;
      orderBy?: string;
    } = {},
  ): Promise<FirestoreDocument<T>[]> {
    assertCollectionId(collectionId);
    const limit = options.limit;
    const orderBy = options.orderBy ?? "__name__";
    assertFieldPath(orderBy);

    if (limit !== undefined && (!Number.isInteger(limit) || limit < 1)) {
      throw new RangeError("Firestore query limit must be a positive integer.");
    }

    const direction = options.direction ?? "ASCENDING";
    const cursorFieldPaths =
      orderBy === "__name__" ? ["__name__"] : [orderBy, "__name__"];
    return this.runPaginatedQuery<T>(
      {
        from: [{ collectionId }],
        orderBy: cursorFieldPaths.map((fieldPath) => ({
          field: { fieldPath },
          direction,
        })),
      },
      cursorFieldPaths,
      limit,
    );
  }

  async countDocuments(collectionId: string): Promise<number> {
    assertCollectionId(collectionId);
    const results = await this.request<RunAggregationQueryResult[]>(
      `${this.documentsRoot}:runAggregationQuery`,
      {
        method: "POST",
        body: JSON.stringify({
          structuredAggregationQuery: {
            aggregations: [{ alias: "count", count: {} }],
            structuredQuery: { from: [{ collectionId }] },
          },
        }),
      },
    );
    const encodedCount = results.find(
      (result) => result.result?.aggregateFields?.count,
    )?.result?.aggregateFields?.count;
    const count = encodedCount ? decodeFirestoreValue(encodedCount) : undefined;

    if (
      typeof count !== "number" ||
      !Number.isSafeInteger(count) ||
      count < 0
    ) {
      throw new Error("Firestore returned an invalid document count.");
    }
    return count;
  }

  async findDocumentsByTimestampRange<T extends Record<string, unknown>>(
    collectionId: string,
    fieldPath: string,
    start: Date,
    end: Date,
  ): Promise<FirestoreDocument<T>[]> {
    assertCollectionId(collectionId);
    assertFieldPath(fieldPath);
    if (
      Number.isNaN(start.getTime()) ||
      Number.isNaN(end.getTime()) ||
      start.getTime() > end.getTime()
    ) {
      throw new TypeError("Firestore timestamp range is invalid.");
    }

    return this.runPaginatedQuery<T>(
      {
        from: [{ collectionId }],
        where: {
          compositeFilter: {
            op: "AND",
            filters: [
              {
                fieldFilter: {
                  field: { fieldPath },
                  op: "GREATER_THAN_OR_EQUAL",
                  value: encodeFirestoreValue(start),
                },
              },
              {
                fieldFilter: {
                  field: { fieldPath },
                  op: "LESS_THAN_OR_EQUAL",
                  value: encodeFirestoreValue(end),
                },
              },
            ],
          },
        },
        orderBy: [
          { field: { fieldPath }, direction: "ASCENDING" },
          { field: { fieldPath: "__name__" }, direction: "ASCENDING" },
        ],
      },
      [fieldPath, "__name__"],
    );
  }

  async findFirstDocumentByField<T extends Record<string, unknown>>(
    collectionId: string,
    fieldPath: string,
    value: unknown,
  ): Promise<FirestoreDocument<T> | null> {
    assertCollectionId(collectionId);
    assertFieldPath(fieldPath);

    const results = await this.request<RunQueryResult[]>(
      `${this.documentsRoot}:runQuery`,
      {
        method: "POST",
        body: JSON.stringify({
          structuredQuery: {
            from: [{ collectionId }],
            where: {
              fieldFilter: {
                field: { fieldPath },
                op: "EQUAL",
                value: encodeFirestoreValue(value),
              },
            },
            limit: 1,
          },
        }),
      },
    );
    const document = results.find((result) => result.document)?.document;

    return document ? decodeDocument<T>(document) : null;
  }

  async findDocumentsByTimestampBefore<T extends Record<string, unknown>>(
    collectionId: string,
    fieldPath: string,
    cutoff: Date,
    limit: number,
  ): Promise<FirestoreDocument<T>[]> {
    assertCollectionId(collectionId);
    assertFieldPath(fieldPath);

    if (Number.isNaN(cutoff.getTime())) {
      throw new TypeError("Firestore query cutoff must be a valid Date.");
    }

    if (!Number.isInteger(limit) || limit < 1 || limit > MAX_QUERY_LIMIT) {
      throw new RangeError(
        `Firestore query limit must be between 1 and ${MAX_QUERY_LIMIT}.`,
      );
    }

    const results = await this.request<RunQueryResult[]>(
      `${this.documentsRoot}:runQuery`,
      {
        method: "POST",
        body: JSON.stringify({
          structuredQuery: {
            from: [{ collectionId }],
            where: {
              fieldFilter: {
                field: { fieldPath },
                op: "LESS_THAN_OR_EQUAL",
                value: encodeFirestoreValue(cutoff),
              },
            },
            orderBy: [
              {
                field: { fieldPath },
                direction: "ASCENDING",
              },
              {
                field: { fieldPath: "__name__" },
                direction: "ASCENDING",
              },
            ],
            limit,
          },
        }),
      },
    );

    return results.flatMap((result) =>
      result.document ? [decodeDocument<T>(result.document)] : [],
    );
  }

  async deleteDocuments(
    documentNames: string[],
  ): Promise<DeleteDocumentsResult> {
    if (documentNames.length === 0) {
      return { deleted: 0 };
    }

    if (documentNames.length > MAX_COMMIT_WRITES) {
      throw new RangeError(
        `Firestore commit cannot contain more than ${MAX_COMMIT_WRITES} deletes.`,
      );
    }

    const uniqueNames = new Set(documentNames);
    if (uniqueNames.size !== documentNames.length) {
      throw new TypeError(
        "Firestore delete list contains duplicate documents.",
      );
    }

    for (const name of documentNames) {
      assertDocumentName(name, this.documentsRoot);
    }

    const result = await this.request<{ commitTime?: string }>(
      `${this.databaseRoot}/documents:commit`,
      {
        method: "POST",
        body: JSON.stringify({
          writes: documentNames.map((name) => ({ delete: name })),
        }),
      },
    );

    return { deleted: documentNames.length, commitTime: result.commitTime };
  }

  async deleteDocument(documentName: string): Promise<DeleteDocumentsResult> {
    return this.deleteDocuments([documentName]);
  }

  async deleteDocumentAndIncrementField(
    documentName: string,
    counterDocumentPath: string,
    fieldPath: string,
    amount: number,
  ): Promise<DeleteDocumentAndIncrementResult> {
    assertDocumentName(documentName, this.documentsRoot);
    assertFieldPath(fieldPath);
    if (!Number.isFinite(amount)) {
      throw new TypeError("Firestore increment amount must be finite.");
    }

    const [collectionId, documentId, ...rest] = counterDocumentPath.split("/");
    if (!collectionId || !documentId || rest.length > 0) {
      throw new TypeError(
        "Firestore counter path must target a root document.",
      );
    }
    const existingCounter =
      await this.getDocument<Record<string, unknown>>(counterDocumentPath);
    const counterName = `${this.documentsRoot}/${collectionId}/${documentId}`;
    if (counterName === documentName) {
      throw new TypeError(
        "Firestore counter and deleted document must differ.",
      );
    }
    const counterWrite = existingCounter
      ? {
          transform: {
            document: existingCounter.name,
            fieldTransforms: [
              {
                fieldPath,
                increment: encodeFirestoreValue(amount),
              },
            ],
          },
          currentDocument: { exists: true },
        }
      : {
          update: {
            name: counterName,
            fields: { [fieldPath]: encodeFirestoreValue(amount) },
          },
          currentDocument: { exists: false },
        };
    const result = await this.request<{ commitTime?: string }>(
      `${this.databaseRoot}/documents:commit`,
      {
        method: "POST",
        body: JSON.stringify({
          writes: [
            {
              delete: documentName,
              currentDocument: { exists: true },
            },
            counterWrite,
          ],
        }),
      },
    );

    return { deleted: 1, commitTime: result.commitTime };
  }

  async updateDocument(
    documentName: string,
    data: Record<string, unknown>,
    options: UpdateDocumentOptions = {},
  ): Promise<{ commitTime?: string }> {
    assertDocumentName(documentName, this.documentsRoot);
    const fieldPaths = Object.keys(data);

    if (fieldPaths.length === 0) {
      throw new TypeError("Firestore update must contain at least one field.");
    }

    fieldPaths.forEach(assertFieldPath);
    const updateTransforms = (options.serverTimestampFields ?? []).map(
      (fieldPath) => {
        assertFieldPath(fieldPath);
        return { fieldPath, setToServerValue: "REQUEST_TIME" };
      },
    );
    const write = {
      update: {
        name: documentName,
        fields: encodeDocumentFields(data),
      },
      updateMask: { fieldPaths },
      currentDocument: options.expectedUpdateTime
        ? { updateTime: options.expectedUpdateTime }
        : { exists: true },
      ...(updateTransforms.length > 0 ? { updateTransforms } : {}),
    };

    return this.request<{ commitTime?: string }>(
      `${this.databaseRoot}/documents:commit`,
      {
        method: "POST",
        body: JSON.stringify({ writes: [write] }),
      },
    );
  }

  async incrementDocumentField(
    documentPath: string,
    fieldPath: string,
    amount: number,
  ): Promise<{ commitTime?: string }> {
    assertFieldPath(fieldPath);
    if (!Number.isFinite(amount)) {
      throw new TypeError("Firestore increment amount must be finite.");
    }

    const existing =
      await this.getDocument<Record<string, unknown>>(documentPath);
    if (!existing) {
      const [collectionId, documentId, ...rest] = documentPath.split("/");
      if (!collectionId || !documentId || rest.length > 0) {
        throw new TypeError(
          "Firestore counter path must target a root document.",
        );
      }

      return this.request<{ commitTime?: string }>(
        `${this.databaseRoot}/documents:commit`,
        {
          method: "POST",
          body: JSON.stringify({
            writes: [
              {
                update: {
                  name: `${this.documentsRoot}/${collectionId}/${documentId}`,
                  fields: { [fieldPath]: encodeFirestoreValue(amount) },
                },
                currentDocument: { exists: false },
              },
            ],
          }),
        },
      );
    }

    return this.request<{ commitTime?: string }>(
      `${this.databaseRoot}/documents:commit`,
      {
        method: "POST",
        body: JSON.stringify({
          writes: [
            {
              transform: {
                document: existing.name,
                fieldTransforms: [
                  {
                    fieldPath,
                    increment: encodeFirestoreValue(amount),
                  },
                ],
              },
              currentDocument: { exists: true },
            },
          ],
        }),
      },
    );
  }

  async createDocument(
    collectionId: string,
    data: Record<string, unknown>,
    options: CreateDocumentOptions = {},
  ): Promise<{ id: string; commitTime?: string }> {
    assertCollectionId(collectionId);

    const id = options.documentId ?? this.documentIdGenerator();

    if (!/^[A-Za-z0-9_-]{1,128}$/.test(id)) {
      throw new TypeError("Firestore document ID contains invalid characters.");
    }

    const name = `${this.documentsRoot}/${collectionId}/${id}`;
    const updateTransforms = (options.serverTimestampFields ?? []).map(
      (fieldPath) => ({
        fieldPath,
        setToServerValue: "REQUEST_TIME",
      }),
    );
    const write = {
      update: {
        name,
        fields: encodeDocumentFields(data),
      },
      currentDocument: { exists: false },
      ...(updateTransforms.length > 0 ? { updateTransforms } : {}),
    };
    const result = await this.request<{ commitTime?: string }>(
      `${this.databaseRoot}/documents:commit`,
      {
        method: "POST",
        body: JSON.stringify({ writes: [write] }),
      },
    );

    return { id, commitTime: result.commitTime };
  }
}

export function createFirestoreClient(
  env?: CloudflareEnv,
  options: FirestoreRestClientOptions = {},
): FirestoreRestClient {
  return new FirestoreRestClient(
    requireEnvValue(env, "FIREBASE_PROJECT_ID"),
    options,
    env,
  );
}
