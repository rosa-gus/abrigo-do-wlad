import react from "@vitejs/plugin-react";
import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./apps/public/src"),
    },
  },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          environment: "node",
          include: [
            "apps/public/src/**/*.test.ts",
            "apps/admin/*.test.ts",
            "apps/admin/shared/**/*.test.ts",
            "apps/admin/src/**/*.test.ts",
            "apps/admin/worker/**/*.test.ts",
            "packages/**/*.test.ts",
            "scripts/**/*.test.mjs",
            "workers/**/*.test.ts",
          ],
          exclude: ["**/*.worker.test.ts"],
        },
      },
      {
        extends: true,
        test: {
          name: "frontend",
          environment: "jsdom",
          include: [
            "apps/public/src/**/*.test.tsx",
            "apps/admin/src/**/*.test.tsx",
            "packages/**/*.test.tsx",
          ],
          setupFiles: ["./apps/public/src/test/setup.ts"],
        },
      },
    ],
    coverage: {
      provider: "istanbul",
      reporter: ["text", "html", "lcov"],
      reportsDirectory: "./coverage",
      include: ["apps/public/src/**/*.{ts,tsx}", "apps/admin/worker/**/*.ts", "workers/**/*.ts"],
      exclude: [
        "**/*.test.{ts,tsx}",
        "apps/public/src/test/**",
        "apps/public/src/vite-env.d.ts",
      ],
    },
  },
});
