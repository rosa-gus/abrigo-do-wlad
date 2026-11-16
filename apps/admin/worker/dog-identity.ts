import type { FirestoreDocument } from "../../../workers/shared/api/_lib/firestore";

export interface DogIdentityRepository {
  getDocument<T extends Record<string, unknown>>(path: string): Promise<FirestoreDocument<T> | null>;
  findDocumentsByField<T extends Record<string, unknown>>(
    collection: string, field: string, value: number, limit: number,
  ): Promise<FirestoreDocument<T>[]>;
}

export class DogIdentityError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "DogIdentityError";
    this.status = status;
  }
}

/** Explicit namespace keeps numeric document IDs distinct from legacy business IDs. */
export async function resolveAdminDog(
  repository: DogIdentityRepository,
  routeId: string,
): Promise<FirestoreDocument<Record<string, unknown>> | null> {
  if (routeId.startsWith("doc:")) {
    const documentId = routeId.slice(4);
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(documentId)) {
      throw new DogIdentityError(400, "Invalid dog document ID.");
    }
    return repository.getDocument(`dogs/${documentId}`);
  }
  if (!/^\d{1,16}$/.test(routeId) || !Number.isSafeInteger(Number(routeId))) {
    throw new DogIdentityError(400, "Invalid dog ID.");
  }
  const matches = await repository.findDocumentsByField("dogs", "id", Number(routeId), 2);
  if (matches.length > 1) {
    throw new DogIdentityError(409, "O identificador antigo corresponde a mais de uma ficha. Abra a ficha pela listagem atual.");
  }
  return matches[0] ?? null;
}

/** Inventory contains document identifiers only, never names or other record data. */
export function inventoryLegacyDogIds(
  documents: FirestoreDocument<Record<string, unknown>>[],
): { legacyId: number; documentIds: string[] }[] {
  const groups = new Map<number, string[]>();
  for (const document of documents) {
    const legacyId = document.data.id;
    if (typeof legacyId !== "number" || !Number.isSafeInteger(legacyId) || legacyId < 0) continue;
    const group = groups.get(legacyId) ?? [];
    group.push(document.id);
    groups.set(legacyId, group);
  }
  return [...groups.entries()]
    .filter(([, documentIds]) => documentIds.length > 1)
    .map(([legacyId, documentIds]) => ({ legacyId, documentIds: documentIds.sort() }))
    .sort((left, right) => left.legacyId - right.legacyId);
}
