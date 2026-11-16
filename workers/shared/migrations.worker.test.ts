import { generateKeyPairSync } from "node:crypto";
import { afterEach, expect, test, vi } from "vitest";
import { applyMigrationBatch, migrationStatus, previewMigrations } from "../../scripts/migrations/worker-service.mjs";

type Document = { name: string; fields: Record<string, unknown>; updateTime: string; createTime: string };
type Write = { update: Pick<Document, "name" | "fields">; updateMask?: { fieldPaths: string[] }; currentDocument: { exists?: boolean; updateTime?: string } };

afterEach(() => vi.unstubAllGlobals());

test("the Worker runtime authenticates with its bindings and applies resumable atomic batches", async () => {
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048,
    privateKeyEncoding: { type: "pkcs8", format: "pem" }, publicKeyEncoding: { type: "spki", format: "pem" } });
  const env = { APP_ENV: "production", FIREBASE_PROJECT_ID: "synthetic-project",
    FIREBASE_CLIENT_EMAIL: "synthetic@example.test", FIREBASE_PRIVATE_KEY: privateKey };
  const root = "projects/synthetic-project/databases/(default)/documents";
  const documents = new Map<string, Document>();
  const commits: Write[][] = [];
  let sequence = 0;
  const save = (name: string, fields: Record<string, unknown>) => {
    const time = new Date(Date.now() + ++sequence).toISOString();
    documents.set(name, { name, fields, updateTime: time, createTime: documents.get(name)?.createTime ?? time });
    return { updateTime: time };
  };
  for (let i = 0; i < 51; i++) save(`${root}/dogs/dog-${String(i).padStart(3, "0")}`, { nome: { stringValue: "Nina" } });

  vi.stubGlobal("fetch", vi.fn<typeof fetch>(async (input, init) => {
    const url = new URL(String(input));
    if (url.href === "https://oauth2.googleapis.com/token") {
      expect(String(init?.body)).toContain("assertion=");
      return Response.json({ access_token: "synthetic-token", expires_in: 3600 });
    }
    if (url.origin !== "https://firestore.googleapis.com") throw new Error("External network disabled.");
    const headers = new Headers(init?.headers);
    expect(headers.get("Authorization")).toBe("Bearer synthetic-token");
    const path = decodeURIComponent(url.pathname).slice("/v1/".length);
    if (path === `${root}:runQuery`) {
      const { structuredQuery: query } = JSON.parse(String(init?.body));
      const prefix = `${root}/${query.from[0].collectionId}/`;
      const after = query.startAt?.values[0].referenceValue;
      return Response.json([...documents.values()].filter(d => d.name.startsWith(prefix) && (!after || d.name > after))
        .sort((a, b) => a.name.localeCompare(b.name)).slice(0, query.limit).map(document => ({ document })));
    }
    if (path === `${root}:commit`) {
      const { writes } = JSON.parse(String(init?.body)) as { writes: Write[] };
      for (const write of writes) {
        const previous = documents.get(write.update.name);
        if ((write.currentDocument.exists === false && previous)
          || (write.currentDocument.updateTime && previous?.updateTime !== write.currentDocument.updateTime)) {
          return Response.json({ error: { status: "FAILED_PRECONDITION" } }, { status: 412 });
        }
      }
      commits.push(writes);
      return Response.json({ writeResults: writes.map(write => {
        const fields = write.updateMask ? { ...documents.get(write.update.name)?.fields } : {};
        for (const field of write.updateMask?.fieldPaths ?? Object.keys(write.update.fields)) {
          if (field in write.update.fields) fields[field] = write.update.fields[field];
          else delete fields[field];
        }
        return save(write.update.name, fields);
      }) });
    }
    if (!path.startsWith(`${root}/`)) throw new Error("Unexpected synthetic request.");
    return documents.has(path) ? Response.json(documents.get(path)) : new Response(null, { status: 404 });
  }));

  expect((await migrationStatus(env)).migrations[0].status).toBe("pending");
  const preview = await previewMigrations(env, null);
  expect(preview.counts[0].changes).toBe(50);
  expect(preview.cursor).not.toBeNull();
  expect(commits).toHaveLength(0);

  let status = await applyMigrationBatch(env, "developer@example.test");
  expect(status.migrations[0]).toMatchObject({ status: "running", scanned: 50, changed: 50 });
  const batch = commits.find(writes => writes.some(w => w.update.name.includes("/dogs/")));
  expect(batch).toHaveLength(52);
  expect(batch?.at(-2)?.update.name).toBe(`${root}/_migrations/0001-publication-status`);
  expect(batch?.at(-1)?.update.name).toBe(`${root}/_migration_locks/firestore`);

  for (let i = 0; i < 5 && status.migrations[0].status !== "completed"; i++) {
    status = await applyMigrationBatch(env, "developer@example.test");
  }
  expect(status.migrations[0]).toMatchObject({ status: "completed", scanned: 51, changed: 51 });
  expect(documents.get(`${root}/dogs/dog-050`)?.fields.schemaVersion).toEqual({ integerValue: "1" });
});
