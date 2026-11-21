"use server";
// Ручное управление составом категории: разобрать сетку, добавить/убрать участника,
// собрать сетку заново; создать категорию вручную; правка слотов схваток после старта.
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireEventRole } from "@/lib/auth/session";
import { advanceWinner, buildBracketForCategory } from "@/lib/domain/persistBracket";
import { selectTier, priceEntry, type Tier } from "@/lib/domain/pricing";
import { appendAudit } from "@/lib/domain/audit";
import { IN_BRACKET, inBracket } from "@/lib/domain/bracketStatus";
import { canMerge, type MergeCat } from "@/lib/domain/merge";
import { categoryLabel } from "@/lib/domain/snapshot";
// Relative path: vitest has no "@/" alias and roster-actions.test.ts mocks every "@/" import.
import { categoryMismatches } from "../lib/domain/categoryFit";

type Res = { ok: boolean; msg: string; needsConfirm?: boolean };

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

/** Участник занимает слот схватки категории — его нельзя убрать/перенести без замены в сетке. */
async function occupiesSlot(categoryId: string, athleteId: string): Promise<boolean> {
  const n = await prisma.match.count({ where: { categoryId, OR: [{ slotAAthleteId: athleteId }, { slotBAthleteId: athleteId }] } });
  return n > 0;
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
  const n = await prisma.registration.count({ where: { categoryId, status: { in: IN_BRACKET } } });
  if (n === 0) return { ok: false, msg: "В категории нет участников" };
  await buildBracketForCategory(categoryId);
  refresh(category.eventId, categoryId);
  return { ok: true, msg: n === 1 ? "Сохранено: участник один, схваток нет" : `Сетка сохранена (${n} уч.)` };
}

export type RosterCandidate = {
  athleteId: string;
  fullName: string;
  birthYear: number;
  club: string | null;
  inCategory: boolean;
  /** Labels of all categories the athlete is currently in (any discipline) — shown in the result line. */
  allCategories: string[];
  /** Заявка этого атлета в другой категории той же дисциплины — можно перенести сюда. */
  otherCategory: { registrationId: string; categoryId: string; label: string } | null;
};

/** Поиск участников события по ФИО (для добавления в категорию). */
export async function searchEventAthletes(categoryId: string, q: string): Promise<RosterCandidate[]> {
  const { category } = await orgCategory(categoryId);
  const needle = q.trim().toLowerCase().replace(/ё/g, "е");
  if (needle.length < 2) return [];
  const entries = await prisma.eventEntry.findMany({
    where: { eventId: category.eventId },
    include: {
      athlete: { include: { club: true } },
      registrations: {
        select: {
          id: true,
          categoryId: true,
          status: true,
          category: { select: { ageGroupLabel: true, level: true, sex: true, discipline: true, isAbsolute: true, isOpenTop: true, weightMin: true, weightMax: true } },
        },
      },
    },
  });
  return entries
    .filter((e) => e.athlete.fullName.toLowerCase().replace(/ё/g, "е").includes(needle))
    .slice(0, 15)
    .map((e) => {
      const others = e.registrations.filter((r) => r.categoryId !== categoryId && inBracket(r.status));
      const other = others.find((r) => r.category.discipline === category.discipline);
      return {
        athleteId: e.athleteId,
        fullName: e.athlete.fullName,
        birthYear: e.athlete.birthDate.getUTCFullYear(),
        club: e.athlete.club?.name ?? null,
        inCategory: e.registrations.some((r) => r.categoryId === categoryId && inBracket(r.status)),
        allCategories: others.map((r) => categoryLabel(r.category)),
        otherCategory: other
          ? { registrationId: other.id, categoryId: other.categoryId, label: categoryLabel(other.category) }
          : null,
      };
    });
}

/** Посев для добавленного вручную — в конец списка. */
async function nextSeed(categoryId: string): Promise<number> {
  const top = await prisma.registration.aggregate({ where: { categoryId }, _max: { seed: true }, _count: true });
  return Math.max(top._max.seed ?? 0, top._count) + 1;
}

/** Вес для проверки соответствия категории: переданный при вызове, иначе фактический/заявленный
 *  из любой регистрации атлета на этом событии, иначе null (вес не проверяем). */
