import { defineConfig } from "vite";
export default defineConfig({
  server: { host: "0.0.0.0", allowedHosts: true },
  build: { target: "es2022" },
});
