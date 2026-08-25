import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Интеграционные тесты бьют по реальной Prisma/SQLite (отдельная тестовая БД).
// Абсолютный путь — чтобы CLI (db push), клиент и очистка указывали на один файл.
// Запуск: npx vitest run --config vitest.integration.config.ts
const DB_URL = "file:" + process.cwd() + "/test-int.db";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    include: ["test/integration/**/*.test.ts"],
    globalSetup: ["./test/integration/global-setup.ts"],
    fileParallelism: false,
    env: {
      DATABASE_URL: DB_URL,
      SESSION_SECRET: "test-secret-32-characters-minimum-x",
      NODE_ENV: "test",
    },
  },
});
