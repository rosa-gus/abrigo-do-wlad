import path from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";

import { createAdminViteConfig } from "./vite.config";

const MOCK_MODE_ERROR =
  "O modo mock do painel só pode ser usado pelo servidor de desenvolvimento.";

afterEach(() => vi.unstubAllEnvs());

describe("admin Vite authentication boundary", () => {
  test.each([
    { command: "build" as const, isPreview: false },
    { command: "serve" as const, isPreview: true },
  ])("rejects local-admin outside development", ({ command, isPreview }) => {
    expect(() => createAdminViteConfig({ command, isPreview, mode: "local-admin" }))
      .toThrow("O modo local-admin só pode ser usado pelo servidor de desenvolvimento.");
  });

  test("restricts local development to loopback and enables only its compile-time flag", () => {
    vi.stubEnv("CLOUDFLARE_ENV", "local");
    vi.stubEnv("ADMIN_LOCAL_ROLE", undefined);
    const config = createAdminViteConfig({ command: "serve", isPreview: false, mode: "local-admin" });
    expect(config.server).toMatchObject({ host: "127.0.0.1", port: 5174, strictPort: true });
    expect(config.define).toMatchObject({
      __ADMIN_LOCAL_WORKER__: "true",
      __ADMIN_LOCAL_ROLE__: '"administrator"',
      "import.meta.env.ADMIN_MOCK_MODE": "false",
    });
  });

  test("rejects local development with the wrong Cloudflare environment", () => {
    vi.stubEnv("CLOUDFLARE_ENV", "production");
    expect(() => createAdminViteConfig({ command: "serve", isPreview: false, mode: "local-admin" }))
      .toThrow("Use npm run dev:admin:local");
  });

  test("allows explicit developer role but rejects invalid roles", () => {
    vi.stubEnv("CLOUDFLARE_ENV", "local");
    vi.stubEnv("ADMIN_LOCAL_ROLE", "developer");
    expect(createAdminViteConfig({ command: "serve", isPreview: false, mode: "local-admin" }).define)
      .toMatchObject({ __ADMIN_LOCAL_ROLE__: '"developer"' });
    vi.stubEnv("ADMIN_LOCAL_ROLE", "owner");
    expect(() => createAdminViteConfig({ command: "serve", isPreview: false, mode: "local-admin" }))
      .toThrow("ADMIN_LOCAL_ROLE deve ser administrator ou developer.");
  });

  test("rejects a development build or a production build targeting local", () => {
    expect(() => createAdminViteConfig({ command: "build", mode: "development" }))
      .toThrow("O build do painel exige modo production");
    vi.stubEnv("CLOUDFLARE_ENV", "local");
    expect(() => createAdminViteConfig({ command: "build", mode: "production" }))
      .toThrow("O build do painel exige modo production");
  });
  test("enables the mock identity only in the mock development server", () => {
    const config = createAdminViteConfig({
      command: "serve",
      isPreview: false,
      mode: "mock",
    });

    expect(config.define).toMatchObject({
      "import.meta.env.ADMIN_MOCK_MODE": "true",
    });
    expect(config.envDir).toBe(false);
    expect(config.server).toMatchObject({ port: 5174, strictPort: true });
    expect(config.plugins).toHaveLength(1);
  });

  test.each([
    { command: "build" as const, isPreview: false, label: "build" },
    { command: "serve" as const, isPreview: true, label: "preview" },
  ])("rejects mock mode during $label", ({ command, isPreview }) => {
    expect(() => createAdminViteConfig({ command, isPreview, mode: "mock" }))
      .toThrow(MOCK_MODE_ERROR);
  });

  test("keeps the mock identity disabled in production builds", () => {
    const config = createAdminViteConfig({
      command: "build",
      isPreview: false,
      mode: "production",
    });

    expect(config.define).toMatchObject({
      "import.meta.env.ADMIN_MOCK_MODE": "false",
      __ADMIN_LOCAL_WORKER__: "false",
    });
    expect(config.envDir).toBe(path.resolve(__dirname, "../.."));
  });

  test("keeps the authenticated Worker enabled in regular development", () => {
    const config = createAdminViteConfig({
      command: "serve",
      isPreview: false,
      mode: "development",
    });

    expect(config.define).toMatchObject({
      "import.meta.env.ADMIN_MOCK_MODE": "false",
    });
    expect(config.envDir).toBe(path.resolve(__dirname, "../.."));
    expect(config.plugins).toHaveLength(2);
    expect(config.server).toMatchObject({ port: 5174, strictPort: true });
  });
});
