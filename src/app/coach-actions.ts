"use server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth/session";
import { nativeCategory, type Cat } from "@/lib/domain/eligibility";
import { selectTier, priceEntry, type Tier } from "@/lib/domain/pricing";
import { revalidatePath } from "next/cache";

export type GroupRow = { fullName: string; birthDate: string; sex: "M" | "F"; weight: number; gi: boolean; nogi: boolean };
export type RowResult = { name: string; ok: boolean; msg: string };

export async function registerGroup(rowsJson: string, eventId: string): Promise<RowResult[]> {
  const user = await requireRole("COACH", "ORGANIZER", "ADMIN");
  const clubId = user.memberships.find((m) => m.role === "COACH")?.clubId ?? null;
  const rows: GroupRow[] = JSON.parse(rowsJson || "[]");

  const event = await prisma.event.findUnique({ where: { id: eventId }, include: { priceTiers: true } });
  if (!event) throw new Error("Событие не найдено");
  if (event.status !== "REG_OPEN") throw new Error("Регистрация на это событие закрыта");
  const cats = await prisma.category.findMany({ where: { eventId, isAbsolute: false } });
  const catMap: Cat[] = cats.map((c) => ({
    id: c.id, sex: c.sex as "M" | "F", discipline: c.discipline as "gi" | "nogi",
    birthYearFrom: c.birthYearFrom, birthYearTo: c.birthYearTo, weightMin: c.weightMin, weightMax: c.weightMax,
    isOpenTop: c.isOpenTop, isAbsolute: c.isAbsolute, level: c.level,
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
      if (!row.weight || Number(row.weight) <= 0) throw new Error("нет веса");
      const disciplines = [row.gi ? "gi" : null, row.nogi ? "nogi" : null].filter(Boolean) as ("gi" | "nogi")[];
      if (!disciplines.length) throw new Error("не выбран раздел (ги/ноу-ги)");
      const birthYear = new Date(row.birthDate).getFullYear();
      const ainfo = { sex: row.sex, birthYear, weight: Number(row.weight) };
      const chosen: { disc: "gi" | "nogi"; catId: string }[] = [];
      const notes: string[] = [];
      for (const disc of disciplines) {
        let nc = nativeCategory(ainfo, disc, catMap);
        if (!nc) {
          // перевес/нет своей → предлагаем ближайшую старшую (play-up) вместо hard-error
          nc = nativeCategory(ainfo, disc, catMap, { allowPlayUp: true });
          if (nc) notes.push(`${disc}: перевес/нет своей → старшая группа`);
        }
        if (!nc) throw new Error(`нет категории ${disc} для ${row.sex}, ${birthYear} г.р., ${row.weight} кг (проверьте вес/возраст)`);
        chosen.push({ disc, catId: nc.id });
      }
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
      // каждая дисциплина = отдельная категория (старт) → цена по числу категорий
      const price = priceEntry(tier, { categoryCount: chosen.length });
      const entry = await prisma.eventEntry.create({
        data: { athleteId, eventId, source: "coach", coachUserId: user.id, tierName: tier.name, disciplines: disciplines.join(","), priceTotal: price },
      });
      for (const ch of chosen) {
        await prisma.registration.create({
          data: { entryId: entry.id, athleteId, categoryId: ch.catId, declaredWeight: Number(row.weight), status: "ENTERED" },
        });
      }
      const note = notes.length ? ` · ${notes.join("; ")}` : "";
      results.push({ name: row.fullName, ok: true, msg: `${disciplines.join("+")} · ${price} ₽${note}` });
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
