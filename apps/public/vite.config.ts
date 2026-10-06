import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { cloudflare } from "@cloudflare/vite-plugin";
import path from "path";

// https://vite.dev/config/
export default defineConfig(({ command, isPreview, mode }) => {
  const repositoryRoot = path.resolve(__dirname, "../..");
  const enableDevelopmentTools = command === "serve" && !isPreview;

  if (command === "build") {
    const env = loadEnv(mode, repositoryRoot, "");
    const requiredBuildVars = [
      "VITE_RECAPTCHA_PUBLIC_KEY",
    ];
    const missingBuildVars = requiredBuildVars.filter(
      (name) => !env[name]?.trim(),
    );

    if (missingBuildVars.length > 0) {
      throw new Error(
        `Build interrompido: defina as variáveis públicas no ambiente de build do Worker: ${missingBuildVars.join(", ")}`,
      );
    }
  }

  return {
    define: {
      "import.meta.env.PUBLIC_DEV_TOOLS": JSON.stringify(enableDevelopmentTools),
      __ADOPTION_RECAPTCHA_BYPASS__: JSON.stringify(enableDevelopmentTools),
    },
    envDir: repositoryRoot,
    plugins: [
      react(),
      cloudflare({ configPath: path.resolve(repositoryRoot, "wrangler.jsonc") }),
    ],
    build: {
      outDir: path.resolve(repositoryRoot, "dist"),
      emptyOutDir: true,
    },
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
  };
});
