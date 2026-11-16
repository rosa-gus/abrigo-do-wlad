import assert from "node:assert/strict";
import { test } from "vitest";
import { FirestoreRestError, type AtomicDocumentWrite, type FirestoreDocument } from "../../../workers/shared/api/_lib/firestore";
import {
  commitDogMediaMutation, deleteManagedMedia, mediaAssetPath,
  registerUploadedMedia, type MediaRepository,
} from "./media-assets";

const env = { CLOUDINARY_CLOUD_NAME: "shelter" } as Env;
const image = "https://res.cloudinary.com/shelter/image/upload/v1/abrigo-do-wlad/dogs/photo.jpg";
const publicId = "abrigo-do-wlad/dogs/photo";
const root = "projects/test/databases/(default)/documents/";

/** Optimistic-commit model validates every precondition before any write. */
function repository() {
  const documents = new Map<string, FirestoreDocument<Record<string, unknown>>>();
  let sequence = 0;
  let beforeCommit: ((writes: AtomicDocumentWrite[]) => Promise<void>) | undefined;
  let afterInventory: (() => Promise<void>) | undefined;
  function put(path: string, data: Record<string, unknown>) {
    const document = {
      id: path.split("/")[1], name: root + path, data,
      updateTime: `2026-11-16T00:00:00.${String(++sequence).padStart(6, "0")}Z`,
    };
    documents.set(path, document);
    return document;
  }
  const store: MediaRepository = {
    async getDocument<T extends Record<string, unknown>>(path: string) {
      return structuredClone(documents.get(path) ?? null) as FirestoreDocument<T> | null;
    },
    async listDocuments<T extends Record<string, unknown>>(collection: string) {
      const result = structuredClone([...documents].filter(([path]) => path.startsWith(`${collection}/`)).map(([, value]) => value));
      await afterInventory?.();
      return result as FirestoreDocument<T>[];
    },
    async commitAtomic(writes) {
      await beforeCommit?.(writes);
      for (const write of writes) {
        const current = documents.get(write.path);
        if (write.kind === "create" ? Boolean(current) : current?.updateTime !== write.updateTime) {
          throw new FirestoreRestError("Precondition failed", 412);
        }
      }
      const writeResults = writes.map(write => {
        if (write.kind === "delete") {
          documents.delete(write.path);
          return {};
        }
        const previous = write.kind === "update" ? documents.get(write.path)?.data : {};
        return { updateTime: put(write.path, { ...previous, ...write.data }).updateTime };
      });
      return { writeResults };
    },
    async createDocument(collection, data, options) {
      const id = options?.documentId ?? "generated";
      const result = await store.commitAtomic([{ kind: "create", path: `${collection}/${id}`, data }]);
      return { id, updateTime: result.writeResults?.[0]?.updateTime };
    },
    async updateDocument(name, data, options) {
      const result = await store.commitAtomic([{ kind: "update", path: name.slice(root.length), data, updateTime: options?.expectedUpdateTime ?? "" }]);
      return { updateTime: result.writeResults?.[0]?.updateTime };
    },
    async deleteDocumentsIfUnchanged(entries) {
      await store.commitAtomic(entries.map(entry => ({ kind: "delete", path: entry.name.slice(root.length), updateTime: entry.updateTime })));
      return { deleted: entries.length };
    },
  };
  return { store, documents, put,
    onCommit(hook: typeof beforeCommit) { beforeCommit = hook; },
    onInventory(hook: typeof afterInventory) { afterInventory = hook; },
  };
}

