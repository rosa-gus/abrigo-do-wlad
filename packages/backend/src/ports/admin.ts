import type { VersionedDocument, Page, PageInput, WriteResult } from "./documents";
import type { DogMediaMutation } from "./media";

export type StoredAdoption = Record<string, unknown> & { sensitive?: unknown; keyVersion?: unknown };
export interface DogRepository {
  list(input: PageInput & { state: "active" | "archived" }): Promise<Page<VersionedDocument>>;
  find(routeId: string): Promise<VersionedDocument | null>;
  commit(mutation: DogMediaMutation): Promise<WriteResult>;
  archive(document: VersionedDocument, data: Record<string, unknown>, incrementAdoptions: boolean): Promise<void>;
  restore(document: VersionedDocument, data: Record<string, unknown>): Promise<void>;
  inventory(): Promise<VersionedDocument[]>;
}
export interface DogProjection {
  refreshFeed(): void;
  refreshHero(): void;
  saveTombstone(input: { id: string; nome: string; status: "adopted" | "unavailable"; removedAt: string }): Promise<unknown>;
  deleteTombstone(id: string): Promise<unknown>;
}
export interface RecycleRepository {
  list(input: PageInput): Promise<Page<VersionedDocument>>;
  get(id: string): Promise<VersionedDocument | null>;
  create(data: Record<string, unknown>): Promise<{ id: string }>;
  update(document: VersionedDocument, data: Record<string, unknown>): Promise<void>;
  delete(document: VersionedDocument): Promise<void>;
}
export interface SettingsRepository {
  get(): Promise<VersionedDocument | null>;
  save(document: VersionedDocument | null, data: Record<string, unknown>): Promise<WriteResult>;
}
export interface AdoptionRepository {
  list(input: PageInput & { status?: string | null; now: Date }): Promise<Page<VersionedDocument<StoredAdoption>>>;
  get(id: string): Promise<VersionedDocument<StoredAdoption> | null>;
  update(document: VersionedDocument, data: Record<string, unknown>): Promise<WriteResult>;
}
export interface AdoptionDecryptor {
  decrypt(items: { encryptedData: string; keyVersion: string }[]): Promise<Record<string, unknown>[]>;
}
export interface DashboardSnapshot {
  dogTotal: number; archivedDogs: number; recycles: number; publishedDogTotal: number;
  archivedPublishedDogs: number; publishedRecycles: number; adoptions: number;
  expiringDocuments: VersionedDocument<StoredAdoption>[];
  statistics: VersionedDocument<{ adoptionsCount?: unknown }> | null;
}
export interface DashboardReader { read(now: Date, alertWindowEnd: Date): Promise<DashboardSnapshot> }
