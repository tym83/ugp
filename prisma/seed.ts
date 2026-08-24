import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/lib/auth/password";
import { tankogradCategories, TANKOGRAD_EVENT, TANKOGRAD_TIERS } from "../src/lib/data/tankograd";

const prisma = new PrismaClient();

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

  const pass = hashPassword("demo");

  // Клуб
  const club = await prisma.club.create({ data: { name: "Академия Единоборств", city: "Челябинск" } });
  const club2 = await prisma.club.create({ data: { name: "Грэпплинг Привилегия", city: "Челябинск" } });

  // Пользователи + роли
  const admin = await prisma.user.create({ data: { fullName: "Админ", email: "admin@ugp.local", passwordHash: pass } });
  const org = await prisma.user.create({ data: { fullName: "Организатор", email: "org@ugp.local", passwordHash: pass } });
  const coach = await prisma.user.create({ data: { fullName: "Тренер Иванов", email: "coach@ugp.local", passwordHash: pass } });
  const ref = await prisma.user.create({ data: { fullName: "Судья Петров", email: "ref@ugp.local", passwordHash: pass } });
  const athleteUser = await prisma.user.create({ data: { fullName: "Спортсмен", email: "athlete@ugp.local", passwordHash: pass } });
  await prisma.club.update({ where: { id: club.id }, data: { ownerId: coach.id } });

  // Событие
  const event = await prisma.event.create({
    data: { ...TANKOGRAD_EVENT, status: "REG_OPEN", registrationOpensAt: new Date("2026-09-01"), registrationClosesAt: new Date("2026-11-20") },
  });

  await prisma.membership.createMany({
    data: [
      { userId: admin.id, role: "ADMIN", scope: "PLATFORM" },
      { userId: org.id, role: "ORGANIZER", scope: "EVENT", eventId: event.id },
      { userId: coach.id, role: "COACH", scope: "CLUB", clubId: club.id },
      { userId: ref.id, role: "REFEREE", scope: "EVENT", eventId: event.id, matNumber: 1 },
      { userId: athleteUser.id, role: "ATHLETE", scope: "PLATFORM" },
    ],
  });

  // Тиры цен
  for (const t of TANKOGRAD_TIERS) await prisma.priceTier.create({ data: { ...t, eventId: event.id } });

  // Ковры
  for (let i = 1; i <= event.matsCount; i++) await prisma.mat.create({ data: { eventId: event.id, number: i } });

  // Категории (пресет)
  const specs = tankogradCategories();
  for (const s of specs) {
    await prisma.category.create({
      data: {
        eventId: event.id,
        ageGroupCode: s.ageGroupCode,
        ageGroupLabel: s.ageGroupLabel,
        birthYearFrom: s.birthYearFrom,
        birthYearTo: s.birthYearTo,
        sex: s.sex,
        weightMin: s.weightMin,
        weightMax: s.weightMax,
        isOpenTop: s.isOpenTop,
        discipline: s.discipline,
        ruleFormat: s.ruleFormat,
        boutSeconds: s.boutSeconds,
        order: s.order,
      },
    });
  }

  // Абсолютка (взрослые M, gi) — демо on-site
  const absolute = await prisma.category.create({
    data: {
      eventId: event.id, ageGroupCode: "adults-2008", ageGroupLabel: "Взрослые — Абсолютка",
      birthYearFrom: 1930, birthYearTo: 2008, sex: "M", weightMin: null, weightMax: null, isOpenTop: true,
      discipline: "gi", ruleFormat: "SUBMISSION_ONLY", isAbsolute: true, boutSeconds: 300, order: 9000,
    },
  });

  // Демо-регистрации: kids-2015-2016 M до 27, gi — 6 атлетов из 2 клубов (для сетки + развод клубов)
  const kidCat = await prisma.category.findFirst({
    where: { eventId: event.id, ageGroupCode: "kids-2015-2016", sex: "M", discipline: "gi", weightMax: 27 },
  });
  const demoKids = [
    { name: "Артём К.", club: club.id }, { name: "Борис Л.", club: club.id },
    { name: "Виктор М.", club: club.id }, { name: "Глеб Н.", club: club2.id },
    { name: "Денис О.", club: club2.id }, { name: "Егор П.", club: club2.id },
  ];
  if (kidCat) {
    for (let i = 0; i < demoKids.length; i++) {
      const d = demoKids[i];
      const ath = await prisma.athlete.create({
        data: { fullName: d.name, birthDate: new Date("2015-05-05"), sex: "M", city: "Челябинск", clubId: d.club, coachUserId: coach.id, parentConsent: true },
      });
      const entry = await prisma.eventEntry.create({
        data: { athleteId: ath.id, eventId: event.id, source: "coach", coachUserId: coach.id, tierName: "Ранняя", disciplines: "gi", priceTotal: 2000 },
      });
      await prisma.registration.create({
        data: { entryId: entry.id, athleteId: ath.id, categoryId: kidCat.id, declaredWeight: 26, actualWeight: 26, status: "ADMITTED", weighedAt: new Date(), admittedAt: new Date(), seed: i + 1 },
      });
    }
  }

  // Демо: взрослые M до 77, nogi — 5 атлетов (BYE-демо)
  const adultCat = await prisma.category.findFirst({
    where: { eventId: event.id, ageGroupCode: "adults-2008", sex: "M", discipline: "nogi", weightMax: 77 },
  });
  if (adultCat) {
    const names = ["Роман А.", "Сергей Б.", "Тимур В.", "Улан Г.", "Фёдор Д."];
    for (let i = 0; i < names.length; i++) {
      const ath = await prisma.athlete.create({
        data: { fullName: names[i], birthDate: new Date("1995-01-01"), sex: "M", city: "Челябинск", clubId: i % 2 ? club2.id : club.id, coachUserId: coach.id, level: "experienced" },
      });
      const entry = await prisma.eventEntry.create({
        data: { athleteId: ath.id, eventId: event.id, source: "coach", coachUserId: coach.id, tierName: "Ранняя", disciplines: "nogi", priceTotal: 2000 },
      });
      await prisma.registration.create({
        data: { entryId: entry.id, athleteId: ath.id, categoryId: adultCat.id, declaredWeight: 75, actualWeight: 75, status: "ADMITTED", weighedAt: new Date(), admittedAt: new Date(), seed: i + 1 },
      });
    }
  }

  const catCount = await prisma.category.count();
  console.log(`seeded: event=${event.id} categories=${catCount} club/coach/ref/athlete demo ready`);
  console.log(`kidCat=${kidCat?.id} adultCat=${adultCat?.id} absolute=${absolute.id}`);
}

main().then(() => prisma.$disconnect()).catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
