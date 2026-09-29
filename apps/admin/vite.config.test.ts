import path from "node:path";
import { describe, expect, test } from "vitest";

import { createAdminViteConfig } from "./vite.config";

const MOCK_MODE_ERROR =
  "O modo mock do painel só pode ser usado pelo servidor de desenvolvimento.";

describe("admin Vite authentication boundary", () => {
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
