import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const packageRoot = fileURLToPath(new URL("..", import.meta.url));

export default defineConfig({
  root: packageRoot,
  plugins: [react()],
  server: {
    host: "127.0.0.1",
  },
});