test("media and dog writes share a single atomic commit and preserve retained references", async () => {
  const fixture = repository();
  await commitDogMediaMutation(env, { kind: "create", id: "dog-a", data: { fotos: [image] } }, fixture.store);
  const path = await mediaAssetPath(publicId);
  assert.deepEqual(fixture.documents.get(path)?.data.referencedBy, ["dogs/dog-a"]);
  const dog = fixture.documents.get("dogs/dog-a")!;
  await commitDogMediaMutation(env, { kind: "update", document: dog, data: { fotos: [], retainedPhotos: [image] } }, fixture.store);
  assert.deepEqual(fixture.documents.get(path)?.data.referencedBy, ["dogs/dog-a"]);
  await commitDogMediaMutation(env, { kind: "delete", document: fixture.documents.get("dogs/dog-a")! }, fixture.store);
  assert.deepEqual(fixture.documents.get(path)?.data.referencedBy, []);
});

test("Firestore FAILED_PRECONDITION HTTP400 is surfaced as a media concurrency conflict", async () => {
  const fixture = repository();
  fixture.onCommit(async () => {
    throw new FirestoreRestError("changed", 400, { error: { status: "FAILED_PRECONDITION" } });
  });
  await assert.rejects(() => commitDogMediaMutation(env, { kind: "create", id: "dog-a", data: { fotos: [image] } }, fixture.store),
    (error: unknown) => error instanceof Error && "status" in error && error.status === 409);
  assert.equal(fixture.documents.has("dogs/dog-a"), false);
});

test("a dog changed after the route read returns 412 without changing its media references", async () => {
  const fixture = repository();
  await commitDogMediaMutation(env, { kind: "create", id: "dog-a", data: { fotos: [image] } }, fixture.store);
  const observed = fixture.documents.get("dogs/dog-a")!;
  fixture.put("dogs/dog-a", { fotos: [image], nome: "Edited by another user" });
  await assert.rejects(
    () => commitDogMediaMutation(env, { kind: "update", document: observed, data: { fotos: [], retainedPhotos: [image] } }, fixture.store),
    (error: unknown) => error instanceof Error && "status" in error && error.status === 412,
  );
  assert.equal(fixture.documents.get("dogs/dog-a")?.data.nome, "Edited by another user");
  assert.deepEqual(fixture.documents.get(await mediaAssetPath(publicId))?.data.referencedBy, ["dogs/dog-a"]);
});

test("a link committed after deletion inventory defeats the deletion CAS", async () => {
  const fixture = repository();
  let destroyed = false;
  fixture.onInventory(async () => {
    fixture.onInventory(undefined);
    await commitDogMediaMutation(env, { kind: "create", id: "dog-a", data: { fotos: [image] } }, fixture.store);
  });
  await assert.rejects(() => deleteManagedMedia(env, image, fixture.store, async () => { destroyed = true; }), /references changed/);
  assert.equal(destroyed, false);
  assert.deepEqual(fixture.documents.get("dogs/dog-a")?.data.fotos, [image]);
  assert.equal(fixture.documents.get(await mediaAssetPath(publicId))?.data.state, "ready");
});

test("a deletion committed after link reads defeats the entire dog/link commit", async () => {
  const fixture = repository();
  const path = await mediaAssetPath(publicId);
  fixture.put(path, { publicId, url: image, state: "ready", referencedBy: [] });
  fixture.onCommit(async writes => {
    if (!writes.some(write => write.path === "dogs/dog-a")) return;
    fixture.onCommit(undefined);
    await deleteManagedMedia(env, image, fixture.store, async () => {});
  });
  await assert.rejects(() => commitDogMediaMutation(env, { kind: "create", id: "dog-a", data: { fotos: [image] } }, fixture.store), /Dog or image changed/);
  assert.equal(fixture.documents.has("dogs/dog-a"), false);
  assert.equal(fixture.documents.get(path)?.data.state, "deleted");
});

test("lazy legacy registration cannot recreate a deleted asset after reading it absent", async () => {
  const fixture = repository();
  fixture.onCommit(async writes => {
    if (!writes.some(write => write.path === "dogs/dog-a")) return;
    fixture.onCommit(undefined);
    await deleteManagedMedia(env, image, fixture.store, async () => {});
  });
  await assert.rejects(() => commitDogMediaMutation(env, { kind: "create", id: "dog-a", data: { fotos: [image] } }, fixture.store), /Dog or image changed/);
  assert.equal(fixture.documents.has("dogs/dog-a"), false);
  assert.equal(fixture.documents.get(await mediaAssetPath(publicId))?.data.state, "deleted");
});

