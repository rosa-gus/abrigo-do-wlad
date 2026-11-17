import { importPKCS8, SignJWT } from "jose";

export class MigrationStoreError extends Error {
  constructor(status, operation, code) {
    super(`Firestore ${operation} failed (HTTP ${status}).`);
    this.status = status;
    this.code = code;
  }
}

// Document fields stay in Firestore's wire format: int64, timestamps, references
// and nested values must survive a migration without JSON number coercion.
export function encodeMetadata(data) {
  function encode(value) {
    if (value === null) return { nullValue: null };
    if (value instanceof Date) return { timestampValue: value.toISOString() };
    if (typeof value === "string") return { stringValue: value };
    if (typeof value === "boolean") return { booleanValue: value };
    if (Number.isSafeInteger(value)) return { integerValue: String(value) };
    if (Array.isArray(value)) return { arrayValue: { values: value.map(encode) } };
    if (value && typeof value === "object") return { mapValue: { fields: encodeMetadata(value) } };
    throw new Error("Invalid migration metadata.");
  }
  return Object.fromEntries(Object.entries(data).map(([key, value]) => [key, encode(value)]));
}

export function decodeMetadata(document) {
  if (!document) return null;
  function decode(value) {
    if ("stringValue" in value) return value.stringValue;
    if ("integerValue" in value) {
      const number = Number(value.integerValue);
      if (!Number.isSafeInteger(number)) throw new Error("Invalid migration counter.");
      return number;
    }
    if ("booleanValue" in value) return value.booleanValue;
    if ("nullValue" in value) return null;
    if ("arrayValue" in value) return (value.arrayValue.values ?? []).map(decode);
    if ("mapValue" in value) return decodeMetadata({ fields: value.mapValue.fields });
    throw new Error("Invalid migration metadata value.");
  }
  return Object.fromEntries(Object.entries(document.fields ?? {}).map(([key, value]) => [key, decode(value)]));
}

export function metadataWrite(name, data, previous) {
  if (previous && !previous.updateTime) throw new Error("Migration metadata is missing its document version.");
  return {
    update: { name, fields: encodeMetadata(data) },
    currentDocument: previous ? { updateTime: previous.updateTime } : { exists: false },
  };
}

export function createMigrationStore({ project, email, privateKey, fetcher = fetch, tokenProvider, commitMetadata }) {
  if (!/^[a-z][a-z0-9-]{4,61}[a-z0-9]$/.test(project)) throw new Error("Invalid Firebase project ID.");
  if (!tokenProvider && (!email || !privateKey)) throw new Error("Missing Firebase service account credentials.");
  const root = `projects/${project}/databases/(default)/documents`;
  let accessToken;
  let tokenExpiresAt = 0;

  async function requestToken() {
    if (tokenProvider) return tokenProvider();
    if (accessToken && Date.now() < tokenExpiresAt) return accessToken;
    const key = await importPKCS8(privateKey.replace(/\\n/g, "\n"), "RS256");
    const assertion = await new SignJWT({ scope: "https://www.googleapis.com/auth/datastore" })
      .setProtectedHeader({ alg: "RS256" }).setIssuer(email)
      .setAudience("https://oauth2.googleapis.com/token")
      .setIssuedAt().setExpirationTime("1h").sign(key);
    const response = await fetcher("https://oauth2.googleapis.com/token", {
      method: "POST", signal: AbortSignal.timeout(30_000),
      body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }),
    });
    if (!response.ok) throw new Error(`Authentication failed (HTTP ${response.status}).`);
    const payload = await response.json();
    if (typeof payload.access_token !== "string" || !Number.isFinite(payload.expires_in) || payload.expires_in < 60) {
      throw new Error("Invalid authentication response.");
    }
    accessToken = payload.access_token;
    tokenExpiresAt = Date.now() + (payload.expires_in - 30) * 1000;
    return accessToken;
  }

  async function request(path, init = {}, allowMissing = false) {
    const response = await fetcher(`https://firestore.googleapis.com/v1/${path}`, {
      ...init, signal: AbortSignal.timeout(30_000),
      headers: { Authorization: `Bearer ${await requestToken()}`, "Content-Type": "application/json" },
    });
    if (allowMissing && response.status === 404) return null;
    // Do not print upstream bodies: they may include document values or credentials.
    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      const code = payload?.error?.status;
      throw new MigrationStoreError(response.status, init.method ?? "GET",
        typeof code === "string" && /^[A-Z_]+$/.test(code) ? code : undefined);
    }
    return response.json();
  }

  function assertCollection(collection) {
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(collection)) throw new Error("Invalid migration collection.");
  }

  function assertName(name) {
    const parts = name.slice(root.length + 1).split("/");
    if (!name.startsWith(`${root}/`) || parts.length !== 2
      || parts.some(part => !part || part === "." || part === "..")) {
      throw new Error("Document outside the migration database.");
    }
  }

  return {
    project, root,
    async get(path) {
      const name = `${root}/${path}`;
      assertName(name);
      return request(name.split("/").map(encodeURIComponent).join("/"), {}, true);
    },
    async page(collection, after = null, limit = 100) {
      assertCollection(collection);
      if (after) {
        assertName(after);
        if (!after.startsWith(`${root}/${collection}/`)) throw new Error("Invalid migration cursor.");
      }
      if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error("Batch size must be between 1 and 100.");
      const rows = await request(`${root}:runQuery`, {
        method: "POST", body: JSON.stringify({ structuredQuery: {
          from: [{ collectionId: collection }],
          orderBy: [{ field: { fieldPath: "__name__" }, direction: "ASCENDING" }],
          limit,
          ...(after ? { startAt: { values: [{ referenceValue: after }], before: false } } : {}),
        } }),
      });
      const documents = rows.flatMap(row => row.document ? [row.document] : []);
      for (const document of documents) {
        assertName(document.name);
        if (!document.name.startsWith(`${root}/${collection}/`) || !document.updateTime) {
          throw new Error("Invalid migration query response.");
        }
      }
      return documents;
    },
    async commit(writes) {
      if (commitMetadata) writes = [...writes, ...commitMetadata(root, writes)];
      if (!writes.length || writes.length > 102) throw new Error("Invalid migration batch.");
      for (const write of writes) assertName(write.update?.name ?? "");
      const body = JSON.stringify({ writes });
      if (Buffer.byteLength(body) > 8 * 1024 * 1024) throw new Error("Migration batch exceeds 8 MiB; lower --batch-size.");
      return request(`${root}:commit`, { method: "POST", body });
    },
  };
}
