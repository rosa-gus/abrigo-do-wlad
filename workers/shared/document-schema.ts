// Persisted document versions. Independent from API/KV payload schema versions.
// Advance a collection only when its writers and migration definition agree.
export const DOG_DOCUMENT_SCHEMA_VERSION = 1;
export const RECYCLE_POINT_DOCUMENT_SCHEMA_VERSION = 1;

export function supportsDocumentVersion(data: { schemaVersion?: unknown }, currentVersion: number): boolean {
  return data.schemaVersion === undefined || (
    typeof data.schemaVersion === "number" && Number.isSafeInteger(data.schemaVersion)
    && data.schemaVersion >= 0 && data.schemaVersion <= currentVersion
  );
}
