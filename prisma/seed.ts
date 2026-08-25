import { PrismaClient } from "@prisma/client";
import { seedDemo } from "./seed-demo";

const prisma = new PrismaClient();

// Локальный сид: очищает БД и наполняет демо-данными (для разработки).
async function main() {
  // очистка (порядок зависимостей)
  await prisma.result.deleteMany();
  await prisma.match.deleteMany();
  await prisma.weighInAttempt.deleteMany();
  await prisma.registration.deleteMany();
  await prisma.eventEntry.deleteMany();
  await prisma.consent.deleteMany();
  await prisma.teamScore.deleteMany();
  await prisma.category.deleteMany();
  await prisma.priceTier.deleteMany();
  await prisma.mat.deleteMany();
  await prisma.athlete.deleteMany();
  await prisma.membership.deleteMany();
  await prisma.event.deleteMany();
  await prisma.club.deleteMany();
  await prisma.user.deleteMany();

  await seedDemo(prisma);
}

main().then(() => prisma.$disconnect()).catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
