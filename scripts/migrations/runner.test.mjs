import { expect, test } from "vitest";
import { decodeMetadata, encodeMetadata } from "./firestore.mjs";
import { MigrationRunner, planDocument, validateMigrations } from "./runner.mjs";
import publication from "./definitions/0001-publication-status.mjs";
import { loadMigrations } from "./registry.mjs";
import { main, parseArguments } from "../migrate.mjs";
import { DOG_DOCUMENT_SCHEMA_VERSION, RECYCLE_POINT_DOCUMENT_SCHEMA_VERSION } from "../../workers/shared/document-schema.ts";

const NOW = Date.parse("2026-11-15T12:00:00.000Z");
const first = { ...publication, checksum: "a".repeat(64) };
const second = {
  id: "0002-example-english-name", description: "Example for engine tests only.", checksum: "b".repeat(64),
  collections: [{ name: "dogs", from: 1, to: 2 }],
  transform: ({ document }) => ({ set: { name: document.fields.nome }, unset: ["nome"] }),
};

class MemoryStore {
  project = "test-project";
  root = "projects/test-project/databases/(default)/documents";
  documents = new Map();
  commits = [];
  sequence = 0;
  beforeCommit;
  afterCommit;

  seed(path, fields) {
    const document = {
      name: `${this.root}/${path}`, fields,
      createTime: new Date(NOW - 1000).toISOString(),
      updateTime: new Date(NOW + ++this.sequence).toISOString(),
    };
    this.documents.set(document.name, document);
    return document;
  }

  async get(path) { return structuredClone(this.documents.get(`${this.root}/${path}`) ?? null); }
  async page(collection, after, limit) {
    return structuredClone([...this.documents.values()]
      .filter(document => document.name.startsWith(`${this.root}/${collection}/`) && (!after || document.name > after))
      .sort((a, b) => a.name < b.name ? -1 : 1).slice(0, limit));
  }
  async commit(writes) {
    await this.beforeCommit?.(writes);
    // Check every precondition before applying any write, matching atomic commit.
    for (const write of writes) {
      const previous = this.documents.get(write.update.name);
      if ((write.currentDocument.exists === false && previous)
        || (write.currentDocument.updateTime && previous?.updateTime !== write.currentDocument.updateTime)) {
        throw Object.assign(new Error("Changed concurrently."), { status: 412 });
      }
    }
    this.commits.push(structuredClone(writes));
    const writeResults = writes.map(write => {
      const previous = this.documents.get(write.update.name);
      let fields = structuredClone(write.update.fields);
      if (write.updateMask) {
        fields = { ...previous.fields };
        for (const field of write.updateMask.fieldPaths) {
          if (field in write.update.fields) fields[field] = structuredClone(write.update.fields[field]);
          else delete fields[field];
        }
      }
      const saved = this.seed(write.update.name.slice(this.root.length + 1), fields);
      return { updateTime: saved.updateTime };
    });
    await this.afterCommit?.(writes);
    return { writeResults };
  }
}

function runner(store, options = {}) {
  return new MigrationRunner({ store, migrations: [first], batchSize: 1, clock: () => NOW, ...options });
}
function seedDog(store, id, extra = {}) { return store.seed(`dogs/${id}`, { nome: { stringValue: "Nina" }, ...extra }); }
function sourceWrites(store) { return store.commits.flat().filter(write => write.update.name.includes("/dogs/")); }

test("registry is ordered, checksummed and enforces an unbroken version chain", async () => {
  const registry = await loadMigrations();
  expect(registry[0].id).toBe("0001-publication-status");
  expect(registry[0].checksum).toMatch(/^[a-f0-9]{64}$/);
  const currentVersions = validateMigrations(registry);
  expect(currentVersions.get("dogs")).toBe(DOG_DOCUMENT_SCHEMA_VERSION);
  expect(currentVersions.get("recycle_points")).toBe(RECYCLE_POINT_DOCUMENT_SCHEMA_VERSION);
  expect(validateMigrations([first, second]).get("dogs")).toBe(2);
  expect(() => validateMigrations([second])).toThrow("version chain");
  expect(() => validateMigrations([first, first])).toThrow();
});

test("plan simulates multiple future versions without any metadata or source writes", async () => {
  const store = new MemoryStore(); seedDog(store, "a");
  const original = structuredClone(store.documents);
  const plan = await runner(store, { migrations: [first, second] }).plan();
  expect(plan.map(item => item.changes)).toEqual([1, 1]);
  expect(store.documents).toEqual(original);
  expect(store.commits).toEqual([]);
});

