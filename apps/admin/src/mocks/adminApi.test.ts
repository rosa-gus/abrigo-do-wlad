import { beforeEach, describe, expect, test } from "vitest";

import { handleMockAdminRequest, resetMockAdminState } from "./adminApi";
import { resolveMockMediaUrl } from "./media";

function request(path: string, init?: RequestInit): Request {
  return new Request(`http://localhost${path}`, init);
}

describe("mock admin API", () => {
  beforeEach(() => resetMockAdminState());

  test("provides a local developer session", async () => {
    const response = await handleMockAdminRequest(request("/api/session"));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      email: "desenvolvedor@localhost.test",
      role: "developer",
    });
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
    const created = await createResponse.json() as { id: number };

    expect(createResponse.status).toBe(201);
    const dogResponse = await handleMockAdminRequest(request(`/api/admin/dogs/${created.id}`));
    await expect(dogResponse.json()).resolves.toMatchObject({ id: created.id, nome: "Nina" });

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
    const { id } = await create.json() as { id: number };
    const dog = await handleMockAdminRequest(request(`/api/admin/dogs/${id}`));
    await expect(dog.json()).resolves.toMatchObject({ fotos: [url] });
  });

  test("archives and restores a dog without deleting its record or duplicating adoption count", async () => {
    const initialDashboard = await handleMockAdminRequest(request("/api/admin/dashboard"));
    const initialCount = (await initialDashboard.json() as { metrics: { adoptionsViaSite: number } })
      .metrics.adoptionsViaSite;
    const archive = () => handleMockAdminRequest(request("/api/admin/dogs/103/archive", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason: "adopted_via_site" }),
    }));
    const response = await archive();
    expect(response.status).toBe(200);
    const result = await response.json() as { archivedAt: string; purgeAfter: string };
    expect(Date.parse(result.purgeAfter) - Date.parse(result.archivedAt)).toBe(30 * 86_400_000);
    expect((await archive()).status).toBe(200);
    expect((await handleMockAdminRequest(request("/api/admin/dogs/103", {
      method: "DELETE",
    }))).status).toBe(405);

    const active = await handleMockAdminRequest(request("/api/admin/dogs"));
    const archived = await handleMockAdminRequest(request("/api/admin/dogs?state=archived"));
    expect((await active.json() as Array<{ id: number }>).some((dog) => dog.id === 103)).toBe(false);
    expect(await archived.json()).toEqual([expect.objectContaining({ id: 103, nome: "Simba" })]);
    const dashboard = await handleMockAdminRequest(request("/api/admin/dashboard"));
    expect((await dashboard.json() as { metrics: { dogs: number; adoptionsViaSite: number } }).metrics)
      .toMatchObject({ dogs: 2, adoptionsViaSite: initialCount + 1 });

    const restore = await handleMockAdminRequest(request("/api/admin/dogs/103/restore", {
      method: "POST",
    }));
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
    const attach = await handleMockAdminRequest(request("/api/admin/dogs/103", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fotos: [photo] }),
    }));
    expect(attach.status).toBe(200);
    const detach = await handleMockAdminRequest(request("/api/admin/dogs/103", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fotos: [] }),
    }));
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
    const updateResponse = await handleMockAdminRequest(request(
      "/api/admin/adoptions/adoption-livia/status",
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "approved" }),
      },
    ));

    expect(updateResponse.status).toBe(200);
    const listResponse = await handleMockAdminRequest(request("/api/admin/adoptions"));
    const adoptions = await listResponse.json() as Array<{ id: string; status: string }>;
    expect(adoptions.find((item) => item.id === "adoption-livia")?.status).toBe("approved");
  });

  test("lists adoption summaries and loads sensitive details on demand", async () => {
    const listResponse = await handleMockAdminRequest(request("/api/admin/adoptions"));
    const summaries = await listResponse.json() as Array<Record<string, unknown>>;

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
    const saveResponse = await handleMockAdminRequest(request("/api/admin/notifications", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "Manutenção simulada", type: "urgent", expiration: "1h" }),
    }));
    const saved = await saveResponse.json() as { message: string; expiresAt: string | null };

    expect(saved.message).toBe("Manutenção simulada");
    expect(saved.expiresAt).not.toBeNull();

    const deleteResponse = await handleMockAdminRequest(request("/api/admin/notifications", {
      method: "DELETE",
    }));
    expect(deleteResponse.status).toBe(204);

    const getResponse = await handleMockAdminRequest(request("/api/admin/notifications"));
    await expect(getResponse.json()).resolves.toBeNull();
  });
});
