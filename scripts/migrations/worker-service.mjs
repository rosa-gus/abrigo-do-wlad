import { createHash } from "node:crypto";
import { createMigrationStore, metadataWrite } from "./firestore.mjs";
import { MigrationRunner } from "./runner.mjs";
import { migrations } from "./worker-registry.mjs";

export function migrationTarget(env) {
  const project = env.FIREBASE_PROJECT_ID;
  const environment = env.APP_ENV;
  if (!project || !environment) throw new Error("Missing migration environment.");
  const release = createHash("sha256").update(JSON.stringify({
    project, environment, definitions: migrations.map(({ id, checksum }) => ({ id, checksum })),
  })).digest("hex");
  return { project, environment, database: "(default)", release };
}

function runner(env, actor, audit) {
  return new MigrationRunner({
    store: createMigrationStore({
      project: env.FIREBASE_PROJECT_ID, email: env.FIREBASE_CLIENT_EMAIL,
      privateKey: env.FIREBASE_PRIVATE_KEY,
      ...(audit ? { commitMetadata: (root, writes) => writes.some(write => write.update?.name?.startsWith(`${root}/_migrations/`)) ? [metadataWrite(`${root}/admin_audit_log/${crypto.randomUUID()}`, {
        action: "migration.batch.applied", actor, actorSubject: audit.subject, actorRole: "developer",
        createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 180 * 24 * 60 * 60_000), durationMs: 0, method: "POST", outcome: "success",
        phase: "committed", path: "/api/admin/migrations/apply", requestId: audit.requestId,
        status: 200, target: "_migrations",
      }, null)] : [] } : {}),
    }),
    migrations, batchSize: 50, actor,
    log: event => console.info(JSON.stringify({ event: "admin.migration.progress", project: env.FIREBASE_PROJECT_ID, actor, ...event })),
  });
}

export async function migrationStatus(env) {
  return { ...migrationTarget(env), migrations: await runner(env).status() };
}

export async function previewMigrations(env, cursor) {
  return runner(env).planStep({ cursor });
}

export async function applyMigrationBatch(env, actor, audit) {
  await runner(env, actor, audit).up({ maxBatches: 1 });
  return migrationStatus(env);
}
