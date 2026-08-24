"use server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth/session";
import { nativeCategory, type Cat } from "@/lib/domain/eligibility";
import { selectTier, priceEntry, type Tier } from "@/lib/domain/pricing";
import { revalidatePath } from "next/cache";

export type GroupRow = { fullName: string; birthDate: string; sex: "M" | "F"; weight: number; gi: boolean; nogi: boolean };
export type RowResult = { name: string; ok: boolean; msg: string };

export async function registerGroup(rowsJson: string, eventId: string): Promise<RowResult[]> {
  const user = await getCurrentUser();
  if (!user) throw new Error("Не авторизован");
  const clubId = user.memberships.find((m) => m.role === "COACH")?.clubId ?? null;
  const rows: GroupRow[] = JSON.parse(rowsJson || "[]");

  const event = await prisma.event.findUnique({ where: { id: eventId }, include: { priceTiers: true } });
  if (!event) throw new Error("Событие не найдено");
  const cats = await prisma.category.findMany({ where: { eventId, isAbsolute: false } });
  const catMap: Cat[] = cats.map((c) => ({
    id: c.id, sex: c.sex as "M" | "F", discipline: c.discipline as "gi" | "nogi",
    birthYearFrom: c.birthYearFrom, birthYearTo: c.birthYearTo, weightMin: c.weightMin, weightMax: c.weightMax,
    isOpenTop: c.isOpenTop, isAbsolute: c.isAbsolute, level: c.level,
  }));
  const tiers: Tier[] = event.priceTiers.map((t) => ({
    name: t.name, startsAt: t.startsAt, priceOneDivision: t.priceOneDivision,
    priceBothDivisions: t.priceBothDivisions, absoluteSurcharge: t.absoluteSurcharge,
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
      for (const disc of disciplines) {
        const nc = nativeCategory(ainfo, disc, catMap);
        if (!nc) throw new Error(`нет категории ${disc} для ${row.sex}, ${birthYear} г.р., ${row.weight} кг`);
        chosen.push({ disc, catId: nc.id });
      }
      const ath = await prisma.athlete.create({
        data: { fullName: row.fullName.trim(), birthDate: new Date(row.birthDate), sex: row.sex, clubId, coachUserId: user.id },
      });
      const price = priceEntry(tier, { disciplines, absoluteAdded: false });
      const entry = await prisma.eventEntry.create({
        data: { athleteId: ath.id, eventId, source: "coach", coachUserId: user.id, tierName: tier.name, disciplines: disciplines.join(","), priceTotal: price },
      });
      for (const ch of chosen) {
        await prisma.registration.create({
          data: { entryId: entry.id, athleteId: ath.id, categoryId: ch.catId, declaredWeight: Number(row.weight), status: "ENTERED" },
        });
      }
      results.push({ name: row.fullName, ok: true, msg: `${disciplines.join("+")} · ${price} ₽` });
    } catch (err) {
      results.push({ name: row.fullName || "(без имени)", ok: false, msg: String((err as Error).message) });
    }
  }
  revalidatePath("/coach");
  return results;
}

export async function togglePaidAction(entryId: string, paid: boolean) {
  await prisma.eventEntry.update({ where: { id: entryId }, data: { paidToCoach: paid } });
  revalidatePath("/coach");
}
