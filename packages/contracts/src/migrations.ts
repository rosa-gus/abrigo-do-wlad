export interface MigrationState {
  id: string;
  description: string;
  status: "pending" | "running" | "failed" | "completed";
  scanned: number;
  changed: number;
  attempts: number;
  checkpoint: { collectionIndex: number; after: string | null } | null;
}

export interface MigrationTarget {
  project: string;
  environment: string;
  database: "(default)";
  release: string;
}

export interface MigrationOverview extends MigrationTarget {
  migrations: MigrationState[];
}

export interface PreviewCursor {
  collectionIndex: number;
  after: string | null;
}

export interface MigrationPreview {
  counts: { id: string; scanned: number; changes: number }[];
  cursor: PreviewCursor | null;
}
