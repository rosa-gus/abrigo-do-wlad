import path from "node:path";
import { cloudflare } from "@cloudflare/vite-plugin";
import react from "@vitejs/plugin-react";
import { defineConfig, type ConfigEnv, type UserConfig } from "vite";

// https://vite.dev/config/
export function createAdminViteConfig({ command, isPreview, mode }: ConfigEnv): UserConfig {
  const enableMockAdmin = command === "serve" && !isPreview && mode === "mock";
  const enableLocalWorker = command === "serve" && !isPreview && !enableMockAdmin;

  if (mode === "mock" && (command !== "serve" || isPreview)) {
    throw new Error("O modo mock do painel só pode ser usado pelo servidor de desenvolvimento.");
  }

  return {
    server: {
      port: 5174,
      strictPort: true,
    },
    define: {
      "import.meta.env.ADMIN_MOCK_MODE": JSON.stringify(enableMockAdmin),
    },
    envDir: enableMockAdmin ? false : path.resolve(__dirname, "../.."),
    plugins: [
      react(),
      ...(enableLocalWorker
        ? [cloudflare({ configPath: path.resolve(__dirname, "wrangler.jsonc") })]
        : []),
    ],
  };
}

export default defineConfig(createAdminViteConfig);
