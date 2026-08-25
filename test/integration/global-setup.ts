import { execSync } from "node:child_process";
import { rmSync } from "node:fs";

// Готовит чистую тестовую БД (SQLite) со схемой перед интеграционными тестами.
// Абсолютный путь одноразового файла (в .gitignore); удаляем его сами (без
// prisma --force-reset, который заблокирован для AI-агентов), затем неразрушающий
// db push создаёт схему заново.
export default function setup() {
  const file = process.cwd() + "/test-int.db";
  const url = "file:" + file;
  for (const f of [file, file + "-journal"]) {
    try {
      rmSync(f, { force: true });
    } catch {
      /* нет файла — ок */
    }
  }
  execSync("npx prisma db push --skip-generate", {
    stdio: "ignore",
    env: { ...process.env, DATABASE_URL: url },
  });
}