test("failed external deletion remains deleting and retry is safe and idempotent", async () => {
  const fixture = repository();
  const path = await mediaAssetPath(publicId);
  let calls = 0;
  await assert.rejects(() => deleteManagedMedia(env, image, fixture.store, async () => { calls++; throw new Error("network"); }), /network/);
  assert.equal(fixture.documents.get(path)?.data.state, "deleting");
  await assert.rejects(() => commitDogMediaMutation(env, { kind: "create", id: "dog-a", data: { fotos: [image] } }, fixture.store), /being deleted/);
  await deleteManagedMedia(env, image, fixture.store, async () => { calls++; });
  await deleteManagedMedia(env, image, fixture.store, async () => { calls++; });
  assert.equal(calls, 2);
  assert.equal(fixture.documents.get(path)?.data.state, "deleted");
});

test("legacy inventory prevents deleting photos absent from the registry", async () => {
  const fixture = repository();
  fixture.put("dogs/legacy", { fotos: [], retainedPhotos: [image] });
  await assert.rejects(() => deleteManagedMedia(env, image, fixture.store, async () => assert.fail("must not destroy")), /linked to a dog/);
});

test("stale reference metadata does not prevent inventory-based safe cleanup", async () => {
  const fixture = repository();
  const path = await mediaAssetPath(publicId);
  fixture.put(path, { publicId, url: image, state: "ready", referencedBy: ["dogs/already-purged"] });
  await deleteManagedMedia(env, image, fixture.store, async () => {});
  assert.equal(fixture.documents.get(path)?.data.state, "deleted");
});

test("crash after external deletion leaves a resumable tombstone", async () => {
  const fixture = repository();
  const path = await mediaAssetPath(publicId);
  let destroys = 0;
  const destroy = async () => { destroys++; }; // The provider's repeated destroy/not-found succeeds.
  fixture.onCommit(async writes => {
    if (writes.some(write => write.kind === "update" && write.data.state === "deleted")) {
      fixture.onCommit(undefined);
      throw new Error("lost database response");
    }
  });
  await assert.rejects(() => deleteManagedMedia(env, image, fixture.store, destroy), /lost database/);
  assert.equal(fixture.documents.get(path)?.data.state, "deleting");
  await deleteManagedMedia(env, image, fixture.store, destroy);
  assert.equal(fixture.documents.get(path)?.data.state, "deleted");
  assert.equal(destroys, 2);
});

test("external legacy URLs stay usable and cannot be deleted through managed media", async () => {
  const fixture = repository();
  const external = "https://legacy.example.test/dog.jpg";
  await commitDogMediaMutation(env, { kind: "create", id: "legacy", data: { fotos: [external] } }, fixture.store);
  assert.deepEqual(fixture.documents.get("dogs/legacy")?.data.fotos, [external]);
  assert.equal([...fixture.documents.keys()].some(path => path.startsWith("media_assets/")), false);
  await assert.rejects(() => deleteManagedMedia(env, external, fixture.store), /Invalid managed/);
});

test("new uploads enter ready state without exposing cloud credentials", async () => {
  const fixture = repository();
  await registerUploadedMedia(env, { publicId, url: image, bytes: 10, width: 1, height: 1, format: "jpg" }, fixture.store);
  const asset = fixture.documents.get(await mediaAssetPath(publicId));
  assert.deepEqual(asset?.data, { publicId, url: image, state: "ready", referencedBy: [] });
});

test("inventory fails closed for a newer dog schema", async () => {
  const fixture = repository();
  fixture.put("dogs/future", { schemaVersion: 999 });
  await assert.rejects(() => deleteManagedMedia(env, image, fixture.store, async () => assert.fail("must not destroy")), /unsupported dog schemas/);
});
