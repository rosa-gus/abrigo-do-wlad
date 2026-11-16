import type { MigrationOverview, MigrationPreview, MigrationTarget, PreviewCursor } from "../../shared/migrations";
import { apiRequest } from "./api";

export function getMigrations(signal?: AbortSignal): Promise<MigrationOverview> {
  return apiRequest("/api/admin/migrations", { signal });
}

export function planMigrationPage(target: MigrationTarget, cursor: PreviewCursor | null, signal?: AbortSignal): Promise<MigrationPreview> {
  return apiRequest("/api/admin/migrations/plan", {
    method: "POST", signal, body: JSON.stringify({ project: target.project, release: target.release, cursor }),
  });
}

export function applyMigrationBatch(target: MigrationTarget, signal?: AbortSignal): Promise<MigrationOverview> {
  return apiRequest("/api/admin/migrations/apply", {
    method: "POST", signal, body: JSON.stringify({ project: target.project, release: target.release }),
  });
}
