"use server";
// Ручное управление составом категории: разобрать сетку, добавить/убрать участника,
// собрать сетку заново; создать категорию вручную.
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireEventRole } from "@/lib/auth/session";
import { buildBracketForCategory } from "@/lib/domain/persistBracket";
import { selectTier, priceEntry, type Tier } from "@/lib/domain/pricing";
import { appendAudit } from "@/lib/domain/audit";

type Res = { ok: boolean; msg: string };

async function orgCategory(categoryId: string) {
  const category = await prisma.category.findUnique({ where: { id: categoryId }, include: { event: { include: { priceTiers: true } } } });
  if (!category) throw new Error("Категория не найдена");
  const user = await requireEventRole(category.eventId, "ORGANIZER", "ADMIN");
  return { category, user };
}

function refresh(eventId: string, categoryId: string) {
  revalidatePath(`/organizer/${eventId}`, "layout");
  revalidatePath(`/category/${categoryId}`);
}

/** Сыгранные схватки (не проходы без соперника) или финализированные результаты блокируют правку. */
async function playedReason(categoryId: string): Promise<string | null> {
  const played = await prisma.match.count({ where: { categoryId, status: "COMPLETED", result: { isNot: null } } });
  return played ? "В категории уже есть результаты схваток — состав и сетку менять нельзя" : null;
}

/** Разобрать сетку: удалить схватки, участники остаются допущенными. */
export async function dissolveBracket(categoryId: string): Promise<Res> {
  const { category, user } = await orgCategory(categoryId);
  const blocked = await playedReason(categoryId);
  if (blocked) return { ok: false, msg: blocked };
  await prisma.$transaction(async (tx) => {
    await tx.result.deleteMany({ where: { match: { categoryId } } });
    await tx.match.deleteMany({ where: { categoryId } });
    await tx.category.update({ where: { id: categoryId }, data: { status: "OPEN", frozenAt: null } });
    await appendAudit(tx, { actorId: user.id, action: "bracket.dissolve", entity: "Category", entityId: categoryId, before: {} });
  });
  refresh(category.eventId, categoryId);
  return { ok: true, msg: "Сетка разобрана" };
}

/** Собрать (сохранить) сетку из допущенных участников. */
export async function saveBracket(categoryId: string): Promise<Res> {
  const { category } = await orgCategory(categoryId);
  const blocked = await playedReason(categoryId);
  if (blocked) return { ok: false, msg: blocked };
  const n = await prisma.registration.count({ where: { categoryId, status: "ADMITTED" } });
  if (n === 0) return { ok: false, msg: "В категории нет допущенных участников" };
  await buildBracketForCategory(categoryId);
  refresh(category.eventId, categoryId);
  return { ok: true, msg: n === 1 ? "Сохранено: участник один, схваток нет" : `Сетка сохранена (${n} уч.)` };
}

export type RosterCandidate = { athleteId: string; fullName: string; birthYear: number; club: string | null; inCategory: boolean };

/** Поиск участников события по ФИО (для добавления в категорию). */
export async function searchEventAthletes(categoryId: string, q: string): Promise<RosterCandidate[]> {
  const { category } = await orgCategory(categoryId);
  const needle = q.trim().toLowerCase().replace(/ё/g, "е");
  if (needle.length < 2) return [];
  const entries = await prisma.eventEntry.findMany({
    where: { eventId: category.eventId },
    include: { athlete: { include: { club: true } }, registrations: { select: { categoryId: true, status: true } } },
  });
  return entries
    .filter((e) => e.athlete.fullName.toLowerCase().replace(/ё/g, "е").includes(needle))
    .slice(0, 15)
    .map((e) => ({
      athleteId: e.athleteId,
      fullName: e.athlete.fullName,
      birthYear: e.athlete.birthDate.getUTCFullYear(),
      club: e.athlete.club?.name ?? null,
      inCategory: e.registrations.some((r) => r.categoryId === categoryId && r.status === "ADMITTED"),
    }));
}

/** Посев для добавленного вручную — в конец списка. */
async function nextSeed(categoryId: string): Promise<number> {
  const top = await prisma.registration.aggregate({ where: { categoryId }, _max: { seed: true }, _count: true });
  return Math.max(top._max.seed ?? 0, top._count) + 1;
}

function activeTier(tiers: { name: string; startsAt: Date; priceFirstCategory: number; priceExtraCategory: number | null }[]): Tier | null {
  return selectTier(tiers.map((t) => ({ ...t })), new Date());
}

/** Добавить уже заявленного на событие участника в категорию сразу допущенным.
 *  Новая категория для заявки = +цена доп. категории. */
export async function addAthleteToCategory(categoryId: string, athleteId: string, weight: number | null): Promise<Res> {
  const { category, user } = await orgCategory(categoryId);
  const blocked = await playedReason(categoryId);
  if (blocked) return { ok: false, msg: blocked };
  const entry = await prisma.eventEntry.findUnique({ where: { athleteId_eventId: { athleteId, eventId: category.eventId } } });
  if (!entry) return { ok: false, msg: "Участник не заявлен на турнир" };
  const existing = await prisma.registration.findFirst({ where: { categoryId, athleteId } });
  const tier = activeTier(category.event.priceTiers);
  const seed = await nextSeed(categoryId);
  await prisma.$transaction(async (tx) => {
    if (existing) {
      await tx.registration.update({
        where: { id: existing.id },
        data: { status: "ADMITTED", admittedAt: new Date(), withdrawnAt: null, withdrawReason: null, ...(weight ? { actualWeight: weight, weighedAt: new Date() } : {}) },
      });
    } else {
      await tx.registration.create({
        data: {
          entryId: entry.id, athleteId, categoryId, status: "ADMITTED", admittedAt: new Date(), effectiveCategoryId: categoryId, seed,
          declaredWeight: weight, ...(weight ? { actualWeight: weight, weighedAt: new Date() } : {}),
        },
      });
      const extra = tier ? tier.priceExtraCategory ?? tier.priceFirstCategory : 0;
      await tx.eventEntry.update({ where: { id: entry.id }, data: { priceTotal: { increment: extra } } });
    }
    await appendAudit(tx, { actorId: user.id, action: "roster.add", entity: "Category", entityId: categoryId, before: { athleteId } });
  });
  refresh(category.eventId, categoryId);
  return { ok: true, msg: "Добавлен" };
}

