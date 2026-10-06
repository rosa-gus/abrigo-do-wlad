import { cloudflareTest } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

// Worker tests must use only the synthetic bindings declared below.
process.env.CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV = "false";
process.env.WRANGLER_WRITE_LOGS = "false";

export default defineConfig({
  plugins: [
    cloudflareTest({
      remoteBindings: false,
      wrangler: {
        configPath: "./wrangler.jsonc",
      },
      miniflare: {
        bindings: {
          APP_ENV: "test",
          ALLOWED_ORIGIN: "https://abrigo.test",
          RECAPTCHA_SECRET_KEY: "synthetic-recaptcha-secret",
          MASTER_KEY: "synthetic-master-key",
          FIREBASE_PROJECT_ID: "synthetic-project",
          FIREBASE_CLIENT_EMAIL: "worker-tests@example.test",
          FIREBASE_PRIVATE_KEY: "synthetic-private-key",
          EMAIL_WEBHOOK_URL: "https://script.google.com/macros/s/test/exec",
          EMAIL_WEBHOOK_SECRET: "synthetic-webhook-secret",
          ADMIN_PANEL_URL: "https://admin.abrigo.test",
        },
      },
    }),
  ],
  test: {
    name: "worker",
    include: ["workers/**/*.worker.test.ts"],
    coverage: {
      provider: "istanbul",
      reporter: ["text", "html", "lcov"],
      reportsDirectory: "./coverage/worker",
      include: ["workers/**/*.ts"],
      exclude: ["**/*.test.ts", "**/*.worker.test.ts"],
    },
  },
});