async function fitWeight(athleteId: string, eventId: string, given: number | null): Promise<number | null> {
  if (given != null) return given;
  const reg = await prisma.registration.findFirst({
    where: { athleteId, entry: { eventId }, OR: [{ actualWeight: { not: null } }, { declaredWeight: { not: null } }] },
  });
  return reg?.actualWeight ?? reg?.declaredWeight ?? null;
}

/** Отказ с подтверждением для атлета, не подходящего категории; null — добавлять можно. */
function fitRefusal(reasons: string[], force: boolean): Res | null {
  if (!reasons.length || force) return null;
  return { ok: false, needsConfirm: true, msg: "Не соответствует категории: " + reasons.join("; ") };
}

function activeTier(tiers: { name: string; startsAt: Date; priceFirstCategory: number; priceExtraCategory: number | null }[]): Tier | null {
  return selectTier(tiers.map((t) => ({ ...t })), new Date());
}

/** Добавить уже заявленного на событие участника в категорию сразу допущенным.
 *  Новая категория для заявки = +цена доп. категории.
 *  Не подходит по полу/годам/весу → needsConfirm; force=true добавляет вопреки (причины — в аудит). */
export async function addAthleteToCategory(categoryId: string, athleteId: string, weight: number | null, force = false): Promise<Res> {
  const { category, user } = await orgCategory(categoryId);
  const entry = await prisma.eventEntry.findUnique({ where: { athleteId_eventId: { athleteId, eventId: category.eventId } } });
  if (!entry) return { ok: false, msg: "Участник не заявлен на турнир" };
  const athlete = await prisma.athlete.findUnique({ where: { id: athleteId } });
  let forcedFit: string[] = [];
  if (athlete) {
    const reasons = categoryMismatches(category, {
      sex: athlete.sex,
      birthYear: athlete.birthDate.getUTCFullYear(),
      weight: await fitWeight(athleteId, category.eventId, weight),
    });
    const refusal = fitRefusal(reasons, force);
    if (refusal) return refusal;
    forcedFit = reasons;
  }
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
    await appendAudit(tx, { actorId: user.id, action: "roster.add", entity: "Category", entityId: categoryId, before: { athleteId, ...(forcedFit.length ? { forcedFit: forcedFit.join("; ") } : {}) } });
  });
  refresh(category.eventId, categoryId);
  return { ok: true, msg: "Добавлен" };
}

/** Новый человек (нет на сайте): атлет + заявка на турнир + регистрация в категорию, сразу допущен.
 *  Год рождения/вес не подходят категории → needsConfirm; force=true добавляет вопреки (причины — в аудит). */
export async function addNewAthleteToCategory(
  categoryId: string,
  data: { fullName: string; birthDate: string; club: string; weight: number | null },
  force = false,
): Promise<Res> {
  const { category, user } = await orgCategory(categoryId);
  const fullName = data.fullName.trim().replace(/\s+/g, " ");
  const birthDate = new Date(`${data.birthDate}T00:00:00Z`);
  if (fullName.split(" ").length < 2) return { ok: false, msg: "Укажите фамилию и имя" };
  if (Number.isNaN(birthDate.getTime())) return { ok: false, msg: "Укажите дату рождения" };

  const dup = await prisma.eventEntry.findFirst({
    where: { eventId: category.eventId, athlete: { fullName, birthDate } },
  });
  if (dup) return { ok: false, msg: "Такой участник уже заявлен — найдите его поиском" };

  const reasons = categoryMismatches(category, {
    sex: category.sex,
    birthYear: birthDate.getUTCFullYear(),
    weight: data.weight,
  });
  const refusal = fitRefusal(reasons, force);
  if (refusal) return refusal;
  const forcedFit = reasons;
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
    await appendAudit(tx, { actorId: user.id, action: "roster.addNew", entity: "Category", entityId: categoryId, before: { fullName, ...(forcedFit.length ? { forcedFit: forcedFit.join("; ") } : {}) } });
  });
  refresh(category.eventId, categoryId);
  return { ok: true, msg: `${fullName} добавлен` };
}

/** Убрать участника из категории (снят, запись сохраняется — можно вернуть).
 *  Занятый в сетке слот сначала надо освободить заменой участника в схватке. */
