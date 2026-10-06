import { generateKeyPairSync } from "node:crypto";
import { env } from "cloudflare:workers";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import worker, { type AppEnv } from "./index";

const blockedFetch = vi.fn<typeof fetch>(async () => {
  throw new Error("External network access is disabled in Worker tests.");
});

function createEnv(): AppEnv {
  return {
    KV: env.KV,
    APP_ENV: "production",
    ALLOWED_ORIGIN: "https://abrigo.test",
    RECAPTCHA_SECRET_KEY: "synthetic-recaptcha-secret",
    ASSETS: {
      async fetch(request: Request): Promise<Response> {
        return new Response(`asset:${new URL(request.url).pathname}`);
      },
    },
  };
}

const dogPageDocument = `<!doctype html>
<html lang="pt-BR">
  <head>
    <title>Abrigo do Wlad</title>
    <meta name="description" content="Descrição geral">
    <meta name="robots" content="index, follow">
    <meta name="googlebot" content="index, follow">
    <link rel="canonical" href="https://abrigodowlad.com.br/">
    <meta property="og:title" content="Abrigo do Wlad">
    <meta property="og:description" content="Descrição geral">
    <meta property="og:image" content="https://abrigodowlad.com.br/og-image.jpg">
    <meta property="og:image:secure_url" content="https://abrigodowlad.com.br/og-image.jpg">
    <meta property="og:image:type" content="image/jpeg">
    <meta property="og:image:width" content="1600">
    <meta property="og:image:height" content="900">
    <meta property="og:image:alt" content="Abrigo do Wlad">
    <meta property="og:url" content="https://abrigodowlad.com.br/">
    <meta property="og:type" content="website">
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="Abrigo do Wlad">
    <meta name="twitter:description" content="Descrição geral">
    <meta name="twitter:image" content="https://abrigodowlad.com.br/og-image.jpg">
    <meta name="twitter:image:alt" content="Abrigo do Wlad">
  </head>
  <body><div id="root"></div></body>
</html>`;

function createDogPageEnv(): AppEnv {
  return {
    ...createEnv(),
    ASSETS: {
      async fetch(): Promise<Response> {
        return new Response(dogPageDocument, {
          headers: { "Content-Type": "text/html; charset=utf-8" },
        });
      },
    },
  };
}

function currentDogFeed() {
  return {
    schemaVersion: 2,
    version: "2026-08-28",
    generatedAt: "2026-08-28T14:00:00.000Z",
    dogs: [
      {
        id: "dog-1",
        publicSlug: "pacoca",
        nome: "Paçoca",
        idade: "2 anos",
        cateIdade: "adulto",
        sexo: "Macho",
        temperamento: "Dócil",
        tags: ["dócil"],
        status: "Disponível para Adoção",
        fotos: [
          "https://res.cloudinary.com/demo/image/upload/v1/dogs/pacoca.png",
        ],
        cor: "caramelo",
        descricaoCompleta: "Carinhoso, brincalhão e pronto para uma família.",
      },
    ],
  };
}

async function seedDogProfile(): Promise<void> {
  const slugRecord = {
    schemaVersion: 1,
    id: "dog-1",
    slug: "pacoca",
  };
  await env.KV.put("dogs-feed:current", JSON.stringify(currentDogFeed()));
  await env.KV.put("dogs-public-slug:slug:pacoca", JSON.stringify(slugRecord));
  await env.KV.put("dogs-public-slug:id:dog-1", JSON.stringify(slugRecord));
}

function adoptionRequest(
  body = "{}",
  headers: Record<string, string> = {},
): Request {
  return new Request("https://abrigo.test/api/adoption/create", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "https://abrigo.test",
      "X-Forwarded-For": "203.0.113.42",
      ...headers,
    },
    body,
  });
}

