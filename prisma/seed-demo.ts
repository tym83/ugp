import type { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/lib/auth/password";
import { createEventFromPreset, tankogradPreset } from "../src/lib/data/preset";

/** Демо-наполнение (клуб, 5 ролевых аккаунтов, событие REG_OPEN, категории, абсолютка,
 *  демо-регистрации). НЕ чистит БД — вызывающий решает про очистку.
 *  Используется и локальным сидом (с очисткой), и прод-сидом (только на пустой БД). */
export async function seedDemo(prisma: PrismaClient) {
  const pass = hashPassword("demo");

  const club = await prisma.club.create({ data: { name: "Академия Единоборств", city: "Челябинск" } });
  const club2 = await prisma.club.create({ data: { name: "Грэпплинг Привилегия", city: "Челябинск" } });

  const admin = await prisma.user.create({ data: { fullName: "Админ", email: "admin@ugp.local", passwordHash: pass } });
  const org = await prisma.user.create({ data: { fullName: "Организатор", email: "org@ugp.local", passwordHash: pass } });
  const coach = await prisma.user.create({ data: { fullName: "Тренер Иванов", email: "coach@ugp.local", passwordHash: pass } });
  const ref = await prisma.user.create({ data: { fullName: "Судья Петров", email: "ref@ugp.local", passwordHash: pass } });
  const athleteUser = await prisma.user.create({ data: { fullName: "Спортсмен", email: "athlete@ugp.local", passwordHash: pass } });
  await prisma.club.update({ where: { id: club.id }, data: { ownerId: coach.id } });

  const event = await createEventFromPreset(prisma, tankogradPreset(), {
    status: "REG_OPEN",
    registrationOpensAt: new Date("2026-09-01"),
    registrationClosesAt: new Date("2026-11-20"),
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

  const absolute = await prisma.category.create({
    data: {
      eventId: event.id, ageGroupCode: "adults-2008", ageGroupLabel: "Взрослые — Абсолютка",
      birthYearFrom: 1930, birthYearTo: 2008, sex: "M", weightMin: null, weightMax: null, isOpenTop: true,
      discipline: "gi", ruleFormat: "SUBMISSION_ONLY", isAbsolute: true, boutSeconds: 300, order: 9000,
    },
  });

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
  console.log(`[seed-demo] event=${event.id} categories=${catCount} demo users ready (pass: demo)`);
  return { event, kidCat, adultCat, absolute };
}
