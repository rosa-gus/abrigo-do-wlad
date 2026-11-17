import crypto from "crypto";
import { createFirestoreClient } from "./firestore";
import { getEnvValue, type CloudflareEnv } from "./env";

interface EncryptionKeyDocument extends Record<string, unknown> {
  active_key_id: string;
  keys: Record<
    string,
    { id: string; key: string; version: string; createdAt: string }
  >;
}

export interface EncryptedDataInput {
  encryptedData: string;
  keyVersion: string;
}

function decryptSystemKey(encryptedKeyString: string, env?: CloudflareEnv): string {
  const masterKey = getEnvValue(env, "MASTER_KEY");
  if (!masterKey) {
    throw new Error("MASTER_KEY is not defined in environment variables.");
  }
  
  const parts = encryptedKeyString.split(":");
  if (parts.length !== 3) {
    throw new Error("Invalid encrypted key format. Expected iv:authTag:encrypted");
  }

  const [ivHex, authTagHex, encryptedHex] = parts;
  const iv = Buffer.from(ivHex, "hex");
  const authTag = Buffer.from(authTagHex, "hex");
  
  const masterCipherKey = crypto.createHash("sha256").update(masterKey).digest();
  const decipher = crypto.createDecipheriv("aes-256-gcm", masterCipherKey, iv);
  decipher.setAuthTag(authTag);
  
  let decryptedKey = decipher.update(encryptedHex, "hex", "utf8");
  decryptedKey += decipher.final("utf8");
  
  return decryptedKey;
}

export function encryptSystemKey(
  plainKey: string,
  env?: CloudflareEnv,
): string {
  const masterKey = getEnvValue(env, "MASTER_KEY");
  if (!masterKey) {
    throw new Error("MASTER_KEY is not defined in environment variables.");
  }
  if (!plainKey) {
    throw new TypeError("System encryption key cannot be empty.");
  }

  const iv = crypto.randomBytes(16);
  const masterCipherKey = crypto.createHash("sha256").update(masterKey).digest();
  const cipher = crypto.createCipheriv("aes-256-gcm", masterCipherKey, iv);
  let encryptedKey = cipher.update(plainKey, "utf8", "hex");
  encryptedKey += cipher.final("hex");

  return `${iv.toString("hex")}:${cipher.getAuthTag().toString("hex")}:${encryptedKey}`;
}

async function loadEncryptionKeys(
  env?: CloudflareEnv,
): Promise<EncryptionKeyDocument> {
  const keyDocument = await createFirestoreClient(env).getDocument<EncryptionKeyDocument>(
    "system/keys",
  );

  if (!keyDocument) {
    throw new Error("Chaves de criptografia não encontradas no banco de dados.");
  }

  return keyDocument.data;
}

function decryptPayload(encryptedData: string, plainKey: string): Record<string, unknown> {
  const parts = encryptedData.split(":");
  if (parts.length !== 3) {
    throw new Error("Invalid encrypted data format. Expected iv:authTag:encrypted");
  }

  const [ivHex, authTagHex, encryptedHex] = parts;
  const cipherKey = crypto.createHash("sha256").update(plainKey).digest();
  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    cipherKey,
    Buffer.from(ivHex, "hex"),
  );
  decipher.setAuthTag(Buffer.from(authTagHex, "hex"));

  let plaintext = decipher.update(encryptedHex, "hex", "utf8");
  plaintext += decipher.final("utf8");
  const parsed = JSON.parse(plaintext) as unknown;

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("Decrypted adoption data is not an object.");
  }

  return parsed as Record<string, unknown>;
}

export async function decryptDataBatch(
  inputs: EncryptedDataInput[],
  env?: CloudflareEnv,
): Promise<Record<string, unknown>[]> {
  if (inputs.length === 0) return [];

  const keyDocument = await loadEncryptionKeys(env);
  const plainKeys = new Map<string, string>();

  return inputs.map(({ encryptedData, keyVersion }) => {
    let plainKey = plainKeys.get(keyVersion);
    if (!plainKey) {
      const encryptedKey = keyDocument.keys[keyVersion]?.key;
      if (!encryptedKey) {
        throw new Error(`Chave de criptografia ${keyVersion} não encontrada.`);
      }
      plainKey = decryptSystemKey(encryptedKey, env);
      plainKeys.set(keyVersion, plainKey);
    }

    return decryptPayload(encryptedData, plainKey);
  });
}

export async function encryptData(
  data: Record<string, unknown>,
  env?: CloudflareEnv,
): Promise<{ encryptedData: string; keyVersion: string }> {
  const { active_key_id, keys } = await loadEncryptionKeys(env);
  
  const encryptedCurrentKey = keys[active_key_id]?.key;

  if (!encryptedCurrentKey) {
    throw new Error("Chave de criptografia ativa inválida ou não encontrada.");
  }

  const currentKey = decryptSystemKey(encryptedCurrentKey, env);

  const algorithm = "aes-256-gcm";
  const iv = crypto.randomBytes(16);
  // (32 bytes/aes-256)
  const cipherKey = crypto
    .createHash("sha256")
    .update(String(currentKey))
    .digest();
  const cipher = crypto.createCipheriv(algorithm, cipherKey, iv);

  let encrypted = cipher.update(JSON.stringify(data), "utf8", "hex");
  encrypted += cipher.final("hex");
  const authTag = cipher.getAuthTag().toString("hex");

  const encryptedData = `${iv.toString("hex")}:${authTag}:${encrypted}`;

  return { encryptedData, keyVersion: active_key_id };
}
