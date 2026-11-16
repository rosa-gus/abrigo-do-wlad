import type { DocumentFieldIncrement } from "./firestore";

export function encryptionCounterIncrement(keyId: string, amount: number): DocumentFieldIncrement {
  if (!keyId || keyId.length > 128) throw new TypeError("Invalid encryption key ID.");
  return { documentPath: "system/keys", fieldPath: ["keys", keyId, "counter"], amount };
}