test("document changes and resumable progress share the same atomic batch", async () => {
  const store = new MemoryStore(); seedDog(store, "a"); seedDog(store, "b");
  store.seed("recycle_points/p", { name: { stringValue: "Ponto" }, publicationStatus: { stringValue: "draft" } });
  await runner(store).up();
  const dog = await store.get("dogs/a");
  expect(dog.fields).toMatchObject({ schemaVersion: { integerValue: "1" }, publicationStatus: { stringValue: "published" } });
  expect((await store.get("recycle_points/p")).fields.publishedAt).toBeUndefined();
  for (const batch of store.commits.filter(batch => batch.some(write => write.update.name.includes("/dogs/")))) {
    expect(batch.some(write => write.update.name.includes("/_migrations/"))).toBe(true);
    expect(batch.some(write => write.update.name.includes("/_migration_locks/"))).toBe(true);
  }
  expect(decodeMetadata(await store.get("_migrations/0001-publication-status")))
    .toMatchObject({ status: "completed", scanned: 3, changed: 3, attempts: 1 });
  const writes = sourceWrites(store).length;
  await runner(store).up();
  expect(sourceWrites(store)).toHaveLength(writes);
});

test("a failed run resumes from the durable cursor without repeating completed documents", async () => {
  const store = new MemoryStore(); seedDog(store, "a"); seedDog(store, "b");
  let fail = true;
  store.beforeCommit = writes => {
    if (fail && writes.some(write => write.update.name.endsWith("/dogs/b"))) {
      fail = false; throw Object.assign(new Error("Temporary failure."), { status: 503 });
    }
  };
  await expect(runner(store).up()).rejects.toThrow("Temporary failure");
  expect(decodeMetadata(await store.get("_migrations/0001-publication-status")))
    .toMatchObject({ status: "failed", after: `${store.root}/dogs/a`, changed: 1 });
  await runner(store).up();
  expect(sourceWrites(store).map(write => write.update.name.split("/").at(-1))).toEqual(["a", "b"]);
  expect(decodeMetadata(await store.get("_migrations/0001-publication-status")))
    .toMatchObject({ status: "completed", changed: 2, attempts: 2 });
});

test("a successful commit with a lost response resumes from persisted state", async () => {
  const store = new MemoryStore(); seedDog(store, "a"); seedDog(store, "b");
  let fail = true;
  store.afterCommit = writes => {
    if (fail && writes.some(write => write.update.name.endsWith("/dogs/a"))) {
      fail = false; throw new Error("Response lost.");
    }
  };
  await expect(runner(store).up()).rejects.toThrow("Response lost");
  await runner(store).up();
  expect(sourceWrites(store)).toHaveLength(2);
});

test("concurrent edits cause a fresh read rather than an overwrite or a skipped batch", async () => {
  const store = new MemoryStore(); seedDog(store, "a");
  let changed = false;
  store.beforeCommit = writes => {
    if (!changed && writes.some(write => write.update.name.endsWith("/dogs/a"))) {
      changed = true;
      seedDog(store, "a", { publicationStatus: { stringValue: "draft" }, descricaoCompleta: { stringValue: "Updated concurrently" } });
    }
  };
  await runner(store).up();
  expect((await store.get("dogs/a")).fields).toMatchObject({
    publicationStatus: { stringValue: "draft" }, descricaoCompleta: { stringValue: "Updated concurrently" }, schemaVersion: { integerValue: "1" },
  });
});

test("an active lease blocks a second runner and losing ownership prevents further writes", async () => {
  const store = new MemoryStore(); seedDog(store, "a");
  store.seed("_migration_locks/firestore", encodeMetadata({ owner: "other", expiresAt: new Date(NOW + 60_000).toISOString() }));
  await expect(runner(store).up()).rejects.toThrow("holds the database lock");
  expect(sourceWrites(store)).toHaveLength(0);
  store.seed("_migration_locks/firestore", encodeMetadata({ owner: "old", expiresAt: new Date(NOW - 1).toISOString() }));
  store.beforeCommit = writes => {
    if (writes.some(write => write.update.name.endsWith("/dogs/a"))) {
      store.seed("_migration_locks/firestore", encodeMetadata({ owner: "new-owner", expiresAt: new Date(NOW + 60_000).toISOString() }));
    }
  };
  await expect(runner(store).up()).rejects.toThrow("ownership was lost");
  expect(sourceWrites(store)).toHaveLength(0);
  expect(decodeMetadata(await store.get("_migration_locks/firestore")).owner).toBe("new-owner");
});

test("expired leases cannot commit a transformation", async () => {
  const store = new MemoryStore(); seedDog(store, "a");
  let now = NOW;
  const slow = { ...first, transform(context) { now += 130_000; return first.transform(context); } };
  await expect(runner(store, { migrations: [slow], clock: () => now }).up()).rejects.toThrow("lease expired");
  expect(sourceWrites(store)).toHaveLength(0);
});

