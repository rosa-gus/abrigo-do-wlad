import crypto from "crypto";
import { z } from "zod";

import { encryptSystemKey } from "../../../workers/shared/api/_lib/encryption";
import { createFirestoreClient, FirestoreRestError } from "../../../workers/shared/api/_lib/firestore";
import { assertRevision } from "./revision";
import type { AccessIdentity } from "./access";

const storedKeySchema = z.object({
  id: z.string().min(1).max(128),
  key: z.string().min(1),
  version: z.string().regex(/^v\d+$/),
  createdAt: z.string().datetime(),
  author: z.string().email().optional(),
  counter: z.number().int().nonnegative().optional(),
  active: z.boolean().optional(),
});

const keyDocumentSchema = z.object({
  active_key_id: z.string().min(1).max(128),
  keys: z.record(z.string(), storedKeySchema),
});

type StoredSystemKey = z.infer<typeof storedKeySchema>;

export interface SystemKeyMetadata {
  id: string;
  version: string;
  createdAt: string;
  author: string | null;
  counter: number;
  active: boolean;
}

export interface RotatedSystemKey {
  id: string;
  version: string;
}

function toMetadata(key: StoredSystemKey, activeKeyId: string): SystemKeyMetadata {
  return {
    id: key.id,
    version: key.version,
    createdAt: key.createdAt,
    author: key.author ?? null,
    counter: key.counter ?? 0,
    active: key.id === activeKeyId,
  };
}

export async function listSystemKeys(env: Env): Promise<SystemKeyMetadata[]> {
  return (await listSystemKeysState(env)).value;
}

export async function listSystemKeysState(env: Env): Promise<{ value: SystemKeyMetadata[]; revision: string | undefined }> {
  const document = await createFirestoreClient(env).getDocument("system/keys");
  if (!document) return { value: [], revision: undefined };
  const { active_key_id: activeKeyId, keys } = keyDocumentSchema.parse(document.data);
  return { value: Object.values(keys).map((key) => toMetadata(key, activeKeyId))
    .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt)), revision: document.updateTime };
}

export async function rotateSystemKey(
  env: Env,
  identity: AccessIdentity,
  expected?: string,
): Promise<RotatedSystemKey> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await rotateSystemKeyOnce(env, identity, expected);
    } catch (error) {
      const details = error instanceof FirestoreRestError ? error.details : undefined;
      const code = typeof details === "object" && details !== null && "error" in details
        && typeof details.error === "object" && details.error !== null && "status" in details.error
        ? details.error.status : undefined;
      const conflict = error instanceof FirestoreRestError
        && ([409, 412].includes(error.status) || code === "FAILED_PRECONDITION" || code === "ABORTED");
      if (expected !== undefined || attempt >= 2 || !conflict) throw error;
    }
  }
}

async function rotateSystemKeyOnce(env: Env, identity: AccessIdentity, expected?: string): Promise<RotatedSystemKey> {
  const firestore = createFirestoreClient(env);
  const document = await firestore.getDocument("system/keys");
  if (expected !== undefined) assertRevision(expected, document?.updateTime);
  const current = document ? keyDocumentSchema.parse(document.data) : undefined;
  const nextVersionNumber = current
    ? Object.values(current.keys).reduce((highest, key) => {
        const versionNumber = Number(key.version.slice(1));
        return Math.max(highest, versionNumber);
      }, 0) + 1
    : 1;
  const id = crypto.randomUUID();
  const version = `v${nextVersionNumber}`;
  const encryptedKey = encryptSystemKey(crypto.randomBytes(32).toString("hex"), env);
  const keys = current
    ? Object.fromEntries(
        Object.entries(current.keys).map(([keyId, key]) => [
          keyId,
          { ...key, active: false },
        ]),
      )
    : {};

  keys[id] = {
    id,
    key: encryptedKey,
    version,
    createdAt: new Date().toISOString(),
    author: identity.email,
    counter: 0,
    active: true,
  };

  if (document) {
    if (!document.updateTime) throw new Error("System keys document has no revision.");
    await firestore.updateDocument(
      document.name,
      { active_key_id: id, keys },
      { expectedUpdateTime: document.updateTime },
    );
  } else {
    await firestore.createDocument(
      "system",
      { active_key_id: id, keys },
      { documentId: "keys" },
    );
  }

  console.info(JSON.stringify({
    event: "admin.system-key.rotated",
    actor: identity.email,
    keyId: id,
    version,
    initialized: !document,
  }));

  return { id, version };
}
