import { beforeEach, describe, expect, test, vi } from "vitest";

import { handleMockAdminRequest, resetMockAdminState } from "./adminApi";
import { resolveMockMediaUrl } from "./media";

function request(path: string, init?: RequestInit): Request {
  return new Request(`http://localhost${path}`, init);
}

async function currentDogMutation(path: string, init: RequestInit): Promise<Response> {
  const detailPath = path.replace(/\/(?:archive|restore)$/, "");
  const detail = await handleMockAdminRequest(request(detailPath));
  return handleMockAdminRequest(request(path, {
    ...init, headers: { ...init.headers, "If-Match": detail.headers.get("ETag") ?? "" },
  }));
}

describe("mock admin API", () => {
  beforeEach(() => resetMockAdminState());

  test("migration preview stays read-only and application changes only the simulated history", async () => {
    const initial = await (await handleMockAdminRequest(request("/api/admin/migrations"))).json();
    const post = (path: string) => handleMockAdminRequest(request(`/api/admin/migrations/${path}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ project: initial.project, release: initial.release }),
    }));
    const preview = await (await post("plan")).json();
    expect(preview.cursor).toBeNull();
    expect((await (await handleMockAdminRequest(request("/api/admin/migrations"))).json()).migrations[0].status).toBe("pending");
    const applied = await (await post("apply")).json();
    expect(applied.migrations[0].status).toBe("completed");
    expect(applied.project).toBe("abrigo-mock");
  });

  test("provides a local developer session", async () => {
    const response = await handleMockAdminRequest(request("/api/session"));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      email: "desenvolvedor@localhost.test",
      role: "developer",
    });
  });

  test("creates independently editable documents when both creations have the same clock", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-16T10:00:00Z"));
    try {
      const create = () => handleMockAdminRequest(request("/api/admin/dogs", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ nome: "Mesmo nome" }),
      }));
      const first = await (await create()).json() as { documentId: string };
      const second = await (await create()).json() as { documentId: string };
      expect(first.documentId).not.toBe(second.documentId);
      const edit = await currentDogMutation(`/api/admin/dogs/doc:${first.documentId}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ nome: "Primeiro" }),
      });
      expect(edit.status).toBe(200);
      const other = await handleMockAdminRequest(request(`/api/admin/dogs/doc:${second.documentId}`));
      await expect(other.json()).resolves.toMatchObject({ documentId: second.documentId, nome: "Mesmo nome" });
    } finally { vi.useRealTimers(); }
  });

  test("rejects mutation from an old dog screen and preserves the newer revision", async () => {
    const initial = await handleMockAdminRequest(request("/api/admin/dogs/doc:mock-dog-103"));
    const staleRevision = initial.headers.get("ETag")!;
    expect((await currentDogMutation("/api/admin/dogs/doc:mock-dog-103", {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ nome: "Novo nome" }),
    })).status).toBe(200);
    for (const suffix of ["", "/archive", "/restore"]) {
      const rejected = await handleMockAdminRequest(request(`/api/admin/dogs/doc:mock-dog-103${suffix}`, {
        method: suffix ? "POST" : "DELETE", headers: { "If-Match": staleRevision, "Content-Type": "application/json" },
        ...(suffix === "/archive" ? { body: JSON.stringify({ reason: "other" }) } : {}),
      }));
      expect(rejected.status).toBe(412);
    }
    const latest = await handleMockAdminRequest(request("/api/admin/dogs/doc:mock-dog-103"));
    await expect(latest.json()).resolves.toMatchObject({ nome: "Novo nome", documentId: "mock-dog-103" });
  });

  test("keeps dog mutations in memory and updates dashboard metrics", async () => {
    const createResponse = await handleMockAdminRequest(request("/api/admin/dogs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        nome: "Nina",
        idade: "2 anos",
        cateIdade: "adulto",
        sexo: "Fêmea",
        temperamento: "Dócil",
        tags: ["Dócil"],
        status: "Vacinado e Castrado",
        fotos: [],
        cor: "caramelo",
      }),
    }));
    const created = await createResponse.json() as { id: string; documentId: string };

    expect(createResponse.status).toBe(201);
    const dogResponse = await handleMockAdminRequest(request(`/api/admin/dogs/doc:${created.documentId}`));
    await expect(dogResponse.json()).resolves.toMatchObject({ documentId: created.documentId, nome: "Nina" });

    const dashboardResponse = await handleMockAdminRequest(request("/api/admin/dashboard"));
    const dashboard = await dashboardResponse.json() as { metrics: { dogs: number } };
    expect(dashboard.metrics.dogs).toBe(4);
  });

  test("mock uploads return a valid HTTPS dog photo URL with a local preview", async () => {
    const formData = new FormData();
    formData.append("file", new File(["fictitious image"], "dog.png", { type: "image/png" }));
    const upload = await handleMockAdminRequest(request("/api/admin/media/upload", {
      method: "POST", body: formData,
    }));
    expect(upload.status).toBe(201);
    const { url } = await upload.json() as { url: string };
    expect(url).toMatch(/^https:\/\/mock-media\.invalid\//);
    expect(resolveMockMediaUrl(url)).toMatch(/^blob:/);

    const create = await handleMockAdminRequest(request("/api/admin/dogs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        nome: "Nina",
        idade: "2 anos",
        cateIdade: "adulto",
        sexo: "Fêmea",
        temperamento: "Dócil",
        tags: ["Dócil"],
        status: "Vacinado e Castrado",
        fotos: [url],
        cor: "caramelo",
      }),
    }));
    expect(create.status).toBe(201);
    const { documentId } = await create.json() as { documentId: string };
    const dog = await handleMockAdminRequest(request(`/api/admin/dogs/doc:${documentId}`));
    await expect(dog.json()).resolves.toMatchObject({ fotos: [url] });
  });

  test("archives and restores a dog without deleting its record or duplicating adoption count", async () => {
    const initialDashboard = await handleMockAdminRequest(request("/api/admin/dashboard"));
    const initialCount = (await initialDashboard.json() as { metrics: { adoptionsViaSite: number } })
      .metrics.adoptionsViaSite;
    const archive = () => currentDogMutation("/api/admin/dogs/103/archive", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason: "adopted_via_site" }),
    });
    const response = await archive();
    expect(response.status).toBe(200);
    const result = await response.json() as { archivedAt: string; purgeAfter: string };
    expect(Date.parse(result.purgeAfter) - Date.parse(result.archivedAt)).toBe(30 * 86_400_000);
    expect((await archive()).status).toBe(200);
    expect((await currentDogMutation("/api/admin/dogs/103", {
      method: "DELETE",
    })).status).toBe(409);

    const active = await handleMockAdminRequest(request("/api/admin/dogs"));
    const archived = await handleMockAdminRequest(request("/api/admin/dogs?state=archived"));
    expect((await active.json() as { items: Array<{ id: number }> }).items.some((dog) => dog.id === 103)).toBe(false);
    expect(await archived.json()).toEqual({ items: [expect.objectContaining({ id: 103, nome: "Simba" })], nextCursor: null });
    const dashboard = await handleMockAdminRequest(request("/api/admin/dashboard"));
    expect((await dashboard.json() as { metrics: { dogs: number; adoptionsViaSite: number } }).metrics)
      .toMatchObject({ dogs: 2, adoptionsViaSite: initialCount + 1 });

    const restore = await currentDogMutation("/api/admin/dogs/103/restore", {
      method: "POST",
    });
    expect(restore.status).toBe(200);
    const restored = await handleMockAdminRequest(request("/api/admin/dogs/103"));
    await expect(restored.json()).resolves.toMatchObject({ id: 103, archivedAt: null });
    expect((await archive()).status).toBe(200);
    const dashboardAgain = await handleMockAdminRequest(request("/api/admin/dashboard"));
    expect((await dashboardAgain.json() as { metrics: { adoptionsViaSite: number } }).metrics.adoptionsViaSite)
      .toBe(initialCount + 1);
  });

  test("retains removed dog photos and refuses direct deletion of linked media", async () => {
    const photo = "https://res.cloudinary.com/example/image/upload/dog.jpg";
    const attach = await currentDogMutation("/api/admin/dogs/103", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fotos: [photo] }),
    });
    expect(attach.status).toBe(200);
    const detach = await currentDogMutation("/api/admin/dogs/103", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fotos: [] }),
    });
    expect(detach.status).toBe(200);
    const dog = await handleMockAdminRequest(request("/api/admin/dogs/103"));
    await expect(dog.json()).resolves.toMatchObject({ retainedPhotos: [photo] });
    const removeMedia = await handleMockAdminRequest(request("/api/admin/media/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ imageUrl: photo }),
    }));
    expect(removeMedia.status).toBe(409);
  });

  test("rejects dog temperament longer than 80 characters", async () => {
    const response = await handleMockAdminRequest(request("/api/admin/dogs/103", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ temperamento: "a".repeat(81) }),
    }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "O temperamento deve ter no máximo 80 caracteres.",
    });
  });

  test("rejects free-form dog ages", async () => {
    const response = await handleMockAdminRequest(request("/api/admin/dogs/103", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idade: "aaaaaaaaaaaaaaaa" }),
    }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Informe uma idade válida, como 1 ano, 8 meses ou 2-3 anos.",
    });
  });

  test("updates an adoption status without external storage", async () => {
    const detail = await handleMockAdminRequest(request("/api/admin/adoptions/adoption-livia"));
    const updateResponse = await handleMockAdminRequest(request(
      "/api/admin/adoptions/adoption-livia/status",
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "If-Match": detail.headers.get("ETag")! },
        body: JSON.stringify({ status: "approved" }),
      },
    ));

    expect(updateResponse.status).toBe(200);
    const listResponse = await handleMockAdminRequest(request("/api/admin/adoptions"));
    const { items: adoptions } = await listResponse.json() as { items: Array<{ id: string; status: string }> };
    expect(adoptions.find((item) => item.id === "adoption-livia")?.status).toBe("approved");
  });

  test("lists adoption summaries and loads sensitive details on demand", async () => {
    const listResponse = await handleMockAdminRequest(request("/api/admin/adoptions"));
    const { items: summaries } = await listResponse.json() as { items: Array<Record<string, unknown>> };

    expect(summaries[0]).toMatchObject({
      id: "adoption-livia",
      nome_adotante: "Fulana de Tal",
      animal_especifico: "Simba",
    });
    expect(summaries[0]).not.toHaveProperty("email");
    expect(summaries[0]).not.toHaveProperty("endereco");

    const detailResponse = await handleMockAdminRequest(request(
      "/api/admin/adoptions/adoption-livia",
    ));
    await expect(detailResponse.json()).resolves.toMatchObject({
      id: "adoption-livia",
      email: "livia@example.test",
      endereco: "Morumbi, São Paulo - SP",
    });
  });

  test("supports notification creation and deletion", async () => {
    const original = await handleMockAdminRequest(request("/api/admin/notifications"));
    const saveResponse = await handleMockAdminRequest(request("/api/admin/notifications", {
      method: "PUT",
      headers: { "Content-Type": "application/json", "If-Match": original.headers.get("ETag")! },
      body: JSON.stringify({ message: "Manutenção simulada", type: "urgent", expiration: "1h" }),
    }));
    const saved = await saveResponse.json() as { message: string; expiresAt: string | null; revision: string };

    expect(saved.message).toBe("Manutenção simulada");
    expect(saved.expiresAt).not.toBeNull();

    const deleteResponse = await handleMockAdminRequest(request("/api/admin/notifications", {
      method: "DELETE",
      headers: { "If-Match": `"${saved.revision}"` },
    }));
    expect(deleteResponse.status).toBe(204);

    const getResponse = await handleMockAdminRequest(request("/api/admin/notifications"));
    await expect(getResponse.json()).resolves.toBeNull();
    expect(getResponse.headers.get("ETag")).toBe('"absent"');
  });

  test.each([
    { resource: "system/settings", method: "PATCH", mutation: "system/settings", body: { acceptingApplications: false }, field: "acceptingApplications", value: false },
    { resource: "recycle-points/eco-morumbi", method: "PATCH", mutation: "recycle-points/eco-morumbi", body: { name: "Nome mais recente" }, field: "name", value: "Nome mais recente" },
    { resource: "adoptions/adoption-livia", method: "PATCH", mutation: "adoptions/adoption-livia/status", body: { status: "approved" }, field: "status", value: "approved" },
    { resource: "notifications", method: "PUT", mutation: "notifications", body: { message: "Aviso mais recente", type: "info", expiration: "until_deleted" }, field: "message", value: "Aviso mais recente" },
  ])("two readers of $resource cannot overwrite a newer result", async ({ resource, method, mutation, body, field, value }) => {
    const first = await handleMockAdminRequest(request(`/api/admin/${resource}`));
    const second = await handleMockAdminRequest(request(`/api/admin/${resource}`));
    const observed = first.headers.get("ETag")!;
    expect(observed).toBe(second.headers.get("ETag"));
    const mutate = (expected?: string) => handleMockAdminRequest(request(`/api/admin/${mutation}`, {
      method, headers: { "Content-Type": "application/json", ...(expected ? { "If-Match": expected } : {}) }, body: JSON.stringify(body),
    }));
    expect((await mutate()).status).toBe(428);
    expect((await mutate(observed)).status).toBe(200);
    expect((await mutate(observed)).status).toBe(412);
    if (resource === "notifications" || resource.startsWith("recycle-points")) {
      const remove = await handleMockAdminRequest(request(`/api/admin/${resource}`, { method: "DELETE", headers: { "If-Match": observed } }));
      expect(remove.status).toBe(412);
    }
    const latest = await handleMockAdminRequest(request(`/api/admin/${resource}`));
    expect(latest.headers.get("ETag")).not.toBe(observed);
    expect(await latest.json()).toMatchObject({ [field]: value });
    const audit = await (await handleMockAdminRequest(request("/api/admin/audit-log"))).json();
    expect(audit).toHaveLength(1);
  });

  test("notification expiry hides its value while preserving the stored revision for safe replacement", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-16T10:00:00Z"));
    resetMockAdminState();
    try {
      const initial = await handleMockAdminRequest(request("/api/admin/notifications"));
      const saved = await handleMockAdminRequest(request("/api/admin/notifications", {
        method: "PUT", headers: { "If-Match": initial.headers.get("ETag")!, "Content-Type": "application/json" },
        body: JSON.stringify({ message: "Temporário", type: "info", expiration: "1h" }),
      }));
      const notification = await saved.json() as { revision: string; expiresAt: string };
      vi.setSystemTime(new Date(notification.expiresAt));
      const expired = await handleMockAdminRequest(request("/api/admin/notifications"));
      expect(await expired.json()).toBeNull();
      expect(expired.headers.get("ETag")).toBe(`"${notification.revision}"`);
      expect((await handleMockAdminRequest(request("/api/admin/notifications", {
        method: "DELETE", headers: { "If-Match": expired.headers.get("ETag")! },
      }))).status).toBe(204);
    } finally { vi.useRealTimers(); }
  });

  test("key rotation requires the observed resource revision and never exposes key material", async () => {
    const original = await handleMockAdminRequest(request("/api/admin/system-keys"));
    const expected = original.headers.get("ETag")!;
    const before = await original.json() as { id: string; active: boolean }[];
    const rotate = (etag?: string) => handleMockAdminRequest(request("/api/admin/system-keys/rotate", {
      method: "POST", headers: etag ? { "If-Match": etag } : {},
    }));
    expect((await rotate()).status).toBe(428);
    expect((await rotate(expected)).status).toBe(201);
    expect((await rotate(expected)).status).toBe(412);
    const latest = await handleMockAdminRequest(request("/api/admin/system-keys"));
    expect(latest.headers.get("ETag")).not.toBe(expected);
    const keys = await latest.json() as { id: string; active: boolean; key?: string }[];
    expect(keys).toHaveLength(before.length + 1);
    expect(keys.filter(key => key.active)).toHaveLength(1);
    expect(keys.every(key => key.key === undefined)).toBe(true);
    const audit = await (await handleMockAdminRequest(request("/api/admin/audit-log"))).json();
    expect(audit).toHaveLength(1);
  });

  test("mock expiry applies to adoption list, details and metrics at the exact deadline without cleanup", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-16T10:00:00Z"));
    resetMockAdminState();
    try {
      const detail = await handleMockAdminRequest(request("/api/admin/adoptions/adoption-livia"));
      const original = await detail.json() as { expiresAt: string; revision: string };
      expect(detail.headers.get("ETag")).toBe(`"${original.revision}"`);
      vi.setSystemTime(new Date(original.expiresAt));
      const { items: list } = await (await handleMockAdminRequest(request("/api/admin/adoptions"))).json() as { items: { id: string; revision: string }[] };
      expect(list.map(item => item.id)).not.toContain("adoption-livia");
      expect(list.every(item => Boolean(item.revision))).toBe(true);
      expect((await handleMockAdminRequest(request("/api/admin/adoptions/adoption-livia"))).status).toBe(404);
      const dashboard = await (await handleMockAdminRequest(request("/api/admin/dashboard"))).json() as { metrics: { adoptions: number }; expiringAdoptions: { id: string }[] };
      expect(dashboard.metrics.adoptions).toBe(2);
      expect(dashboard.expiringAdoptions.map(item => item.id)).not.toContain("adoption-livia");
    } finally { vi.useRealTimers(); }
  });
});
