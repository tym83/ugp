"use server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth/session";
import { allowedCategories, type SelectableCat } from "@/lib/domain/eligibility";
import { selectTier, priceEntry, type Tier } from "@/lib/domain/pricing";
import { revalidatePath } from "next/cache";

// Категории теперь выбирает тренер САМ по каждому спортсмену (как в self-select),
// включая абсолютку. Вес — необязательная подсказка для фильтра.
export type GroupRow = { fullName: string; birthDate: string; sex: "M" | "F"; weight?: number; categoryIds: string[] };
export type RowResult = { name: string; ok: boolean; msg: string };

export async function registerGroup(rowsJson: string, eventId: string): Promise<RowResult[]> {
  const user = await requireRole("COACH", "ORGANIZER", "ADMIN");
  const clubId = user.memberships.find((m) => m.role === "COACH")?.clubId ?? null;
  const rows: GroupRow[] = JSON.parse(rowsJson || "[]");

  const event = await prisma.event.findUnique({ where: { id: eventId }, include: { priceTiers: true } });
  if (!event) throw new Error("Событие не найдено");
  if (event.status !== "REG_OPEN") throw new Error("Регистрация на это событие закрыта");
  const cats = await prisma.category.findMany({ where: { eventId, mergedIntoId: null } });
  const selCats: SelectableCat[] = cats.map((c) => ({
    id: c.id, sex: c.sex as "M" | "F", discipline: c.discipline as "gi" | "nogi",
    birthYearFrom: c.birthYearFrom, birthYearTo: c.birthYearTo, weightMin: c.weightMin, weightMax: c.weightMax,
    isOpenTop: c.isOpenTop, isAbsolute: c.isAbsolute, level: c.level, ageGroupCode: c.ageGroupCode,
  }));
  const tiers: Tier[] = event.priceTiers.map((t) => ({
    name: t.name, startsAt: t.startsAt, priceFirstCategory: t.priceFirstCategory, priceExtraCategory: t.priceExtraCategory,
  }));
  const tier = selectTier(tiers, new Date()) ?? tiers[0];

  const results: RowResult[] = [];
  for (const row of rows) {
    try {
      if (!row.fullName?.trim()) throw new Error("нет имени");
      if (!row.birthDate) throw new Error("нет даты рождения");
      const ids = [...new Set((row.categoryIds ?? []).filter(Boolean))];
      if (!ids.length) throw new Error("не выбрана категория");
      const birthYear = new Date(row.birthDate).getFullYear();
      if (Number.isNaN(birthYear)) throw new Error("неверная дата рождения");
      // проверяем, что выбранные категории доступны атлету (пол + возрастной диапазон)
      const allowed = new Set(allowedCategories({ sex: row.sex, birthYear }, selCats).map((c) => c.id));
      const chosen = ids.filter((id) => allowed.has(id));
      if (!chosen.length) throw new Error("выбранные категории недоступны (пол/возраст)");
      if (chosen.length !== ids.length) throw new Error("часть категорий недоступна — обновите список");
      const chosenCats = cats.filter((c) => chosen.includes(c.id));
      const disciplines = [...new Set(chosenCats.map((c) => c.discipline))];
      const weight = row.weight && Number(row.weight) > 0 ? Number(row.weight) : null;

      // дедуп: тот же атлет (ФИО+дата+клуб), уже заявленный на событие — не плодим дубликат
      const existingAth = await prisma.athlete.findFirst({
        where: { fullName: row.fullName.trim(), birthDate: new Date(row.birthDate), clubId },
      });
      let athleteId: string;
      if (existingAth) {
        const dupEntry = await prisma.eventEntry.findUnique({
          where: { athleteId_eventId: { athleteId: existingAth.id, eventId } },
        });
        if (dupEntry) throw new Error("уже заявлен на это событие");
        athleteId = existingAth.id;
      } else {
        const ath = await prisma.athlete.create({
          data: { fullName: row.fullName.trim(), birthDate: new Date(row.birthDate), sex: row.sex, clubId, coachUserId: user.id },
        });
        athleteId = ath.id;
      }
      // цена по числу выбранных категорий, со скидкой тренерского списка (как и по реф-ссылке).
      const price = priceEntry(tier, { categoryCount: chosen.length, discountPerCategory: event.coachReferralDiscount });
      const entry = await prisma.eventEntry.create({
        data: { athleteId, eventId, source: "coach", coachUserId: user.id, tierName: tier.name, disciplines: disciplines.join(","), priceTotal: price },
      });
      for (const catId of chosen) {
        await prisma.registration.create({
          data: { entryId: entry.id, athleteId, categoryId: catId, declaredWeight: weight, status: "ENTERED" },
        });
      }
      results.push({ name: row.fullName, ok: true, msg: `${chosen.length} кат. · ${price} ₽` });
    } catch (err) {
      results.push({ name: row.fullName || "(без имени)", ok: false, msg: String((err as Error).message) });
    }
  }
  revalidatePath("/coach");
  return results;
}

export async function togglePaidAction(entryId: string, paid: boolean) {
  const user = await requireRole("COACH", "ORGANIZER", "ADMIN");
  // IDOR-guard: тренер меняет только свои заявки
  const res = await prisma.eventEntry.updateMany({
    where: { id: entryId, coachUserId: user.id },
    data: { paidToCoach: paid },
  });
  if (res.count === 0) throw new Error("Заявка не найдена или не ваша");
  revalidatePath("/coach");
}
