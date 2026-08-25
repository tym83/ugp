// Прод-инициализация (без демо-аккаунтов): один админ из ADMIN_EMAIL/ADMIN_PASSWORD
// + событие-заготовка «Танкоград» в статусе DRAFT. Идемпотентно.
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/lib/auth/password";
import { createEventFromPreset, tankogradPreset } from "../src/lib/data/preset";

const prisma = new PrismaClient();

async function main() {
  const email = process.env.ADMIN_EMAIL?.trim();
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password) throw new Error("ADMIN_EMAIL и ADMIN_PASSWORD обязательны");
  if (password.length < 8) throw new Error("ADMIN_PASSWORD слишком короткий (мин. 8)");

  const existing = await prisma.user.findUnique({ where: { email } });
  if (!existing) {
    const user = await prisma.user.create({
      data: { email, fullName: "Администратор", passwordHash: hashPassword(password) },
    });
    await prisma.membership.create({ data: { userId: user.id, role: "ADMIN", scope: "PLATFORM" } });
    console.log("[prod-seed] админ создан:", email);
  } else {
    console.log("[prod-seed] админ уже существует:", email);
  }

  const events = await prisma.event.count();
  if (events === 0) {
    await createEventFromPreset(prisma, tankogradPreset(), { status: "DRAFT" });
    console.log("[prod-seed] событие-заготовка «Танкоград» создано (DRAFT)");
  } else {
    console.log("[prod-seed] события уже есть — пропускаю пресет");
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error("[prod-seed] ошибка:", e);
    prisma.$disconnect();
    process.exit(1);
  });
