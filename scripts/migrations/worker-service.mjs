import { createHash } from "node:crypto";
import { createMigrationStore } from "./firestore.mjs";
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

function runner(env, actor) {
  return new MigrationRunner({
    store: createMigrationStore({
      project: env.FIREBASE_PROJECT_ID, email: env.FIREBASE_CLIENT_EMAIL,
      privateKey: env.FIREBASE_PRIVATE_KEY,
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

export async function applyMigrationBatch(env, actor) {
  await runner(env, actor).up({ maxBatches: 1 });
  return migrationStatus(env);
}
