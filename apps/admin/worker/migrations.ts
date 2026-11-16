import { z } from "zod";
import {
  applyMigrationBatch, migrationStatus, migrationTarget, previewMigrations,
} from "../../../scripts/migrations/worker-service.mjs";
import type { AccessIdentity } from "./access";

const targetSchema = z.object({
  project: z.string().min(1).max(100),
  release: z.string().regex(/^[a-f0-9]{64}$/),
});
const previewSchema = targetSchema.extend({
  cursor: z.object({
    collectionIndex: z.number().int().nonnegative().max(1000),
    after: z.string().max(2000).nullable(),
  }).strict().nullable().default(null),
}).strict();

export async function handleMigrations(
  request: Request, env: Env, identity: AccessIdentity,
  parseJson: (request: Request) => Promise<unknown>,
): Promise<Response> {
  const json = (status: number, body: unknown) => Response.json(body, {
    status, headers: { "Cache-Control": "no-store", "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'", "X-Content-Type-Options": "nosniff" },
  });
  // Defense in depth: every route, including status and preview, is dev-only.
  if (identity.role !== "developer") return json(403, { error: "Developer access required." });
  const path = new URL(request.url).pathname;
  const operation = path === "/api/admin/migrations" ? "status"
    : path === "/api/admin/migrations/plan" ? "plan"
    : path === "/api/admin/migrations/apply" ? "apply" : null;
  if (!operation) return json(404, { error: "Not found" });
  const method = operation === "status" ? "GET" : "POST";
  if (request.method !== method) return new Response(null, { status: 405, headers: { Allow: method, "Cache-Control": "no-store" } });
  // Keep parsing errors in the admin API's existing 400/413/415 handling.
  const input = operation === "status" ? null : (operation === "plan" ? previewSchema : targetSchema.strict()).parse(await parseJson(request));
  try {
    const target = migrationTarget(env);
    if (input && (input.project !== target.project || input.release !== target.release)) {
      return json(409, { error: "O projeto ou as migrações mudaram. Atualize e simule novamente antes de aplicar." });
    }
    if (operation === "status") return json(200, await migrationStatus(env));
    if (operation === "plan") {
      const { cursor } = previewSchema.parse(input);
      // Validate collection cursor before making a Firestore query.
      if (cursor?.after && !cursor.after.startsWith(`projects/${target.project}/databases/(default)/documents/`)) {
        return json(400, { error: "Cursor de simulação inválido." });
      }
      return json(200, await previewMigrations(env, cursor));
    }
    return json(200, await applyMigrationBatch(env, identity.email));
  } catch (error) {
    const locked = error instanceof Error && error.message === "Another migration runner holds the database lock.";
    const conflict = error instanceof Error && "status" in error && [409, 412].includes(Number(error.status));
    const checksumMismatch = error instanceof Error && /^Checksum mismatch for [0-9]{4}-[a-z0-9-]+; create a new migration\.$/.test(error.message);
    const missingDefinition = error instanceof Error && error.message === "Database contains a migration absent from this release.";
    const code = error instanceof Error && "code" in error && typeof error.code === "string" && /^[A-Z_]+$/.test(error.code) ? error.code : undefined;
    console.error(JSON.stringify({ event: "admin.migration.failed", project: env.FIREBASE_PROJECT_ID,
      actor: identity.email, operation, reason: checksumMismatch ? "checksum_mismatch" : missingDefinition ? "missing_definition"
        : locked ? "lock_busy" : error instanceof Error ? error.name : "UnknownError", code }));
    return json(locked || conflict || checksumMismatch || missingDefinition ? 409 : 503, { error: locked || conflict
      ? "Outra execução está usando a trava do banco. Aguarde e tente retomar."
      : checksumMismatch || missingDefinition ? "O histórico diverge das definições deste deploy. Publique a versão correta antes de continuar."
      : "A migração não pôde continuar. Consulte o histórico e os logs do Worker; o progresso confirmado foi preservado." });
  }
}
