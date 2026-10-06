import path from "node:path";
import { cloudflare } from "@cloudflare/vite-plugin";
import react from "@vitejs/plugin-react";
import { defineConfig, type ConfigEnv, type UserConfig } from "vite";
import { createLocalAdminBoundary } from "./local-boundary";

// https://vite.dev/config/
export function createAdminViteConfig({ command, isPreview, mode }: ConfigEnv): UserConfig {
  const enableLocalAdmin = command === "serve" && !isPreview && mode === "local-admin";
  const enableMockAdmin = command === "serve" && !isPreview && mode === "mock";
  const enableLocalWorker = command === "serve" && !isPreview && !enableMockAdmin;

  if (mode === "mock" && (command !== "serve" || isPreview)) {
    throw new Error("O modo mock do painel só pode ser usado pelo servidor de desenvolvimento.");
  }

  if (mode === "local-admin" && !enableLocalAdmin) {
    throw new Error("O modo local-admin só pode ser usado pelo servidor de desenvolvimento.");
  }
  if (command === "build" && (
    mode !== "production" ||
    (process.env.CLOUDFLARE_ENV && process.env.CLOUDFLARE_ENV !== "production")
  )) {
    throw new Error("O build do painel exige modo production e não aceita ambientes Cloudflare de desenvolvimento.");
  }
  if (enableLocalAdmin && process.env.CLOUDFLARE_ENV !== "local") {
    throw new Error("Use npm run dev:admin:local para iniciar o painel local.");
  }
  const localRole = process.env.ADMIN_LOCAL_ROLE ?? "administrator";
  if (enableLocalAdmin && localRole !== "administrator" && localRole !== "developer") {
    throw new Error("ADMIN_LOCAL_ROLE deve ser administrator ou developer.");
  }

  return {
    server: {
      ...(enableLocalAdmin ? { host: "127.0.0.1", allowedHosts: [] } : {}),
      port: 5174,
      strictPort: true,
    },
    define: {
      "import.meta.env.ADMIN_MOCK_MODE": JSON.stringify(enableMockAdmin),
      "import.meta.env.ADMIN_LOCAL_MODE": JSON.stringify(enableLocalAdmin),
      __ADMIN_LOCAL_WORKER__: JSON.stringify(enableLocalAdmin),
      __ADMIN_LOCAL_ROLE__: JSON.stringify(enableLocalAdmin ? localRole : "administrator"),
    },
    envDir: enableMockAdmin ? false : path.resolve(__dirname, "../.."),
    plugins: [
      react(),
      ...(enableLocalAdmin ? [{
        name: "admin-local-boundary",
        configResolved(config) {
          if (config.server.host !== "127.0.0.1" || config.server.port !== 5174) {
            throw new Error("O painel local deve escutar somente em 127.0.0.1:5174.");
          }
        },
        configureServer(server) {
          server.middlewares.use(createLocalAdminBoundary());
        },
      } satisfies import("vite").Plugin] : []),
      ...(enableLocalWorker
        ? [cloudflare({
            configPath: path.resolve(__dirname, "wrangler.jsonc"),
            ...(enableLocalAdmin ? {
              remoteBindings: false,
              tunnel: false,
              inspectorPort: false,
              config: (config) => ({
                main: path.resolve(__dirname, "worker/local.ts"),
                // Serve dev pages directly in Vite; ASSETS would re-enter the HTTP boundary.
                assets: { ...config.assets, run_worker_first: ["/api/*"] },
                secrets: { required: [
                  "FIREBASE_PROJECT_ID", "FIREBASE_CLIENT_EMAIL", "FIREBASE_PRIVATE_KEY",
                  "MASTER_KEY", "CLOUDINARY_CLOUD_NAME", "CLOUDINARY_API_KEY", "CLOUDINARY_API_SECRET",
                ] },
              }),
            } : {}),
          })]
        : []),
    ],
  };
}

export default defineConfig(createAdminViteConfig);
