import type { VersionedDocument as FirestoreDocument } from "../ports/documents";
import { z } from "zod";

type AdoptionDocument = FirestoreDocument<Record<string, unknown>>;
const expirationSchema = z.iso.datetime({ offset: true });

export class AdoptionUnavailableError extends Error {
  constructor() {
    super("Adoption application not found.");
    this.name = "AdoptionUnavailableError";
  }
}

function requireValidClock(now: Date): number {
  const timestamp = now.getTime();
  if (!Number.isFinite(timestamp))
    throw new TypeError("Adoption access clock must be valid.");
  return timestamp;
}

function expirationTime(document: AdoptionDocument): number {
  const value = document.data.expiresAt;
  return expirationSchema.safeParse(value).success
    ? Date.parse(value as string)
    : NaN;
}

/** Fail closed before decrypting; invalid legacy dates only emit aggregate diagnostics. */
export function filterReadableAdoptions<T extends AdoptionDocument>(
  documents: T[],
  now: Date = new Date(),
): T[] {
  const timestamp = requireValidClock(now);
  let invalidDates = 0;
  const readable = documents.filter((document) => {
    const expiresAt = expirationTime(document);
    if (!Number.isFinite(expiresAt)) {
      invalidDates += 1;
      return false;
    }
    return expiresAt > timestamp;
  });
  if (invalidDates > 0) {
    console.warn(
      JSON.stringify({
        event: "admin.adoption.invalid-expiration",
        count: invalidDates,
      }),
    );
  }
  return readable;
}

export function requireReadableAdoption<T extends AdoptionDocument>(
  document: T | null,
  now: Date = new Date(),
): T {
  if (!document || filterReadableAdoptions([document], now).length === 0) {
    throw new AdoptionUnavailableError();
  }
  return document;
}

/** The callback receives only readable records. Recheck after I/O before releasing plaintext. */
export async function serializeReadableAdoptions<T extends AdoptionDocument, R>(
  documents: T[],
  serialize: (readable: T[]) => Promise<R[]>,
  clock: () => Date = () => new Date(),
): Promise<R[]> {
  const readable = filterReadableAdoptions(documents, clock());
  if (readable.length === 0) return [];
  const serialized = await serialize(readable);
  if (serialized.length !== readable.length) {
    throw new Error("Adoption serializer returned an inconsistent result.");
  }
  const stillReadable = new Set(filterReadableAdoptions(readable, clock()));
  return serialized.filter((_item, index) =>
    stillReadable.has(readable[index]),
  );
}
