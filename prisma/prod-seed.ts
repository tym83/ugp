// Прод-инициализация. Идемпотентно: наполняет демо-данными ТОЛЬКО пустую БД
// (чтобы повторный деплой не затирал реальные данные). Демо-аккаунты (пароль demo):
// admin@ / org@ / coach@ / ref@ / athlete@ugp.local + событие Танкоград (REG_OPEN).
import { PrismaClient } from "@prisma/client";
import { seedDemo } from "./seed-demo";

const prisma = new PrismaClient();

async function main() {
  const users = await prisma.user.count();
  if (users > 0) {
    console.log(`[prod-seed] в БД уже есть данные (${users} пользователей) — сид пропущен`);
    return;
  }
  await seedDemo(prisma);
  console.log("[prod-seed] демо-данные созданы");
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error("[prod-seed] ошибка:", e);
    prisma.$disconnect();
    process.exit(1);
  });
