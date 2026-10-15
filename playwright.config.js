import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests",
  testMatch: "**/*.spec.js",
  timeout: 180000,
  expect: { timeout: 15000 },
  workers: 1,
  reporter: [["list"], ["json", { outputFile: "tests/browser-results.json" }]],
  use: {
    baseURL: process.env.GAME_URL || "http://localhost:5173",
    viewport: { width: 1440, height: 960 },
    headless: true,
    launchOptions: { args: ["--no-sandbox", "--enable-unsafe-swiftshader"] },
  },
});