describe("Worker app runtime", () => {
  beforeEach(async () => {
    await env.KV.delete("rate-limit:203.0.113.0");
    await env.KV.delete("dogs-feed:current");
    await env.KV.delete("dogs-tombstone:dog-1");
    await env.KV.delete("dogs-public-slug:slug:pacoca");
    await env.KV.delete("dogs-public-slug:id:dog-1");
    blockedFetch.mockClear();
    vi.stubGlobal("fetch", blockedFetch);
  });

  afterEach(() => {
    expect(blockedFetch).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("reads the hero dog through the local KV binding", async () => {
    await env.KV.put(
      "hero-dog",
      JSON.stringify({ id: "hero-runtime", nome: "Bidu" }),
    );

    const response = await worker.fetch(
      new Request("https://abrigo.test/api/hero-dog"),
      createEnv(),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      message: "Hero dog fetched successfully.",
      data: { id: "hero-runtime", nome: "Bidu" },
    });
  });

  it("keeps unknown API routes out of the SPA fallback", async () => {
    const response = await worker.fetch(
      new Request("https://abrigo.test/api/unknown"),
      createEnv(),
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      message: "Route not found.",
    });
  });

  it("delegates non-API routes to the assets binding", async () => {
    const response = await worker.fetch(
      new Request("https://abrigo.test/sobre"),
      createEnv(),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("X-Frame-Options")).toBe("DENY");
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(response.headers.get("Referrer-Policy")).toBe(
      "strict-origin-when-cross-origin",
    );
    await expect(response.text()).resolves.toBe("asset:/sobre");
  });

  it("renders dog-specific Open Graph metadata in the initial HTML", async () => {
    await seedDogProfile();

    const response = await worker.fetch(
      new Request("https://abrigo.test/caes/pacoca"),
      createDogPageEnv(),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe(
      "public, max-age=60, s-maxage=300",
    );
    const html = await response.text();
    expect(html).toContain("<title>Paçoca para adoção | Abrigo do Wlad</title>");
    expect(html).toContain(
      'content="https://abrigodowlad.com.br/caes/pacoca"',
    );
    expect(html).toContain(
      "https://res.cloudinary.com/demo/image/upload/c_fill,w_1200,h_630,q_85,f_jpg,g_auto/v1/dogs/pacoca.png",
    );
    expect(html).toContain('content="1200"');
    expect(html).toContain('content="630"');
    expect(html).toContain('content="summary_large_image"');
  });

  it("loads a dog API profile through its public slug", async () => {
    await seedDogProfile();

    const response = await worker.fetch(
      new Request("https://abrigo.test/api/dogs/by-slug/pacoca"),
      createEnv(),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      state: "available",
      dog: { id: "dog-1", publicSlug: "pacoca", nome: "Paçoca" },
    });
  });

  it("does not expose an ID-based dog route", async () => {
    await seedDogProfile();

    const response = await worker.fetch(
      new Request("https://abrigo.test/caes/dog-1/nome-antigo?origem=share"),
      createDogPageEnv(),
    );

    expect(response.status).toBe(404);
    expect(response.headers.get("X-Robots-Tag")).toBe("noindex, nofollow");
  });

  it("returns tombstone pages as 410 with noindex metadata", async () => {
    await seedDogProfile();
    await env.KV.put("dogs-tombstone:dog-1", JSON.stringify({
      schemaVersion: 1,
      id: "dog-1",
      publicSlug: "pacoca",
      nome: "Paçoca",
      status: "adopted",
      removedAt: "2026-08-28T15:00:00.000Z",
    }));

    const response = await worker.fetch(
      new Request("https://abrigo.test/caes/pacoca"),
      createDogPageEnv(),
    );

    expect(response.status).toBe(410);
    expect(response.headers.get("X-Robots-Tag")).toBe("noindex, follow");
    const html = await response.text();
    expect(html).toContain(
      "<title>Paçoca encontrou uma família | Abrigo do Wlad</title>",
    );
    expect(html).toContain('content="noindex, follow"');
    expect(html).toContain(
      'content="https://abrigodowlad.com.br/og-image.jpg"',
    );
  });

  it("does not expose the debug email route in production", async () => {
    const response = await worker.fetch(
      new Request("https://abrigo.test/api/tests/email"),
      createEnv(),
    );

    expect(response.status).toBe(404);
  });

  it("rejects unsupported adoption methods before external boundaries", async () => {
    const response = await worker.fetch(
      new Request("https://abrigo.test/api/adoption/create"),
      createEnv(),
    );

    expect(response.status).toBe(405);
  });

  it("rejects origins that only prefix-match the allowed host", async () => {
    const response = await worker.fetch(
      adoptionRequest("{}", {
        Origin: "https://abrigo.test.attacker.example",
      }),
      createEnv(),
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      message: "Forbidden: Invalid origin",
    });
  });

  it("rejects non-JSON adoption requests", async () => {
    const response = await worker.fetch(
      adoptionRequest("plain text", { "Content-Type": "text/plain" }),
      createEnv(),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      message: "Invalid Content-Type",
    });
  });

  it("enforces the rate limit with the local KV binding", async () => {
    const appEnv = createEnv();

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const response = await worker.fetch(adoptionRequest(), appEnv);
      expect(response.status).toBe(400);
    }

    const response = await worker.fetch(adoptionRequest(), appEnv);

    expect(response.status).toBe(429);
    await expect(response.json()).resolves.toEqual({
      message: "Too many requests. Please try again later.",
    });
  });

  it("rejects an oversized body even without Content-Length", async () => {
    const oversizedBody = JSON.stringify({ value: "x".repeat(52 * 1024) });
    const request = adoptionRequest(oversizedBody);

    expect(request.headers.has("Content-Length")).toBe(false);

    const response = await worker.fetch(request, createEnv());

    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toEqual({
      message: "Request entity too large",
    });
  });

  it("serves public data through REST without exposing private fields", async () => {
    const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const appEnv: AppEnv = {
      ...createEnv(),
      FIREBASE_PROJECT_ID: "public-data-runtime",
      FIREBASE_CLIENT_EMAIL: "runtime@example.test",
      FIREBASE_PRIVATE_KEY: privateKey.export({ format: "pem", type: "pkcs8" }).toString(),
    };
    const requests: string[] = [];
    vi.stubGlobal("fetch", vi.fn<typeof fetch>(async (input, init) => {
      const url = String(input);
      requests.push(url);
      if (url === "https://oauth2.googleapis.com/token") {
        return Response.json({ access_token: "synthetic-token", expires_in: 3600 });
      }
      expect(new Headers(init?.headers).get("Authorization")).toBe("Bearer synthetic-token");
      if (url.endsWith("/documents/system/settings")) {
        return Response.json({
          name: "projects/public-data-runtime/databases/(default)/documents/system/settings",
          fields: { acceptingApplications: { booleanValue: false }, privateNote: { stringValue: "secret" } },
        });
      }
      expect(url).toContain("/documents:runQuery");
      return Response.json([{ document: {
        name: "projects/public-data-runtime/databases/(default)/documents/recycle_points/point-1",
        fields: {
          zone: { stringValue: "Centro" }, neighborhood: { stringValue: "Vila" },
          address: { stringValue: "Rua 1" }, privateNote: { stringValue: "secret" },
        },
      } }]);
    }));
    const settings = await worker.fetch(new Request("https://abrigo.test/api/system/settings"), appEnv);
    expect(settings.status).toBe(200);
    expect(await settings.json()).toEqual({ acceptingApplications: false });
    const points = await worker.fetch(new Request("https://abrigo.test/api/recycle-points"), appEnv);
    expect(points.status).toBe(200);
    expect(await points.json()).toEqual([{ id: "point-1", zone: "Centro", neighborhood: "Vila", address: "Rua 1" }]);
    expect(requests.some(url => url.includes("/documents:runQuery"))).toBe(true);
  });

  it("rejects writes to public data routes before making external requests", async () => {
    for (const path of ["/api/recycle-points", "/api/system/settings"]) {
      const response = await worker.fetch(new Request(`https://abrigo.test${path}`, { method: "POST" }), createEnv());
      expect(response.status).toBe(405);
    }
  });

});
