import type { MigrationOverview, MigrationPreview, MigrationTarget, PreviewCursor } from "../../apps/admin/shared/migrations";

interface MigrationEnvironment {
  APP_ENV: string;
  FIREBASE_PROJECT_ID?: string;
  FIREBASE_CLIENT_EMAIL?: string;
  FIREBASE_PRIVATE_KEY?: string;
}

export function migrationTarget(env: MigrationEnvironment): MigrationTarget;
export function migrationStatus(env: MigrationEnvironment): Promise<MigrationOverview>;
export function previewMigrations(env: MigrationEnvironment, cursor: PreviewCursor | null): Promise<MigrationPreview>;
export function applyMigrationBatch(env: MigrationEnvironment, actor: string, audit?: { subject: string; requestId: string }): Promise<MigrationOverview>;