export async function removeFromCategory(registrationId: string): Promise<Res> {
  const reg = await prisma.registration.findUnique({ where: { id: registrationId } });
  if (!reg) return { ok: false, msg: "Регистрация не найдена" };
  const { category, user } = await orgCategory(reg.categoryId);
  if (await occupiesSlot(reg.categoryId, reg.athleteId)) {
    return { ok: false, msg: "Сначала замените участника в сетке" };
  }
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

// ─────────────────────────────────────────────────────────────────────────────
// Вливание категорий и перенос участников между категориями
// ─────────────────────────────────────────────────────────────────────────────

type MergeCatRow = {
  id: string;
  sex: string;
  discipline: string;
  ageGroupCode: string;
  weightMax: number | null;
  isOpenTop: boolean;
  isAbsolute: boolean;
  minParticipants: number;
};

function toMergeCat(c: MergeCatRow, count: number): MergeCat {
  return {
    id: c.id,
    sex: c.sex as "M" | "F",
    discipline: c.discipline as "gi" | "nogi",
    ageGroupCode: c.ageGroupCode,
    weightMax: c.weightMax,
    isOpenTop: c.isOpenTop,
    isAbsolute: c.isAbsolute,
    count,
    minParticipants: c.minParticipants,
  };
}

/** Совместимые категории для вливания в эту: то же событие, не влитые,
 *  без сыгранных результатов, проходят canMerge. count = участники IN_BRACKET. */
export async function mergeCandidates(targetCategoryId: string): Promise<{ id: string; label: string; count: number }[]> {
  const { category: target } = await orgCategory(targetCategoryId);
  if (target.mergedIntoId) return [];
  if (await playedReason(targetCategoryId)) return [];
  const targetCount = await prisma.registration.count({ where: { categoryId: targetCategoryId, status: { in: IN_BRACKET } } });
  const targetCat = toMergeCat(target, targetCount);
  const candidates = await prisma.category.findMany({
    where: { eventId: target.eventId, id: { not: targetCategoryId }, mergedIntoId: null },
    orderBy: { order: "asc" },
    include: { _count: { select: { registrations: { where: { status: { in: IN_BRACKET } } } } } },
  });
  const out: { id: string; label: string; count: number }[] = [];
  for (const c of candidates) {
    const cat = toMergeCat(c, c._count.registrations);
    if (!canMerge(cat, targetCat)) continue;
    if (await playedReason(c.id)) continue;
    out.push({ id: c.id, label: categoryLabel(c), count: cat.count });
  }
  return out;
}

/** Влить категорию-источник в эту: обе сетки разбираются, все регистрации
 *  переходят сюда, источник помечается MERGED. Цены не меняются. */
export async function mergeIntoCategory(targetCategoryId: string, sourceCategoryId: string): Promise<Res> {
  if (sourceCategoryId === targetCategoryId) return { ok: false, msg: "Нельзя влить категорию саму в себя" };
  const { category: target, user } = await orgCategory(targetCategoryId);
  const source = await prisma.category.findUnique({ where: { id: sourceCategoryId } });
  if (!source) return { ok: false, msg: "Категория не найдена" };
  if (source.eventId !== target.eventId) return { ok: false, msg: "Категории из разных событий" };
  if (source.mergedIntoId) return { ok: false, msg: "Категория-источник уже влита в другую" };
  if (target.mergedIntoId) return { ok: false, msg: "Эта категория уже влита в другую" };
  const blocked = (await playedReason(targetCategoryId)) ?? (await playedReason(sourceCategoryId));
  if (blocked) return { ok: false, msg: blocked };
  const [targetCount, sourceCount] = await Promise.all([
    prisma.registration.count({ where: { categoryId: targetCategoryId, status: { in: IN_BRACKET } } }),
    prisma.registration.count({ where: { categoryId: sourceCategoryId, status: { in: IN_BRACKET } } }),
  ]);
  if (!canMerge(toMergeCat(source, sourceCount), toMergeCat(target, targetCount))) {
    return { ok: false, msg: "Категории несовместимы (пол/дисциплина/возрастная полоса/абсолютка)" };
  }
  const matchCount = await prisma.match.count({ where: { categoryId: { in: [sourceCategoryId, targetCategoryId] } } });
  const moved = await prisma.$transaction(async (tx) => {
    await tx.result.deleteMany({ where: { match: { categoryId: { in: [sourceCategoryId, targetCategoryId] } } } });
    await tx.match.deleteMany({ where: { categoryId: { in: [sourceCategoryId, targetCategoryId] } } });
    const res = await tx.registration.updateMany({
      where: { categoryId: sourceCategoryId },
      data: { categoryId: targetCategoryId, effectiveCategoryId: targetCategoryId },
    });
    await tx.category.update({ where: { id: sourceCategoryId }, data: { mergedIntoId: targetCategoryId, status: "MERGED" } });
    await tx.category.update({ where: { id: targetCategoryId }, data: { status: "OPEN", frozenAt: null } });
    await appendAudit(tx, {
      actorId: user.id,
      action: "category.merge",
      entity: "Category",
      entityId: targetCategoryId,
      before: { sourceCategoryId, moved: res.count },
    });
    return res.count;
  });
  refresh(target.eventId, targetCategoryId);
  refresh(target.eventId, sourceCategoryId);
  const tail = matchCount > 0 ? " Сетка разобрана — сохраните заново." : "";
  return { ok: true, msg: `Категория «${categoryLabel(source)}» влита, участников: ${moved}.${tail}` };
}

/** Перенести заявку участника из другой категории в эту (без изменения цены).
 *  Источник без результатов — сетку источника пересобираем, если она была.
 *  Источник с результатами — переносим только «свободных» участников (не в слотах),
 *  сетку источника не трогаем. Целевая сетка никогда не пересобирается.
 *  Атлет не подходит целевой категории → needsConfirm; force=true переносит вопреки (причины — в аудит). */
export async function moveAthleteHere(targetCategoryId: string, registrationId: string, force = false): Promise<Res> {
  const { category: target, user } = await orgCategory(targetCategoryId);
  const reg = await prisma.registration.findUnique({ where: { id: registrationId }, include: { category: true, athlete: true } });
  if (!reg) return { ok: false, msg: "Регистрация не найдена" };
  const source = reg.category;
  if (source.eventId !== target.eventId) return { ok: false, msg: "Категории из разных событий" };
  if (source.mergedIntoId) return { ok: false, msg: "Категория-источник уже влита в другую" };
  const sourcePlayed =
    (await prisma.match.count({ where: { categoryId: source.id, status: "COMPLETED", result: { isNot: null } } })) > 0;
  if (sourcePlayed && (await occupiesSlot(source.id, reg.athleteId))) {
    return { ok: false, msg: "Сначала замените участника в сетке" };
  }
  const athlete = reg.athlete;
  let forcedFit: string[] = [];
  if (athlete) {
    const reasons = categoryMismatches(target, {
      sex: athlete.sex,
      birthYear: athlete.birthDate.getUTCFullYear(),
      weight: reg.actualWeight ?? reg.declaredWeight ?? null,
    });
    const refusal = fitRefusal(reasons, force);
    if (refusal) return refusal;
    forcedFit = reasons;
  }
  const sourceHadMatches = (await prisma.match.count({ where: { categoryId: source.id } })) > 0;
  const seed = await nextSeed(targetCategoryId);
  await prisma.$transaction(async (tx) => {
    await tx.registration.update({
      where: { id: registrationId },
      data: { categoryId: targetCategoryId, effectiveCategoryId: targetCategoryId, seed },
    });
    await appendAudit(tx, {
      actorId: user.id,
      action: "roster.move",
      entity: "Registration",
      entityId: registrationId,
      before: { fromCategoryId: source.id, toCategoryId: targetCategoryId, ...(forcedFit.length ? { forcedFit: forcedFit.join("; ") } : {}) },
    });
  });
  // Пересборка сетки источника — после переноса (buildBracketForCategory сама транзакционна).
  // Сетку с результатами не разбираем и не пересобираем.
  if (!sourcePlayed && sourceHadMatches) {
    const entrants = await prisma.registration.count({ where: { categoryId: source.id, status: { in: IN_BRACKET } } });
    if (entrants === 0) {
      await prisma.$transaction(async (tx) => {
        await tx.result.deleteMany({ where: { match: { categoryId: source.id } } });
        await tx.match.deleteMany({ where: { categoryId: source.id } });
      });
    } else {
      await buildBracketForCategory(source.id);
    }
  }
  refresh(target.eventId, targetCategoryId);
  refresh(target.eventId, source.id);
  return { ok: true, msg: "Перенесён" };
}

// ─────────────────────────────────────────────────────────────────────────────
// Правка сетки по схваткам (сетка есть — с результатами или без):
// слоты PENDING-схваток, постановка соперника в проход, зачёт прохода
// ─────────────────────────────────────────────────────────────────────────────

export type SlotMatchLite = {
  id: string;
  roundNumber: number;
  positionInRound: number;
  isBronzeMatch: boolean;
  isRoundRobin: boolean;
  status: string;
  slotAAthleteId: string | null;
  slotBAthleteId: string | null;
  slotAFromMatchId: string | null;
  slotBFromMatchId: string | null;
  winnerAthleteId: string | null;
  hasResult: boolean;
  winType: string | null;
};

export type SlotPlan = {
  athleteId: string | null;
  /** Селект слота доступен (схватка PENDING и слот не ждёт фидер). */
  editable: boolean;
  /** Слот заполнится победителем/проигравшим ещё не сыгранной схватки. */
  feederPending: boolean;
  /** Номер схватки-источника в списке «Правка сетки по схваткам». */
  feederNum: number | null;
};

export type MatchPlan = {
  isBye: boolean;
  canReopenBye: boolean;
  canWalkover: boolean;
  slots: { A: SlotPlan; B: SlotPlan };
};

export type SlotEditRow = {
  id: string;
  num: number;
  roundLabel: string;
  status: string;
  hasResult: boolean;
  isBye: boolean;
  canReopenBye: boolean;
  canWalkover: boolean;
  winnerAthleteId: string | null;
  winType: string | null;
  slotA: SlotPlan;
  slotB: SlotPlan;
};

export type SlotAthlete = { athleteId: string; fullName: string };

type SlotSide = "A" | "B";

/** Порядок схваток в списке: круги по возрастанию, матч за 3-е прямо перед финалом. */
function orderedMatches<T extends Pick<SlotMatchLite, "roundNumber" | "positionInRound" | "isBronzeMatch">>(matches: T[]): T[] {
  const main = matches
    .filter((m) => !m.isBronzeMatch)
    .sort((x, y) => x.roundNumber - y.roundNumber || x.positionInRound - y.positionInRound);
  const bronze = matches.filter((m) => m.isBronzeMatch);
  if (!bronze.length) return main;
  const lastRound = main.length ? Math.max(...main.map((m) => m.roundNumber)) : 0;
  return [...main.filter((m) => m.roundNumber < lastRound), ...bronze, ...main.filter((m) => m.roundNumber === lastRound)];
}

/** Название этапа: «Тур N» (круговая), «За 3-е место», «Финал», «Полуфинал», «Круг N». */
function roundName(m: SlotMatchLite, lastRound: number): string {
  if (m.isRoundRobin) return `Тур ${m.roundNumber}`;
  if (m.isBronzeMatch) return "За 3-е место";
  const left = lastRound - m.roundNumber;
  if (left === 0) return "Финал";
  if (left === 1) return "Полуфинал";
  return `Круг ${m.roundNumber}`;
}

/** Проход (BYE): схватка завершена без результата, ровно один слот занят. */
function isByeMatch(m: SlotMatchLite): boolean {
  const filled = Number(!!m.slotAAthleteId) + Number(!!m.slotBAthleteId);
  return m.status === "COMPLETED" && !m.hasResult && filled === 1;
}

/** Что можно править в каждой схватке — чистая функция (покрыта тестами). */
function planSlotEdits(matches: SlotMatchLite[]): Map<string, MatchPlan> {
  const byId = new Map(matches.map((m) => [m.id, m]));
  const numOf = new Map(orderedMatches(matches).map((m, i) => [m.id, i + 1]));
  const plans = new Map<string, MatchPlan>();
  for (const m of matches) {
    const slotPlan = (side: SlotSide): SlotPlan => {
      const athleteId = side === "A" ? m.slotAAthleteId : m.slotBAthleteId;
      if (m.status !== "PENDING") return { athleteId, editable: false, feederPending: false, feederNum: null };
      const fromId = side === "A" ? m.slotAFromMatchId : m.slotBFromMatchId;
      const feeder = fromId ? byId.get(fromId) : undefined;
      if (feeder && feeder.status !== "COMPLETED") {
        return { athleteId, editable: false, feederPending: true, feederNum: fromId ? (numOf.get(fromId) ?? null) : null };
      }
      return { athleteId, editable: true, feederPending: false, feederNum: null };
    };
    const isBye = isByeMatch(m);
    const dependents = matches.filter((d) => d.slotAFromMatchId === m.id || d.slotBFromMatchId === m.id);
    const canReopenBye = isBye && !dependents.some((d) => d.status === "COMPLETED" && d.hasResult);
    let canWalkover = false;
    if (m.status === "PENDING" && !m.hasResult) {
      const emptySide: SlotSide | null = m.slotAAthleteId ? (m.slotBAthleteId ? null : "B") : "A";
      if (emptySide) {
        const fromId = emptySide === "A" ? m.slotAFromMatchId : m.slotBFromMatchId;
        const feeder = fromId ? byId.get(fromId) : undefined;
        canWalkover = !feeder || feeder.status === "COMPLETED";
      }
    }
    plans.set(m.id, { isBye, canReopenBye, canWalkover, slots: { A: slotPlan("A"), B: slotPlan("B") } });
  }
  return plans;
}

/** Атлет уже стоит в другом слоте PENDING-схватки этого же круга → текст отказа или null. */
function duplicateSlotRefusalSync(matches: SlotMatchLite[], matchId: string, side: SlotSide, athleteId: string): string | null {
  const me = matches.find((m) => m.id === matchId);
  if (!me) return null;
  for (const m of matches) {
    if (m.status !== "PENDING" || m.roundNumber !== me.roundNumber || m.isBronzeMatch !== me.isBronzeMatch) continue;
    for (const [s, aid] of [["A", m.slotAAthleteId], ["B", m.slotBAthleteId]] as const) {
      if (aid === athleteId && !(m.id === matchId && s === side)) return "Участник уже стоит в паре этого круга";
    }
  }
  return null;
}

/** Строки секции «Правка сетки по схваткам» — чистая функция (покрыта тестами). */
function buildSlotEditRowsSync(matches: SlotMatchLite[]): SlotEditRow[] {
  const order = orderedMatches(matches);
  const lastRound = Math.max(0, ...order.filter((m) => !m.isBronzeMatch).map((m) => m.roundNumber));
  const plans = planSlotEdits(matches);
  return order.map((m, i) => {
    const plan = plans.get(m.id)!;
    return {
      id: m.id,
      num: i + 1,
      roundLabel: roundName(m, lastRound),
      status: m.status,
      hasResult: m.hasResult,
      isBye: plan.isBye,
      canReopenBye: plan.canReopenBye,
      canWalkover: plan.canWalkover,
      winnerAthleteId: m.winnerAthleteId,
      winType: m.winType,
      slotA: plan.slots.A,
      slotB: plan.slots.B,
    };
  });
}

// Файл с «use server» может экспортировать только async-функции —
// тонкие async-обёртки над чистыми функциями выше (для страницы и тестов).
export async function buildSlotEditRows(matches: SlotMatchLite[]): Promise<SlotEditRow[]> {
  return buildSlotEditRowsSync(matches);
}

export async function slotDuplicateRefusal(
  matches: SlotMatchLite[],
  matchId: string,
  side: SlotSide,
  athleteId: string,
): Promise<string | null> {
  return duplicateSlotRefusalSync(matches, matchId, side, athleteId);
}

function toSlotMatchLite(m: {
  id: string;
  roundNumber: number;
  positionInRound: number;
  isBronzeMatch: boolean;
  isRoundRobin: boolean;
  status: string;
  slotAAthleteId: string | null;
  slotBAthleteId: string | null;
  slotAFromMatchId: string | null;
  slotBFromMatchId: string | null;
  winnerAthleteId: string | null;
  result: { id: string; winType?: string } | null;
}): SlotMatchLite {
  return {
    id: m.id,
    roundNumber: m.roundNumber,
    positionInRound: m.positionInRound,
    isBronzeMatch: m.isBronzeMatch,
    isRoundRobin: m.isRoundRobin,
    status: m.status,
    slotAAthleteId: m.slotAAthleteId,
    slotBAthleteId: m.slotBAthleteId,
    slotAFromMatchId: m.slotAFromMatchId,
    slotBFromMatchId: m.slotBFromMatchId,
    winnerAthleteId: m.winnerAthleteId,
    hasResult: !!m.result,
    winType: m.result?.winType ?? null,
  };
}

const slotField = (side: SlotSide) => (side === "A" ? "slotAAthleteId" as const : "slotBAthleteId" as const);

function slotAthlete(m: { slotAAthleteId: string | null; slotBAthleteId: string | null }, side: SlotSide): string | null {
  return side === "A" ? m.slotAAthleteId : m.slotBAthleteId;
}

/** Номер схватки в списке «Правка сетки по схваткам» (для сообщений об отказе). */
async function matchDisplayNum(categoryId: string, matchId: string): Promise<number> {
  const ms = await prisma.match.findMany({
    where: { categoryId },
    select: { id: true, roundNumber: true, positionInRound: true, isBronzeMatch: true },
  });
  const order = orderedMatches(ms);
  const i = order.findIndex((m) => m.id === matchId);
  return i + 1;
}

/** Записать участника в слот PENDING-схватки или очистить его (ручная правка сетки). */
export async function setSlot(matchId: string, side: SlotSide, athleteId: string | null): Promise<Res> {
  const match = await prisma.match.findUnique({ where: { id: matchId }, include: { result: { select: { id: true } } } });
  if (!match) return { ok: false, msg: "Схватка не найдена" };
  const { category, user } = await orgCategory(match.categoryId);
  if (match.status !== "PENDING") {
    return {
      ok: false,
      msg: match.result ? "Сыгранная схватка правится на странице судьи" : "Это проход — соперника ставят кнопкой «Поставить соперника»",
    };
  }
  const current = slotAthlete(match, side);
  if (current === athleteId) return { ok: true, msg: "Без изменений" };
  const fromId = side === "A" ? match.slotAFromMatchId : match.slotBFromMatchId;
  if (fromId) {
    const feeder = await prisma.match.findUnique({ where: { id: fromId } });
    if (feeder && feeder.status !== "COMPLETED") {
      const n = await matchDisplayNum(match.categoryId, fromId);
      return { ok: false, msg: `Это место заполнит победитель схватки №${n}` };
    }
  }
  if (athleteId) {
    const reg = await prisma.registration.findFirst({ where: { categoryId: match.categoryId, athleteId, status: { in: IN_BRACKET } } });
    if (!reg) return { ok: false, msg: "Участник не в заявке категории" };
    const all = await prisma.match.findMany({
      where: { categoryId: match.categoryId },
      include: { result: { select: { id: true } } },
    });
    const dup = duplicateSlotRefusalSync(all.map(toSlotMatchLite), matchId, side, athleteId);
    if (dup) return { ok: false, msg: dup };
  }
  await prisma.$transaction(async (tx) => {
    const upd = await tx.match.updateMany({
      where: { id: matchId, version: match.version },
      data: { [slotField(side)]: athleteId, version: { increment: 1 } },
    });
    if (upd.count === 0) throw new Error("Схватка изменилась — обновите страницу и повторите");
    await appendAudit(tx, {
      actorId: user.id,
      action: "bracket.slot",
      entity: "Match",
      entityId: matchId,
      before: { side, athleteId: current },
      after: { side, athleteId },
    });
  });
  refresh(category.eventId, match.categoryId);
  return { ok: true, msg: athleteId ? "Слот обновлён" : "Слот очищен" };
}

/** Поставить соперника в проход: слот заполнен, схватка снова PENDING, зависимые слоты очищены. */
export async function reopenBye(matchId: string, athleteId: string): Promise<Res> {
  const match = await prisma.match.findUnique({ where: { id: matchId }, include: { result: { select: { id: true } } } });
  if (!match) return { ok: false, msg: "Схватка не найдена" };
  const { category, user } = await orgCategory(match.categoryId);
  if (!isByeMatch(toSlotMatchLite(match))) return { ok: false, msg: "Это не проход — постановка соперника недоступна" };
  const filled = match.slotAAthleteId ?? match.slotBAthleteId!;
  if (athleteId === filled) return { ok: false, msg: "Участник уже в этой схватке" };
  const reg = await prisma.registration.findFirst({ where: { categoryId: match.categoryId, athleteId, status: { in: IN_BRACKET } } });
  if (!reg) return { ok: false, msg: "Участник не в заявке категории" };
  const dependents = await prisma.match.findMany({
    where: { OR: [{ slotAFromMatchId: matchId }, { slotBFromMatchId: matchId }] },
    include: { result: { select: { id: true } } },
  });
  if (dependents.some((d) => d.status === "COMPLETED" && d.result)) {
    return { ok: false, msg: "Нельзя: следующая схватка уже сыграна" };
  }
  const emptySide: SlotSide = match.slotAAthleteId ? "B" : "A";
  await prisma.$transaction(async (tx) => {
    const upd = await tx.match.updateMany({
      where: { id: matchId, version: match.version },
      data: {
        [slotField(emptySide)]: athleteId,
        status: "PENDING",
        winnerAthleteId: null,
        loserAthleteId: null,
        endedAt: null,
        version: { increment: 1 },
      },
    });
    if (upd.count === 0) throw new Error("Схватка изменилась — обновите страницу и повторите");
    for (const d of dependents) {
      const clear: Record<string, null> = {};
      if (d.slotAFromMatchId === matchId) clear[slotField("A")] = null;
      if (d.slotBFromMatchId === matchId) clear[slotField("B")] = null;
      if (Object.keys(clear).length) await tx.match.update({ where: { id: d.id }, data: clear });
    }
    await appendAudit(tx, {
      actorId: user.id,
      action: "bracket.reopenBye",
      entity: "Match",
      entityId: matchId,
      before: { winner: filled },
      after: { side: emptySide, athleteId },
    });
  });
  refresh(category.eventId, match.categoryId);
  return { ok: true, msg: "Соперник поставлен — схватка открыта" };
}

/** Проход: единственный участник PENDING-схватки выигрывает без боя (без записи Result),
 *  победитель продвигается по сетке в той же транзакции. */
export async function walkover(matchId: string): Promise<Res> {
  const match = await prisma.match.findUnique({ where: { id: matchId } });
  if (!match) return { ok: false, msg: "Схватка не найдена" };
  const { category, user } = await orgCategory(match.categoryId);
  if (match.status !== "PENDING") return { ok: false, msg: "Схватка уже завершена" };
  const hasA = !!match.slotAAthleteId;
  const hasB = !!match.slotBAthleteId;
  if (hasA === hasB) return { ok: false, msg: "Проход возможен, только когда в схватке ровно один участник" };
  const filledSide: SlotSide = hasA ? "A" : "B";
  const winnerId = slotAthlete(match, filledSide)!;
  const fromId = filledSide === "A" ? match.slotBFromMatchId : match.slotAFromMatchId;
  if (fromId) {
    const feeder = await prisma.match.findUnique({ where: { id: fromId } });
    if (feeder && feeder.status !== "COMPLETED") {
      const n = await matchDisplayNum(match.categoryId, fromId);
      return { ok: false, msg: `Это место заполнит победитель схватки №${n}` };
    }
  }
  await prisma.$transaction(async (tx) => {
    const upd = await tx.match.updateMany({
      where: { id: matchId, version: match.version, status: "PENDING" },
      data: {
        status: "COMPLETED",
        winnerAthleteId: winnerId,
        loserAthleteId: null,
        endedAt: new Date(),
        version: { increment: 1 },
      },
    });
    if (upd.count === 0) throw new Error("Схватка изменилась — обновите страницу и повторите");
    await advanceWinner(tx, matchId);
    await appendAudit(tx, {
      actorId: user.id,
      action: "bracket.walkover",
      entity: "Match",
      entityId: matchId,
      before: { status: "PENDING", winner: null },
      after: { winner: winnerId },
    });
  });
  refresh(category.eventId, match.categoryId);
  return { ok: true, msg: "Проход зачтён" };
}
