import type { VersionedDocument } from "./documents";
/** Adapter must commit the dog and its managed references atomically, including request audit/outbox metadata. */
export type DogMediaMutation =
  | { kind: "create"; id: string; data: Record<string, unknown> }
  | { kind: "update"; document: VersionedDocument; data: Record<string, unknown> }
  | { kind: "delete"; document: VersionedDocument };
