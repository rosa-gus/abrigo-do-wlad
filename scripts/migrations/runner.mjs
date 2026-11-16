import { randomUUID } from "node:crypto";
import { decodeMetadata, metadataWrite } from "./firestore.mjs";

const ENGINE_VERSION = 1;
const LEASE_MS = 120_000;
const FIELD_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;

export function validateMigrations(migrations) {
  const versions = new Map();
  let previousId = "";
  for (const migration of migrations) {
    if (!/^\d{4}-[a-z0-9-]+$/.test(migration.id) || migration.id <= previousId
      || !/^[a-f0-9]{64}$/.test(migration.checksum) || typeof migration.transform !== "function"
      || !migration.collections?.length) throw new Error("Invalid or unordered migration registry.");
    previousId = migration.id;
    const seen = new Set();
    for (const collection of migration.collections) {
      if (!FIELD_NAME.test(collection.name) || collection.name.startsWith("_") || seen.has(collection.name)
        || collection.from !== (versions.get(collection.name) ?? 0) || collection.to !== collection.from + 1) {
        throw new Error(`Invalid version chain in ${migration.id}.`);
      }
      seen.add(collection.name);
      versions.set(collection.name, collection.to);
    }
  }
  return versions;
}

export function documentVersion(document) {
  const field = document.fields?.schemaVersion;
  if (field === undefined) return 0;
  if (!field || !/^(0|[1-9]\d*)$/.test(String(field.integerValue))
    || !Number.isSafeInteger(Number(field.integerValue))) throw new Error("Invalid document schemaVersion.");
  return Number(field.integerValue);
}

export function planDocument(migration, collection, document, now, latestVersion) {
  if (!document.updateTime || !Number.isFinite(Date.parse(document.updateTime))) {
    throw new Error("Document is missing a valid updateTime.");
  }
  const version = documentVersion(document);
  if (version > latestVersion) throw new Error("Document schema is newer than this migration registry.");
  if (version >= collection.to) return null;
  if (version !== collection.from) throw new Error(`Missing prerequisite for ${migration.id}.`);
  // A definition is synchronous and receives a copy, never the source document.
  const patch = migration.transform({ document: structuredClone(document), collection: collection.name, now }) ?? {};
  if (patch.then || typeof patch !== "object" || Array.isArray(patch)) throw new Error("Invalid migration transformation.");
  const set = { ...(patch.set ?? {}) };
  const unset = patch.unset ?? [];
  if (!Array.isArray(unset) || new Set(unset).size !== unset.length
    || [...Object.keys(set), ...unset].some(field => !FIELD_NAME.test(field) || field === "schemaVersion")
    || unset.some(field => field in set)
    || Object.values(set).some(value => !value || typeof value !== "object" || Array.isArray(value))) {
    throw new Error("Invalid migration patch; use top-level set/unset fields.");
  }
  set.schemaVersion = { integerValue: String(collection.to) };
  const fields = { ...document.fields, ...set };
  for (const field of unset) delete fields[field];
  return {
    document: { ...document, fields },
    write: {
      update: { name: document.name, fields: set },
      updateMask: { fieldPaths: [...Object.keys(set), ...unset] },
      currentDocument: { updateTime: document.updateTime },
    },
  };
}

