import { execSync } from "node:child_process";
import { rmSync } from "node:fs";

// Готовит изолированную e2e.db: чистый файл → схема → сид (демо-данные Танкоград).
export default function globalSetup() {
  const file = process.cwd() + "/e2e.db";
  const env = { ...process.env, DATABASE_URL: "file:" + file };
  for (const f of [file, file + "-journal"]) {
    try {
      rmSync(f, { force: true });
    } catch {
      /* нет файла — ок */
    }
  }
  execSync("npx prisma db push --skip-generate", { stdio: "ignore", env });
  execSync("npx tsx prisma/seed.ts", { stdio: "ignore", env });
}