/** Новый человек (нет на сайте): атлет + заявка на турнир + регистрация в категорию, сразу допущен. */
export async function addNewAthleteToCategory(
  categoryId: string,
  data: { fullName: string; birthDate: string; club: string; weight: number | null },
): Promise<Res> {
  const { category, user } = await orgCategory(categoryId);
  const blocked = await playedReason(categoryId);
  if (blocked) return { ok: false, msg: blocked };
  const fullName = data.fullName.trim().replace(/\s+/g, " ");
  const birthDate = new Date(`${data.birthDate}T00:00:00Z`);
  if (fullName.split(" ").length < 2) return { ok: false, msg: "Укажите фамилию и имя" };
  if (Number.isNaN(birthDate.getTime())) return { ok: false, msg: "Укажите дату рождения" };

  const dup = await prisma.eventEntry.findFirst({
    where: { eventId: category.eventId, athlete: { fullName, birthDate } },
  });
  if (dup) return { ok: false, msg: "Такой участник уже заявлен — найдите его поиском" };

  const clubName = data.club.trim();
  const club = clubName
    ? (await prisma.club.findMany()).find((c) => c.name.toLowerCase() === clubName.toLowerCase()) ??
      (await prisma.club.create({ data: { name: clubName } }))
    : null;
  const tier = activeTier(category.event.priceTiers);
  const seed = await nextSeed(categoryId);

  await prisma.$transaction(async (tx) => {
    const athlete = await tx.athlete.create({ data: { fullName, birthDate, sex: category.sex, clubId: club?.id ?? null } });
    const entry = await tx.eventEntry.create({
      data: {
        athleteId: athlete.id, eventId: category.eventId, source: "organizer", tierName: tier?.name ?? null,
        disciplines: category.discipline, priceTotal: tier ? priceEntry(tier, { categoryCount: 1 }) : 0,
      },
    });
    await tx.registration.create({
      data: {
        entryId: entry.id, athleteId: athlete.id, categoryId, status: "ADMITTED", admittedAt: new Date(), effectiveCategoryId: categoryId, seed,
        declaredWeight: data.weight, ...(data.weight ? { actualWeight: data.weight, weighedAt: new Date() } : {}),
      },
    });
    await appendAudit(tx, { actorId: user.id, action: "roster.addNew", entity: "Category", entityId: categoryId, before: { fullName } });
  });
  refresh(category.eventId, categoryId);
  return { ok: true, msg: `${fullName} добавлен` };
}

/** Убрать участника из категории (снят, запись сохраняется — можно вернуть). */
export async function removeFromCategory(registrationId: string): Promise<Res> {
  const reg = await prisma.registration.findUnique({ where: { id: registrationId } });
  if (!reg) return { ok: false, msg: "Регистрация не найдена" };
  const { category, user } = await orgCategory(reg.categoryId);
  const blocked = await playedReason(reg.categoryId);
  if (blocked) return { ok: false, msg: blocked };
  await prisma.$transaction(async (tx) => {
    await tx.registration.update({
      where: { id: registrationId },
      data: { status: "WITHDRAWN", withdrawnAt: new Date(), withdrawReason: "убран организатором" },
    });
    await appendAudit(tx, { actorId: user.id, action: "roster.remove", entity: "Registration", entityId: registrationId, before: { status: reg.status } });
  });
  refresh(category.eventId, reg.categoryId);
  return { ok: true, msg: "Убран из категории" };
}

/** Создать категорию вручную по образцу существующей (возраст, пол, дисциплина, уровень, правила),
 *  со своим названием и весом. */
export async function createManualCategory(
  baseCategoryId: string,
  data: { label: string; weightMin: number | null; weightMax: number | null },
): Promise<Res & { id?: string }> {
  const { category: base, user } = await orgCategory(baseCategoryId);
  const label = data.label.trim();
  if (data.weightMin == null && data.weightMax == null) return { ok: false, msg: "Укажите вес: «до» или «свыше»" };
  if (data.weightMin != null && data.weightMax != null && data.weightMin >= data.weightMax) {
    return { ok: false, msg: "Вес «от» должен быть меньше «до»" };
  }
  const created = await prisma.category.create({
    data: {
      eventId: base.eventId,
      ageGroupCode: base.ageGroupCode,
      ageGroupLabel: label || base.ageGroupLabel,
      birthYearFrom: base.birthYearFrom,
      birthYearTo: base.birthYearTo,
      sex: base.sex,
      discipline: base.discipline,
      level: base.level,
      ruleFormat: base.ruleFormat,
      bracketType: base.bracketType,
      bronzeMode: base.bronzeMode,
      boutSeconds: base.boutSeconds,
      minParticipants: 1,
      matNumber: base.matNumber,
      weightMin: data.weightMin,
      weightMax: data.weightMax,
      isOpenTop: data.weightMax == null,
      order: base.order,
    },
  });
  await prisma.$transaction(async (tx) =>
    appendAudit(tx, { actorId: user.id, action: "category.createManual", entity: "Category", entityId: created.id, before: { baseCategoryId } }),
  );
  refresh(base.eventId, created.id);
  return { ok: true, msg: "Категория создана", id: created.id };
}