test("checksums and unknown migration history prevent old or modified releases from applying", async () => {
  const store = new MemoryStore(); seedDog(store, "a");
  await runner(store).up();
  const writes = store.commits.length;
  await expect(runner(store, { migrations: [{ ...first, checksum: "c".repeat(64) }] }).up()).rejects.toThrow("Checksum mismatch");
  store.seed("_migrations/9999-future-release", {});
  await expect(runner(store).plan()).rejects.toThrow("absent from this release");
  expect(store.commits).toHaveLength(writes);
});

test("rescan handles legacy documents inserted before a completed cursor", async () => {
  const store = new MemoryStore(); seedDog(store, "z");
  await runner(store).up();
  seedDog(store, "a", { publicationStatus: { stringValue: "draft" } });
  expect((await runner(store).plan())[0].changes).toBe(1);
  await runner(store).up({ rescan: true });
  expect((await store.get("dogs/a")).fields).toMatchObject({
    schemaVersion: { integerValue: "1" }, publicationStatus: { stringValue: "draft" },
  });
});

test("rescan restarts failed later migrations as well as completed prerequisites", async () => {
  const store = new MemoryStore(); seedDog(store, "z");
  let fail = true;
  store.afterCommit = writes => {
    if (fail && writes.some(write => write.update.name.endsWith("/dogs/z") && write.update.fields.schemaVersion?.integerValue === "2")) {
      fail = false;
      seedDog(store, "a");
      throw new Error("Interrupted after a late legacy insert.");
    }
  };
  await expect(runner(store, { migrations: [first, second] }).up()).rejects.toThrow("Interrupted");
  await runner(store, { migrations: [first, second] }).up({ rescan: true });
  expect((await store.get("dogs/a")).fields).toMatchObject({ schemaVersion: { integerValue: "2" }, name: { stringValue: "Nina" } });
});

test("losing the completion response cannot downgrade completed history to failed", async () => {
  const store = new MemoryStore(); seedDog(store, "a");
  store.afterCommit = writes => {
    if (writes.some(write => write.update.name.includes("/_migrations/") && decodeMetadata(write.update).status === "completed")) {
      throw new Error("Completion response lost.");
    }
  };
  await expect(runner(store).up()).rejects.toThrow("Completion response lost");
  expect(decodeMetadata(await store.get("_migrations/0001-publication-status")).status).toBe("completed");
});

test("future renames preserve raw Firestore values and remove only explicitly selected fields", async () => {
  const store = new MemoryStore();
  const int64 = { integerValue: "9223372036854775807" };
  const timestamp = { timestampValue: "2026-11-01T00:00:00.123456Z" };
  seedDog(store, "a", { importedId: int64, intakeTime: timestamp });
  await runner(store, { migrations: [first, second] }).up();
  const document = await store.get("dogs/a");
  expect(document.fields.nome).toBeUndefined();
  expect(document.fields.name).toEqual({ stringValue: "Nina" });
  expect(document.fields.importedId).toEqual(int64);
  expect(document.fields.intakeTime).toEqual(timestamp);
  expect(document.fields.schemaVersion).toEqual({ integerValue: "2" });
});

test("invalid source versions, publication states and patches fail instead of guessing", () => {
  const store = new MemoryStore();
  for (const extra of [
    { schemaVersion: { integerValue: "99" } }, { schemaVersion: { stringValue: "1" } },
    { publicationStatus: { stringValue: "unknown" } },
  ]) {
    expect(() => planDocument(first, first.collections[0], seedDog(store, "a", extra), new Date(NOW).toISOString(), 1)).toThrow();
  }
  const invalid = { ...first, transform: () => ({ set: { nome: { stringValue: "x" } }, unset: ["nome"] }) };
  expect(() => planDocument(invalid, first.collections[0], seedDog(store, "a"), new Date(NOW).toISOString(), 1)).toThrow("Invalid migration patch");
});

test("CLI requires an explicit matching project and explicit write intent", async () => {
  expect(parseArguments(["plan", "--project=test-project"]).apply).toBe(false);
  expect(parseArguments(["up", "--project", "test-project", "--apply", "--rescan"]).rescan).toBe(true);
  for (const args of [["up", "--project=test-project"], ["plan", "--apply", "--project=test-project"],
    ["plan"], ["plan", "--project=x", "--batch-size=101"], ["plan", "--project=x", "--project=y"]]) {
    expect(() => parseArguments(args)).toThrow();
  }
  await expect(main(["up", "--project=wrong-project", "--apply"], { FIREBASE_PROJECT_ID: "test-project" }))
    .rejects.toThrow("must match");
});
