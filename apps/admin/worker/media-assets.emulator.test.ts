import assert from "node:assert/strict";
import { beforeAll, test } from "vitest";
import { FirestoreRestClient, type AtomicDocumentWrite, type FirestoreDocument } from "../../../workers/shared/api/_lib/firestore";
import { commitDogMediaMutation, deleteManagedMedia, mediaAssetPath } from "./media-assets";

// Deliberately opt-in: the ordinary unit suite must never contact a live database.
// Run under firebase emulators:exec; the fetch adapter refuses every other host.
const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST;
const emulatorTest = test.skipIf(!emulatorHost);
const env = { CLOUDINARY_CLOUD_NAME: "shelter-emulator" } as Env;
const project = "demo-abrigo-media";

beforeAll(async () => {
  if (!emulatorHost) return;
  if (!/^(127\.0\.0\.1|localhost):\d+$/.test(emulatorHost)) throw new Error("Loopback emulator required.");
  // JVM/database initialization can exceed the application's 8s upstream budget.
  // Warm only the synthetic emulator before exercising the production timeout.
  const root = `http://${emulatorHost}/v1/projects/${project}/databases/(default)/documents`;
  // A missing-document read does not warm the emulator's first write/query paths.
  for (const [operation, body] of [
    [":commit", { writes: [{ update: { name: `projects/${project}/databases/(default)/documents/_test_warmup/ready`, fields: { ready: { booleanValue: true } } } }] }],
    [":runQuery", { structuredQuery: { from: [{ collectionId: "dogs" }], limit: 1 } }],
  ] as const) {
    const response = await fetch(`${root}${operation}`, {
      method: "POST", body: JSON.stringify(body),
      headers: { Authorization: "Bearer owner", "Content-Type": "application/json" },
      signal: AbortSignal.timeout(30_000),
    });
    assert.equal(response.status, 200);
    await response.arrayBuffer();
  }
}, 65_000);

function fixture() {
  if (!emulatorHost || !/^(127\.0\.0\.1|localhost):\d+$/.test(emulatorHost)) {
    throw new Error("Media integration tests require a loopback Firestore emulator.");
  }
  const client = new FirestoreRestClient(project, {
    tokenProvider: async () => "owner",
    fetcher: async (input, init) => {
      const url = new URL(input instanceof Request ? input.url : String(input));
      if (url.origin !== "https://firestore.googleapis.com") throw new Error("Unexpected upstream");
      return fetch(`http://${emulatorHost}${url.pathname}${url.search}`, init);
    },
  });
  const publicId = `abrigo-do-wlad/dogs/emulator-${crypto.randomUUID()}`;
  const image = `https://res.cloudinary.com/shelter-emulator/image/upload/v1/${publicId}.jpg`;
  return { client, image, publicId };
}

emulatorTest("Firestore emulator atomically rejects dog+asset when deletion wins after link reads", async () => {
  const { client, image, publicId } = fixture();
  const path = await mediaAssetPath(publicId);
  await client.commitAtomic([{ kind: "create", path, data: { publicId, url: image, state: "ready", referencedBy: [], preserved: "keep" } }]);
  const realCommit = client.commitAtomic.bind(client);
  let intercept = true;
  client.commitAtomic = async (writes: AtomicDocumentWrite[]) => {
    if (intercept && writes.some(write => write.path === "dogs/dog-a")) {
      intercept = false;
      await deleteManagedMedia(env, image, client, async () => {});
    }
    return realCommit(writes);
  };
  await assert.rejects(() => commitDogMediaMutation(env, { kind: "create", id: "dog-a", data: { fotos: [image] } }, client), /changed/);
  assert.equal(await client.getDocument("dogs/dog-a"), null);
  const asset = await client.getDocument(path);
  assert.equal(asset?.data.state, "deleted");
  assert.equal(asset?.data.publicId, publicId);
  assert.equal(asset?.data.preserved, "keep"); // updateMask must preserve unrelated fields.
}, 30_000);

emulatorTest("Firestore emulator rejects deletion when a link commits after inventory", async () => {
  const { client, image, publicId } = fixture();
  const realList = client.listDocuments.bind(client);
  let intercept = true;
  client.listDocuments = async <T extends Record<string, unknown>>(
    collection: string,
    options: Parameters<FirestoreRestClient["listDocuments"]>[1] = {},
  ): Promise<FirestoreDocument<T>[]> => {
    const documents = await realList<T>(collection, options);
    if (intercept && collection === "dogs") {
      intercept = false;
      await commitDogMediaMutation(env, { kind: "create", id: "dog-a", data: { fotos: [image] } }, client);
    }
    return documents;
  };
  let calls = 0;
  await assert.rejects(() => deleteManagedMedia(env, image, client, async () => { calls++; }), /references changed/);
  assert.equal(calls, 0);
  assert.deepEqual((await client.getDocument("dogs/dog-a"))?.data.fotos, [image]);
  assert.equal((await client.getDocument(await mediaAssetPath(publicId)))?.data.state, "ready");
}, 30_000);