export class MigrationRunner {
  constructor({ store, migrations, batchSize = 100, clock = Date.now, actor = "service-account", log = () => {} }) {
    this.latestVersions = validateMigrations(migrations);
    if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 100) throw new Error("Batch size must be between 1 and 100.");
    this.store = store;
    this.migrations = migrations;
    this.batchSize = batchSize;
    this.clock = clock;
    this.actor = actor;
    this.log = log;
    this.owner = randomUUID();
    this.lockPath = "_migration_locks/firestore";
  }

  timestamp() { return new Date(this.clock()).toISOString(); }

  select(to) {
    if (to && !this.migrations.some(migration => migration.id === to)) throw new Error("Unknown --to migration.");
    return this.migrations.filter(migration => !to || migration.id <= to);
  }

  async history() {
    const records = new Map();
    let after = null;
    for (;;) {
      const page = await this.store.page("_migrations", after, 100);
      if (!page.length) break;
      for (const document of page) {
        const id = document.name.split("/").at(-1);
        const migration = this.migrations.find(item => item.id === id);
        if (!migration) throw new Error("Database contains a migration absent from this release.");
        this.validateHistory(migration, document);
        records.set(id, document);
      }
      after = page.at(-1).name;
    }
    return records;
  }

  validateHistory(migration, document) {
    const state = decodeMetadata(document);
    if (state.checksum !== migration.checksum) throw new Error(`Checksum mismatch for ${migration.id}; create a new migration.`);
    if (state.engineVersion !== ENGINE_VERSION || state.migrationId !== migration.id
      || !["running", "failed", "completed"].includes(state.status)
      || !Number.isInteger(state.collectionIndex) || state.collectionIndex < 0 || state.collectionIndex > migration.collections.length
      || ![state.scanned, state.changed, state.attempts].every(value => Number.isSafeInteger(value) && value >= 0)
      || state.changed > state.scanned
      || typeof state.startedAt !== "string" || !Number.isFinite(Date.parse(state.startedAt))
      || (state.after !== null && (typeof state.after !== "string"
        || !state.after.startsWith(`${this.store.root}/${migration.collections[state.collectionIndex]?.name}/`)))
      || (state.collectionIndex === migration.collections.length && state.after !== null)
      || (state.status === "completed" && (state.collectionIndex !== migration.collections.length || state.after !== null))) {
      throw new Error(`Invalid migration history for ${migration.id}.`);
    }
    return state;
  }

  async status() {
    const history = await this.history();
    return this.migrations.map(migration => {
      const state = history.has(migration.id) ? decodeMetadata(history.get(migration.id)) : null;
      return { id: migration.id, description: migration.description,
        status: state?.status ?? "pending", scanned: state?.scanned ?? 0,
        changed: state?.changed ?? 0, attempts: state?.attempts ?? 0,
        checkpoint: state ? { collectionIndex: state.collectionIndex, after: state.after } : null };
    });
  }

  async plan({ to } = {}) {
    const history = await this.history();
    const migrations = this.select(to);
    const counts = new Map(migrations.map(migration => [migration.id, {
      id: migration.id, status: history.has(migration.id) ? decodeMetadata(history.get(migration.id)).status : "pending",
      scanned: 0, changes: 0,
    }]));
    const collections = [...new Set(migrations.flatMap(migration => migration.collections.map(collection => collection.name)))];
    const now = this.timestamp();
    for (const collectionName of collections) {
      let after = null;
      for (;;) {
        const page = await this.store.page(collectionName, after, this.batchSize);
        if (!page.length) break;
        for (const source of page) {
          let document = source;
          // Simulate the complete chain so a future v1 -> v2 migration can be
          // previewed even when the stored document is still at v0.
          for (const migration of migrations) {
            const collection = migration.collections.find(item => item.name === collectionName);
            if (!collection) continue;
            const count = counts.get(migration.id);
            count.scanned++;
            const patch = planDocument(migration, collection, document, now, this.latestVersions.get(collectionName));
            if (patch) { count.changes++; document = patch.document; }
          }
        }
        after = page.at(-1).name;
      }
    }
    return [...counts.values()];
  }

  assertLease() {
    const lease = decodeMetadata(this.lease);
    if (!lease || lease.owner !== this.owner || Date.parse(lease.expiresAt) <= this.clock()) {
      throw new Error("Migration lease expired or ownership was lost; rerun the command.");
    }
  }

  async acquire() {
    const previous = await this.store.get(this.lockPath);
    const lease = decodeMetadata(previous);
    if (lease && (typeof lease.owner !== "string" || !Number.isFinite(Date.parse(lease.expiresAt)))) {
      throw new Error("Invalid migration lock.");
    }
    if (lease && Date.parse(lease.expiresAt) > this.clock()) throw new Error("Another migration runner holds the database lock.");
    const fields = { owner: this.owner, expiresAt: new Date(this.clock() + LEASE_MS).toISOString() };
    const write = metadataWrite(`${this.store.root}/${this.lockPath}`, fields, previous);
    const result = await this.store.commit([write]);
    this.lease = { ...write.update, updateTime: result.writeResults[0].updateTime };
  }

  async progress(migration, state, previous, documentWrites = []) {
    this.assertLease();
    const recordWrite = metadataWrite(`${this.store.root}/_migrations/${migration.id}`, state, previous);
    const leaseWrite = metadataWrite(this.lease.name, {
      owner: this.owner, expiresAt: new Date(this.clock() + LEASE_MS).toISOString(),
    }, this.lease);
    // Source documents, checkpoint and lease advance in the same atomic commit.
    const result = await this.store.commit([...documentWrites, recordWrite, leaseWrite]);
    this.lease = { ...leaseWrite.update, updateTime: result.writeResults.at(-1).updateTime };
    return { ...recordWrite.update, updateTime: result.writeResults.at(-2).updateTime };
  }

  async release() {
    const current = await this.store.get(this.lockPath);
    if (decodeMetadata(current)?.owner !== this.owner) return;
    await this.store.commit([metadataWrite(current.name, { owner: this.owner, expiresAt: this.timestamp() }, current)]);
  }

  async fail(migration, error) {
    // A commit can succeed before its response is lost. Re-read durable state;
    // never rewind the checkpoint or turn a completed migration into a failure.
    const lease = await this.store.get(this.lockPath);
    if (decodeMetadata(lease)?.owner !== this.owner) return;
    this.lease = lease;
    const record = await this.store.get(`_migrations/${migration.id}`);
    if (!record) return;
    const state = this.validateHistory(migration, record);
    if (state.status === "completed" || state.runId !== this.owner) return;
    await this.progress(migration, {
      ...state, status: "failed", lastError: error.code ?? error.name ?? "MigrationError",
    }, record);
  }

  async up({ to, rescan = false } = {}) {
    this.select(to);
    await this.history();
    await this.acquire();
    const results = [];
    let currentMigration;
    try {
      // Inspect again under the lock: another runner may have finished while
      // this process was reading history.
      const history = await this.history();
      for (const migration of this.select(to)) {
        currentMigration = migration;
        let record = history.get(migration.id);
        const previous = record ? this.validateHistory(migration, record) : null;
        if (previous?.status === "completed" && !rescan) {
          results.push({ id: migration.id, status: "completed", skipped: true });
          continue;
        }
        const state = {
          engineVersion: ENGINE_VERSION, migrationId: migration.id, checksum: migration.checksum,
          collectionIndex: 0, after: null, scanned: 0, changed: 0,
          startedAt: this.timestamp(), finishedAt: null,
          ...(previous && previous.status !== "completed" && !rescan ? previous : {}),
          status: "running", runId: this.owner, actor: this.actor,
          attempts: (previous?.attempts ?? 0) + 1, lastError: null,
        };
        record = await this.progress(migration, state, record);
        let conflicts = 0;
        while (state.collectionIndex < migration.collections.length) {
          this.assertLease();
          const collection = migration.collections[state.collectionIndex];
          const page = await this.store.page(collection.name, state.after, this.batchSize);
          const writes = page.flatMap(document => {
            const patch = planDocument(migration, collection, document, state.startedAt, this.latestVersions.get(collection.name));
            return patch ? [patch.write] : [];
          });
          const next = {
            ...state, scanned: state.scanned + page.length, changed: state.changed + writes.length,
            after: page.length ? page.at(-1).name : null,
            collectionIndex: state.collectionIndex + (page.length ? 0 : 1),
          };
          try {
            record = await this.progress(migration, next, record, writes);
          } catch (error) {
            if (([409, 412].includes(error.status) || ["ABORTED", "FAILED_PRECONDITION"].includes(error.code)) && conflicts++ < 3) {
              const lease = await this.store.get(this.lockPath);
              if (decodeMetadata(lease)?.owner !== this.owner) throw new Error("Migration lock ownership was lost.");
              this.lease = lease;
              this.assertLease();
              // Failed atomic batches did not advance the durable cursor.
              continue;
            }
            throw error;
          }
          conflicts = 0;
          Object.assign(state, next);
          this.log({ id: migration.id, scanned: state.scanned, changed: state.changed });
        }
        const completed = { ...state, status: "completed", finishedAt: this.timestamp() };
        await this.progress(migration, completed, record);
        results.push({ id: migration.id, status: "completed", scanned: state.scanned, changed: state.changed });
      }
      return results;
    } catch (error) {
      if (currentMigration) {
        try { await this.fail(currentMigration, error); } catch { /* The original error wins; lease expiry allows a later retry. */ }
      }
      throw error;
    } finally {
      try { await this.release(); } catch { this.log({ event: "migration.lock.release.failed", expiresAutomatically: true }); }
    }
  }
}
