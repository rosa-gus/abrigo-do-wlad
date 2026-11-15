import { afterEach, expect, test, vi } from "vitest";
import { FirestoreRestClient } from "../_lib/firestore";
import type { CloudflareEnv } from "../_lib/env";
import { onRequest } from "./get";
import { updateHeroDog } from "./update";

afterEach(() => vi.restoreAllMocks());

const dog = {
  nome: "Nina", idade: "2 anos", cateIdade: "adulto", sexo: "Fêmea",
  temperamento: "Dócil", tags: [], status: "Apenas Castrado", fotos: [], cor: "caramelo",
};

function setup() {
  const values = new Map<string, string>([["hero-dog", JSON.stringify({ id: "old", ...dog })]]);
  const env: CloudflareEnv = {
    APP_ENV: "production", FIREBASE_PROJECT_ID: "test",
    KV: { get: async key => values.get(key) ?? null,
      put: async (key, value) => { values.set(key, String(value)); },
      delete: async key => { values.delete(key); } },
  };
  return { env, values };
}

test.each(["draft", undefined])("a cached highlight cannot expose an unpublished dog (%s)", async publicationStatus => {
  const { env } = setup();
  vi.spyOn(FirestoreRestClient.prototype, "getDocument").mockResolvedValue({
    id: "old", name: "dogs/old", data: { ...dog, publicationStatus },
  });
  const response = await onRequest({ request: new Request("https://abrigo.test/api/hero-dog"), env });
  expect(response.status).toBe(404);
  expect(await response.text()).not.toContain("Nina");
});

test("highlight refresh selects only published dogs and stores only public fields", async () => {
  const { env, values } = setup();
  vi.spyOn(FirestoreRestClient.prototype, "listDocuments").mockResolvedValue([
    { id: "draft", name: "dogs/draft", data: { ...dog, publicationStatus: "draft" } },
    { id: "published", name: "dogs/published", data: {
      ...dog, publicationStatus: "published", retainedPhotos: ["internal"], archivedBy: "private@example.test",
    } },
  ]);
  expect((await updateHeroDog(env)).status).toBe(200);
  const cached = JSON.parse(values.get("hero-dog")!);
  expect(cached.id).toBe("published");
  expect(cached.publicSlug).toBe("nina");
  expect(cached.retainedPhotos).toBeUndefined();
  expect(cached.archivedBy).toBeUndefined();
});
