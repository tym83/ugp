import { defineConfig, devices } from "@playwright/test";

// E2E бьёт по отдельной БД e2e.db (не трогает dev.db). Абсолютный путь — чтобы
// CLI-сид и рантайм-клиент указывали на один файл.
const DB_URL = "file:" + process.cwd() + "/e2e.db";

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  globalSetup: "./e2e/global-setup.ts",
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      DATABASE_URL: DB_URL,
      SESSION_SECRET: "e2e-secret-32-characters-minimum-xx",
    },
  },
});
