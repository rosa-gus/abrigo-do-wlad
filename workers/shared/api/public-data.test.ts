import { expect, test, vi } from "vitest";
import { FirestoreRestClient } from "./_lib/firestore";
import { getPublicDataResponse } from "./public-data";

function client(fields: Record<string, unknown>, collection = false) {
  const fetcher = vi.fn<typeof fetch>(async () => Response.json(collection
    ? [{ document: { name: "projects/test/databases/(default)/documents/recycle_points/point-1", fields } }]
    : { name: "projects/test/databases/(default)/documents/system/settings", fields }));
  const rest = new FirestoreRestClient("test", {
    fetcher, tokenProvider: async () => "synthetic-token",
  });
  return { rest, fetcher };
}

test("returns only public recycling fields through the REST client", async () => {
  const { rest, fetcher } = client({
    zone: { stringValue: "Centro" }, neighborhood: { stringValue: "Vila" },
    address: { stringValue: "Rua 1" }, name: { stringValue: "Ponto" },
    googleMapsUrl: { stringValue: "https://maps.google.com/point" },
    privateNote: { stringValue: "sensitive" }, id: { stringValue: "spoofed" },
  }, true);
  const response = await getPublicDataResponse(new Request("https://abrigo.test/api/recycle-points"), {}, () => rest);
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual([{
    id: "point-1", zone: "Centro", neighborhood: "Vila", address: "Rua 1", name: "Ponto",
    googleMapsUrl: "https://maps.google.com/point",
  }]);
  expect(String(fetcher.mock.calls[0]?.[0])).toContain("/documents:runQuery");
  const query = JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body));
  expect(query.structuredQuery.from).toEqual([{ collectionId: "recycle_points" }]);
});
test("returns only the form availability setting and preserves false", async () => {
  const { rest } = client({ acceptingApplications: { booleanValue: false }, secret: { stringValue: "private" } });
  const response = await getPublicDataResponse(new Request("https://abrigo.test/api/system/settings"), {}, () => rest);
  expect(await response.json()).toEqual({ acceptingApplications: false });
});
test("defaults to an open form when the settings document is absent", async () => {
  const rest = new FirestoreRestClient("test", {
    fetcher: async () => new Response("missing", { status: 404 }), tokenProvider: async () => "synthetic-token",
  });
  const response = await getPublicDataResponse(new Request("https://abrigo.test/api/system/settings"), {}, () => rest);
  expect(await response.json()).toEqual({ acceptingApplications: true });
});
test("rejects writes and arbitrary document paths before accessing Firestore", async () => {
  const createClient = vi.fn(() => { throw new Error("must not be called"); });
  for (const path of ["/api/recycle-points", "/api/system/settings"]) {
    const response = await getPublicDataResponse(new Request(`https://abrigo.test${path}`, { method: "POST" }), {}, createClient);
    expect(response.status).toBe(405);
    expect(response.headers.get("Allow")).toBe("GET");
  }
  const response = await getPublicDataResponse(new Request("https://abrigo.test/api/system/keys"), {}, createClient);
  expect(response.status).toBe(404);
  expect(createClient).not.toHaveBeenCalled();
});
test("upstream failure returns a generic non-cacheable 503", async () => {
  const { rest, fetcher } = client({});
  fetcher.mockRejectedValue(new Error("private credentials"));
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    const response = await getPublicDataResponse(new Request("https://abrigo.test/api/system/settings"), {}, () => rest);
    expect(response.status).toBe(503);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(JSON.stringify(await response.json())).not.toContain("private credentials");
  } finally { log.mockRestore(); }
});
