"use server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole, requireEventRole, seesFinance } from "@/lib/auth/session";
import { weightFits, eligibleCategories, type Cat, type AthleteInfo } from "@/lib/domain/eligibility";
import { canMerge, type MergeCat } from "@/lib/domain/merge";
import { canTransition } from "@/lib/data/preset";
import { buildBracketForCategory } from "@/lib/domain/persistBracket";
import { selectTier, priceEntry, type Tier } from "@/lib/domain/pricing";
import { appendAudit } from "@/lib/domain/audit";
import { categoryLabel } from "@/lib/domain/snapshot";
import { IN_BRACKET } from "@/lib/domain/bracketStatus";
import { listDropouts } from "../lib/domain/dropouts";
import { isRefundStatus, type RefundStatus } from "../lib/domain/dropoutRefund";

const ORG_ROLES = ["ORGANIZER", "ADMIN", "MAT_COORDINATOR"] as const;

// В схеме нет поля-локи взвешивания. Гейтим через Event.status: взвешивание открыто
// только до старта турнира (DRAFT/REG_OPEN/REG_CLOSED); LIVE/COMPLETED/ARCHIVED — закрыто.
// Файл — "use server", поэтому не-async экспорты запрещены: используем локальный хелпер.
const WEIGH_IN_OPEN_STATUSES = ["DRAFT", "REG_OPEN", "REG_CLOSED"];
function isWeighInLocked(status: string): boolean {
  return !WEIGH_IN_OPEN_STATUSES.includes(status);
}

type CategoryRow = {
  id: string;
  eventId: string;
  sex: string;
  discipline: string;
  birthYearFrom: number;
  birthYearTo: number;
  weightMin: number | null;
  weightMax: number | null;
  isOpenTop: boolean;
  isAbsolute: boolean;
  level: string;
};

function toCat(c: CategoryRow): Cat {
  return {
    id: c.id,
    sex: c.sex as "M" | "F",
    discipline: c.discipline as "gi" | "nogi",
    birthYearFrom: c.birthYearFrom,
    birthYearTo: c.birthYearTo,
    weightMin: c.weightMin,
    weightMax: c.weightMax,
    isOpenTop: c.isOpenTop,
    isAbsolute: c.isAbsolute,
    level: c.level,
  };
}

export type WeighInCategory = { categoryId: string; label: string };
export type WeighInResult = { ok: boolean; status: string; msg: string; suggestion?: WeighInCategory | null };

/** Record every weigh-in; only a fitting weight grants automatic admission. */
export async function weighInAndAdmit(registrationId: string, actualWeight: number): Promise<WeighInResult> {
  await requireRole(...ORG_ROLES);
  if (!Number.isFinite(actualWeight) || actualWeight <= 0) {
    return { ok: false, status: "ERROR", msg: "Неверный вес" };
  }
  const reg = await prisma.registration.findUnique({
    where: { id: registrationId }, include: { category: true, athlete: true },
  });
  if (!reg) return { ok: false, status: "ERROR", msg: "Регистрация не найдена" };
  const event = await prisma.event.findUnique({ where: { id: reg.category.eventId } });
  if (!event || isWeighInLocked(event.status)) {
    return { ok: false, status: reg.status, msg: "Взвешивание закрыто (турнир уже идёт)" };
  }
  if (reg.status !== "ENTERED") return { ok: false, status: reg.status, msg: "Регистрация уже обработана" };
  const cat = toCat(reg.category);
  const fits = weightFits(actualWeight, cat);
  const now = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.registration.update({
      where: { id: registrationId },
      data: { actualWeight, weighedAt: now,
        ...(fits ? { status: "ADMITTED", admittedAt: now, effectiveCategoryId: reg.categoryId } : {}),
      },
    });
    await tx.weighInAttempt.create({ data: { registrationId, weight: actualWeight, ok: fits } });
  });
  revalidatePath(`/organizer/${reg.category.eventId}`);
  revalidatePath(`/category/${reg.categoryId}`);
  if (fits) return { ok: true, status: "ADMITTED", msg: `Допущен (${actualWeight} кг)` };

  const underweight = cat.weightMin != null && actualWeight <= cat.weightMin;
  const info: AthleteInfo = {
    sex: reg.athlete.sex as "M" | "F", birthYear: reg.athlete.birthDate.getUTCFullYear(),
    weight: actualWeight, level: cat.level,
  };
  const siblings = await prisma.category.findMany({
    where: { eventId: reg.category.eventId, discipline: cat.discipline, sex: cat.sex,
      level: cat.level, isAbsolute: false, mergedIntoId: null, id: { not: reg.categoryId } },
  });
  const cap = (c: Cat) => c.isOpenTop ? Infinity : c.weightMax ?? Infinity;
  const candidates = eligibleCategories(info, cat.discipline, siblings.map(toCat), { allowPlayUp: true })
    .filter((c) => underweight ? cap(c) < cap(cat) : cap(c) > cap(cat))
    .sort((x, y) => underweight ? cap(y) - cap(x) : cap(x) - cap(y));
  const target = siblings.find((c) => c.id === candidates[0]?.id);
  return {
    ok: false, status: "NEEDS_DECISION",
    msg: underweight
      ? `Недовес: ${actualWeight} кг, категория свыше ${cat.weightMin} кг`
      : `Перевес: ${actualWeight} кг при лимите до ${cat.weightMax} кг`,
    suggestion: target ? { categoryId: target.id, label: categoryLabel(target) } : null,
  };
}

/** Load manual destinations only when the organizer opens the selector. */
export async function weighInCategoryOptions(registrationId: string): Promise<WeighInCategory[]> {
  await requireRole(...ORG_ROLES);
  const reg = await prisma.registration.findUnique({ where: { id: registrationId }, include: { category: true } });
  if (!reg) return [];
  const categories = await prisma.category.findMany({
    where: { eventId: reg.category.eventId, discipline: reg.category.discipline,
      mergedIntoId: null, id: { not: reg.categoryId } },
    orderBy: { order: "asc" },
  });
  return categories.map((c) => ({ categoryId: c.id, label: categoryLabel(c) }));
}

/** Apply an explicit organizer decision without rebuilding either bracket. */
export async function resolveWeighIn(
  registrationId: string, decision: "KEEP" | "MOVE" | "WITHDRAW", targetCategoryId?: string,
): Promise<WeighInResult> {
  const user = await requireRole(...ORG_ROLES);
  const result = await prisma.$transaction(async (tx) => {
    const fail = (msg: string) => ({ ok: false as const, status: "ERROR", msg });
    if (!["KEEP", "MOVE", "WITHDRAW"].includes(decision)) return fail("Неизвестное решение");
    const reg = await tx.registration.findUnique({ where: { id: registrationId }, include: { category: true } });
    if (!reg) return fail("Регистрация не найдена");
    const event = await tx.event.findUnique({ where: { id: reg.category.eventId } });
    if (!event || isWeighInLocked(event.status)) return fail("Взвешивание закрыто (турнир уже идёт)");
    if (reg.status !== "ENTERED" || reg.actualWeight == null || !reg.weighedAt) {
      return fail("Сначала взвесьте участника с необработанной регистрацией");
    }
    let target = reg.category;
    const notes: string[] = [];
    if (decision === "MOVE") {
      if (!targetCategoryId || targetCategoryId === reg.categoryId) return fail("Выберите другую категорию");
      const found = await tx.category.findUnique({ where: { id: targetCategoryId } });
      if (!found || found.eventId !== reg.category.eventId || found.discipline !== reg.category.discipline || found.mergedIntoId) {
        return fail("Выберите необъединённую категорию этого турнира и той же дисциплины");
      }
      target = found;
      for (const category of [reg.category, target]) {
        const results = await tx.match.count({ where: { categoryId: category.id, result: { isNot: null } } });
        if (results) return fail(`В категории «${categoryLabel(category)}» уже есть результаты — перевод невозможен`);
        const matches = await tx.match.count({ where: { categoryId: category.id } });
        if (matches || category.bracketVersion > 0) notes.push(`В категории «${categoryLabel(category)}» уже есть сетка — пересоберите её`);
      }
    }
    const now = new Date();
    const data = decision === "WITHDRAW"
      ? { status: "WITHDRAWN", withdrawnAt: now, withdrawReason: "перевес на взвешивании" }
      : { status: "ADMITTED", admittedAt: now, categoryId: target.id, effectiveCategoryId: target.id };
    await tx.registration.update({ where: { id: registrationId }, data });
    await appendAudit(tx, {
      actorId: user.id, action: "weighin.decision", entity: "Registration", entityId: registrationId,
      before: { categoryId: reg.categoryId, effectiveCategoryId: reg.effectiveCategoryId, status: reg.status,
        admittedAt: reg.admittedAt, withdrawnAt: reg.withdrawnAt, withdrawReason: reg.withdrawReason },
      after: { decision, ...data },
    });
    const msg = decision === "WITHDRAW" ? "Снят с категории"
      : decision === "KEEP" ? "Допущен в своей категории" : `Переведён в «${categoryLabel(target)}» и допущен`;
    return { ok: true as const, status: data.status, msg: [msg, ...notes].join(". "),
      eventId: reg.category.eventId, categoryIds: [...new Set([reg.categoryId, target.id])] };
  });
  if (result.ok) {
    revalidatePath(`/organizer/${result.eventId}`);
    for (const id of result.categoryIds) revalidatePath(`/category/${id}`);
  }
  return { ok: result.ok, status: result.status, msg: result.msg };
}

/** Блокировка/разблокировка взвешивания на уровне события. В схеме нет отдельного поля —
 *  используем машину состояний Event.status: заблокировать = REG_CLOSED → LIVE (старт турнира),
 *  разблокировать = REG_OPEN → REG_CLOSED. Переходы валидируются canTransition; назад из LIVE нельзя. */
export async function setWeighInLock(eventId: string, locked: boolean): Promise<{ ok: boolean; msg: string }> {
  await requireRole(...ORG_ROLES);
  const event = await prisma.event.findUnique({ where: { id: eventId } });
  if (!event) return { ok: false, msg: "Событие не найдено" };

  if (locked) {
    if (isWeighInLocked(event.status)) return { ok: true, msg: "Взвешивание уже закрыто" };
    if (!canTransition(event.status, "LIVE")) {
      return { ok: false, msg: `Из статуса ${event.status} нельзя стартовать турнир` };
    }
    await prisma.event.update({ where: { id: eventId }, data: { status: "LIVE" } });
    revalidatePath(`/organizer/${eventId}`);
    return { ok: true, msg: "Взвешивание закрыто, турнир запущен" };
  }

  if (!isWeighInLocked(event.status)) return { ok: true, msg: "Взвешивание уже открыто" };
  return { ok: false, msg: "Турнир уже идёт — вернуть взвешивание нельзя" };
}

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

/** Применить объединение source → target. Инвариант: только ДО генерации сетки
 *  (обе категории не GENERATED, без frozenAt, без матчей). Переносим регистрации,
 *  ставим Category.mergedIntoId. Запрещаем self-merge и циклы. */
export async function applyMerge(
  sourceCategoryId: string,
  targetCategoryId: string
): Promise<{ ok: boolean; msg: string }> {
  await requireRole(...ORG_ROLES);
  if (sourceCategoryId === targetCategoryId) return { ok: false, msg: "Нельзя объединять категорию саму с собой" };

  const [source, target] = await Promise.all([
    prisma.category.findUnique({ where: { id: sourceCategoryId } }),
    prisma.category.findUnique({ where: { id: targetCategoryId } }),
  ]);
  if (!source || !target) return { ok: false, msg: "Категория не найдена" };
  if (source.eventId !== target.eventId) return { ok: false, msg: "Категории из разных событий" };
  if (source.mergedIntoId) return { ok: false, msg: "Источник уже объединён" };
  if (target.mergedIntoId) return { ok: false, msg: "Цель сама объединена — выберите конечную категорию" };

  // Инвариант: только до генерации сетки.
  const blocked = [source, target].some((c) => c.status === "GENERATED" || c.frozenAt);
  if (blocked) return { ok: false, msg: "Нельзя объединять после генерации сетки" };
  const matchCount = await prisma.match.count({
    where: { categoryId: { in: [sourceCategoryId, targetCategoryId] } },
  });
  if (matchCount > 0) return { ok: false, msg: "Есть матчи — объединение запрещено" };

  // Валидация hard-constraints + защита от цикла (target уже указывает на source).
  const cyc = await prisma.category.findFirst({ where: { id: targetCategoryId, mergedIntoId: sourceCategoryId } });
  if (cyc) return { ok: false, msg: "Обнаружен цикл объединения" };

  const [srcCount, tgtCount] = await Promise.all([
    prisma.registration.count({ where: { categoryId: sourceCategoryId } }),
    prisma.registration.count({ where: { categoryId: targetCategoryId } }),
  ]);
  const a = toMergeCat(source, srcCount);
  const b = toMergeCat(target, tgtCount);
  if (!canMerge(a, b)) return { ok: false, msg: "Категории несовместимы (пол/дисциплина/возрастная полоса/абсолютка)" };

  await prisma.$transaction(async (tx) => {
    await tx.registration.updateMany({
      where: { categoryId: sourceCategoryId },
      data: { categoryId: targetCategoryId, effectiveCategoryId: targetCategoryId },
    });
    await tx.category.update({
      where: { id: sourceCategoryId },
      data: { mergedIntoId: targetCategoryId, status: "MERGED" },
    });
  });

  revalidatePath(`/organizer/${source.eventId}`);
  return { ok: true, msg: "Категории объединены" };
}

// ─────────────────────────────────────────────────────────────────────────────
// FEATURE 1 — Ручное редактирование сетки (развести братьев/одноклубников)
// ─────────────────────────────────────────────────────────────────────────────

/** Инвариант "до реальных схваток": редактирование посева/пересборка разрешены только
 *  пока не сыграна ни одна настоящая схватка. BYE-матчи автозакрываются resolveByes и
 *  НЕ имеют Result — поэтому COMPLETED-матч с привязанным Result = реальный сыгранный. */
async function assertNoRealResults(categoryId: string): Promise<string | null> {
  const finalized = await prisma.result.count({ where: { match: { categoryId }, finalized: true } });
  if (finalized > 0) return "В категории есть финализированные результаты — правка сетки запрещена";
  const played = await prisma.match.count({
    where: { categoryId, status: "COMPLETED", result: { isNot: null } },
  });
  if (played > 0) return "В категории уже сыграны схватки — правка сетки запрещена";
  return null;
}

/** Поменять местами посев двух атлетов и пересобрать сетку (с club-separation).
 *  Безопасный способ ручной правки: переставляем seed на регистрациях и пересобираем. */
export async function swapSeeds(
  categoryId: string,
  athleteId1: string,
  athleteId2: string
): Promise<{ ok: boolean; msg: string }> {
  await requireRole("ORGANIZER", "ADMIN");
  if (athleteId1 === athleteId2) return { ok: false, msg: "Выбраны одинаковые атлеты" };

  const blocked = await assertNoRealResults(categoryId);
  if (blocked) return { ok: false, msg: blocked };

  const [r1, r2] = await Promise.all([
    prisma.registration.findFirst({ where: { categoryId, athleteId: athleteId1, status: { in: IN_BRACKET } } }),
    prisma.registration.findFirst({ where: { categoryId, athleteId: athleteId2, status: { in: IN_BRACKET } } }),
  ]);
  if (!r1 || !r2) return { ok: false, msg: "Регистрация не найдена" };

  // Если seed не проставлен — берём текущий порядок (индекс) как базовый посев.
  const ordered = await prisma.registration.findMany({
    where: { categoryId, status: { in: IN_BRACKET } },
    orderBy: { seed: "asc" },
  });
  const seedOf = (id: string) => {
    const reg = ordered.find((x) => x.id === id)!;
    return reg.seed ?? ordered.indexOf(reg) + 1;
  };
  const s1 = seedOf(r1.id);
  const s2 = seedOf(r2.id);

  await prisma.$transaction(async (tx) => {
    await tx.registration.update({ where: { id: r1.id }, data: { seed: s2 } });
    await tx.registration.update({ where: { id: r2.id }, data: { seed: s1 } });
  });
  await buildBracketForCategory(categoryId, { force: true });

  revalidatePath(`/category/${categoryId}`);
  return { ok: true, msg: "Посев изменён, сетка пересобрана" };
}

/** Задать конкретный посев атлету и пересобрать сетку. Остальные сдвигаются вокруг. */
export async function moveAthleteSeed(
  categoryId: string,
  athleteId: string,
  newSeed: number
): Promise<{ ok: boolean; msg: string }> {
  await requireRole("ORGANIZER", "ADMIN");
  if (!Number.isFinite(newSeed) || newSeed < 1) return { ok: false, msg: "Неверный номер посева" };

  const blocked = await assertNoRealResults(categoryId);
  if (blocked) return { ok: false, msg: blocked };

  const ordered = await prisma.registration.findMany({
    where: { categoryId, status: { in: IN_BRACKET } },
    orderBy: { seed: "asc" },
  });
  const target = ordered.find((r) => r.athleteId === athleteId);
  if (!target) return { ok: false, msg: "Регистрация не найдена" };

  // Собираем список без target, вставляем target на позицию newSeed, перенумеровываем 1..N.
  const rest = ordered.filter((r) => r.id !== target.id);
  const pos = Math.min(Math.max(1, Math.trunc(newSeed)), ordered.length);
  rest.splice(pos - 1, 0, target);

  await prisma.$transaction(async (tx) => {
    for (let i = 0; i < rest.length; i++) {
      await tx.registration.update({ where: { id: rest[i].id }, data: { seed: i + 1 } });
    }
  });
  await buildBracketForCategory(categoryId, { force: true });

  revalidatePath(`/category/${categoryId}`);
  return { ok: true, msg: "Посев изменён, сетка пересобрана" };
}

export type SeedRow = { athleteId: string; fullName: string; clubId: string | null; clubName: string | null; seed: number };
export type Conflict = { matchLabel: string; kind: "club" | "surname"; a: SeedRow; b: SeedRow };

/** Первый токен ФИО — используем как «фамилию» для эвристики родственников. */
function surnameToken(fullName: string): string {
  return (fullName.trim().split(/\s+/)[0] ?? "").toLowerCase();
}

/** Найти конфликтные пары 1-го круга: оба атлета из одного клуба ИЛИ с одной фамилией.
 *  Это «братья/одноклубники», которых по регламенту надо развести. */
export async function findBracketConflicts(
  categoryId: string
): Promise<{ seeds: SeedRow[]; conflicts: Conflict[] }> {
  await requireRole("ORGANIZER", "ADMIN");

  const regs = await prisma.registration.findMany({
    where: { categoryId, status: { in: IN_BRACKET } },
    include: { athlete: { include: { club: true } } },
    orderBy: { seed: "asc" },
  });
  const seeds: SeedRow[] = regs.map((r, i) => ({
    athleteId: r.athleteId,
    fullName: r.athlete.fullName,
    clubId: r.athlete.clubId,
    clubName: r.athlete.club?.name ?? null,
    seed: r.seed ?? i + 1,
  }));
  const byAthlete = new Map(seeds.map((s) => [s.athleteId, s]));

  // Реальные пары 1-го круга берём из сгенерированной сетки (учитывает BYE).
  const firstRound = await prisma.match.findMany({
    where: { categoryId, isBronzeMatch: false, roundNumber: 1 },
    orderBy: { positionInRound: "asc" },
  });
  const conflicts: Conflict[] = [];
  for (const m of firstRound) {
    if (!m.slotAAthleteId || !m.slotBAthleteId) continue;
    const a = byAthlete.get(m.slotAAthleteId);
    const b = byAthlete.get(m.slotBAthleteId);
    if (!a || !b) continue;
    const sameClub = !!a.clubId && a.clubId === b.clubId;
    const sameSurname = !!surnameToken(a.fullName) && surnameToken(a.fullName) === surnameToken(b.fullName);
    if (sameClub || sameSurname) {
      conflicts.push({
        matchLabel: `Круг 1 · пара ${m.positionInRound}`,
        kind: sameClub ? "club" : "surname",
        a,
        b,
      });
    }
  }
  return { seeds, conflicts };
}

/** «Развести» конфликт в один клик: меняем посев атлета b на посев нейтрального атлета
 *  (не из его клуба и не однофамильца), затем пересобираем сетку. */
export async function resolveConflict(
  categoryId: string,
  athleteId: string
): Promise<{ ok: boolean; msg: string }> {
  await requireRole("ORGANIZER", "ADMIN");

  const blocked = await assertNoRealResults(categoryId);
  if (blocked) return { ok: false, msg: blocked };

  const { seeds } = await findBracketConflicts(categoryId);
  const me = seeds.find((s) => s.athleteId === athleteId);
  if (!me) return { ok: false, msg: "Атлет не найден в категории" };

  // Нейтральный кандидат для обмена: другой клуб и другая фамилия.
  const neutral = seeds.find(
    (s) =>
      s.athleteId !== me.athleteId &&
      (!me.clubId || s.clubId !== me.clubId) &&
      surnameToken(s.fullName) !== surnameToken(me.fullName)
  );
  if (!neutral) return { ok: false, msg: "Нет нейтрального атлета для развода — правьте посев вручную" };

  return swapSeeds(categoryId, athleteId, neutral.athleteId);
}

// ─────────────────────────────────────────────────────────────────────────────
// FEATURE 2 — Абсолютка на месте (регистрация по ходу события + отдельная генерация)
// ─────────────────────────────────────────────────────────────────────────────

export type AbsoluteRosterRow = { registrationId: string; athleteId: string; fullName: string; clubName: string | null; status: string };
export type AbsoluteCandidate = { athleteId: string; fullName: string; clubName: string | null };

/** Ростер абсолютки + список атлетов события, которых можно добавить (поиск по имени). */
export async function absoluteRoster(
  absoluteCategoryId: string,
  query = ""
): Promise<{ roster: AbsoluteRosterRow[]; candidates: AbsoluteCandidate[] }> {
  await requireRole("ORGANIZER", "ADMIN");

  const category = await prisma.category.findUnique({ where: { id: absoluteCategoryId } });
  if (!category || !category.isAbsolute) return { roster: [], candidates: [] };

  const regs = await prisma.registration.findMany({
    where: { categoryId: absoluteCategoryId },
    include: { athlete: { include: { club: true } } },
    orderBy: { createdAt: "asc" },
  });
  const roster: AbsoluteRosterRow[] = regs.map((r) => ({
    registrationId: r.id,
    athleteId: r.athleteId,
    fullName: r.athlete.fullName,
    clubName: r.athlete.club?.name ?? null,
    status: r.status,
  }));
  const inAbsolute = new Set(regs.map((r) => r.athleteId));

  const q = query.trim().toLowerCase();
  const entries = await prisma.eventEntry.findMany({
    where: {
      eventId: category.eventId,
      ...(q ? { athlete: { fullName: { contains: q } } } : {}),
    },
    include: { athlete: { include: { club: true } } },
    orderBy: { athlete: { fullName: "asc" } },
    take: 50,
  });
  const candidates: AbsoluteCandidate[] = entries
    .filter((e) => !inAbsolute.has(e.athleteId))
    .map((e) => ({ athleteId: e.athleteId, fullName: e.athlete.fullName, clubName: e.athlete.club?.name ?? null }));

  return { roster, candidates };
}

/** Добавить атлета события в абсолютку: Registration(ADMITTED), пометить EventEntry.absoluteAdded,
 *  доплата за абсолютку по активному тиру. Запрещено, если сетка абсолютки уже сыграна. */
export async function addToAbsolute(
  absoluteCategoryId: string,
  athleteId: string
): Promise<{ ok: boolean; msg: string }> {
  const user = await requireRole("ORGANIZER", "ADMIN");

  const category = await prisma.category.findUnique({ where: { id: absoluteCategoryId } });
  if (!category) return { ok: false, msg: "Категория не найдена" };
  if (!category.isAbsolute) return { ok: false, msg: "Это не абсолютная категория" };

  const blocked = await assertNoRealResults(absoluteCategoryId);
  if (blocked) return { ok: false, msg: blocked };

  const entry = await prisma.eventEntry.findUnique({
    where: { athleteId_eventId: { athleteId, eventId: category.eventId } },
  });
  if (!entry) return { ok: false, msg: "Атлет не заявлен на событие" };

  const exists = await prisma.registration.findFirst({
    where: { categoryId: absoluteCategoryId, athleteId },
  });
  if (exists) return { ok: false, msg: "Атлет уже в абсолютке" };

  // Активный тир и его доплата за абсолютку (как в coach-actions).
  const event = await prisma.event.findUnique({ where: { id: category.eventId }, include: { priceTiers: true } });
  const tiers: Tier[] = (event?.priceTiers ?? []).map((t) => ({
    name: t.name, startsAt: t.startsAt, priceFirstCategory: t.priceFirstCategory, priceExtraCategory: t.priceExtraCategory,
  }));
  const tier = selectTier(tiers, new Date()) ?? tiers[0] ?? null;
  // абсолютка добавляется как ещё одна категория к уже заявленному атлету → доплата = цена доп. категории
  const surcharge = tier ? (tier.priceExtraCategory ?? tier.priceFirstCategory) : 0;

  await prisma.$transaction(async (tx) => {
    await tx.registration.create({
      data: {
        entryId: entry.id,
        athleteId,
        categoryId: absoluteCategoryId,
        status: "ADMITTED",
        admittedAt: new Date(),
      },
    });
    // Доплату начисляем только если ещё не была начислена ранее.
    await tx.eventEntry.update({
      where: { id: entry.id },
      data: {
        absoluteAdded: true,
        ...(entry.absoluteAdded ? {} : { priceTotal: { increment: surcharge } }),
      },
    });
  });

  revalidatePath(`/organizer/${category.eventId}`);
  revalidatePath(`/category/${absoluteCategoryId}`);
  return {
    ok: true,
    msg: surcharge && seesFinance(user, category.eventId) ? `Добавлен в абсолютку (+${surcharge} ₽)` : "Добавлен в абсолютку",
  };
}

/** Отдельная кнопка «Сверстать сетку абсолютки» — тонкая обёртка над buildBracketForCategory. */
export async function generateAbsoluteBracket(
  absoluteCategoryId: string
): Promise<{ ok: boolean; msg: string }> {
  await requireRole("ORGANIZER", "ADMIN");

  const category = await prisma.category.findUnique({ where: { id: absoluteCategoryId } });
  if (!category) return { ok: false, msg: "Категория не найдена" };
  if (!category.isAbsolute) return { ok: false, msg: "Это не абсолютная категория" };

  await buildBracketForCategory(absoluteCategoryId, { force: true });
  revalidatePath(`/organizer/${category.eventId}`);
  revalidatePath(`/category/${absoluteCategoryId}`);
  return { ok: true, msg: "Сетка абсолютки сверстана" };
}

/** Подтверждение оплаты взноса организатором (ручной трекинг). */
export type PaymentKind = "PAID" | "LATER" | "FREE";

// Публично заявка с любой отметкой выглядит оплаченной; реальный вид оплаты видят только организаторы.
export async function setEntryPayment(entryId: string, kind: PaymentKind | null): Promise<{ ok: boolean; msg: string }> {
  await requireRole("ORGANIZER", "ADMIN");
  const entry = await prisma.eventEntry.findUnique({ where: { id: entryId } });
  if (!entry) return { ok: false, msg: "Заявка не найдена" };
  if (kind && !["PAID", "LATER", "FREE"].includes(kind)) return { ok: false, msg: "Неизвестный вид оплаты" };
  const paid = kind !== null;
  await prisma.eventEntry.update({
    where: { id: entryId },
    data: { paid, paymentKind: kind, paidAt: paid ? (entry.paid ? entry.paidAt : new Date()) : null },
  });
  revalidatePath(`/organizer/${entry.eventId}`);
  return { ok: true, msg: paid ? "Отметка сохранена" : "Отметка снята" };
}

type EntryStatusResult = { ok: boolean; msg: string; skippedCategories: { id: string; label: string }[] };

// Only tournament withdrawals may be restored by this action.
async function changeEntryStatus(entryId: string, restore: boolean, reason?: string): Promise<EntryStatusResult> {
  const entry = await prisma.eventEntry.findUnique({ where: { id: entryId } });
  if (!entry) return { ok: false, msg: "Заявка не найдена", skippedCategories: [] };
  const user = await requireEventRole(entry.eventId, "ORGANIZER", "ADMIN");
  const result = await prisma.$transaction(async (tx) => {
    const registrations = await tx.registration.findMany({
      where: {
        entryId,
        ...(restore
          ? { status: "WITHDRAWN", OR: [{ withdrawReason: "снят с турнира" }, { withdrawReason: { startsWith: "entry:" } }] }
          : { status: { in: [...IN_BRACKET, "OVERWEIGHT"] } }),
      },
      include: { category: true },
    });
    const touched = new Set<string>();
    const skipped = new Map<string, string>();
    const now = new Date();
    const data = restore
      ? { status: "ENTERED", withdrawnAt: null, withdrawReason: null, admittedAt: null }
      : { status: "WITHDRAWN", withdrawnAt: now, withdrawReason: `entry:${reason || "снят с турнира"}` };
    const changed = [];
    for (const reg of registrations) {
      await tx.registration.update({ where: { id: reg.id }, data });
      changed.push({ id: reg.id, status: reg.status, withdrawnAt: reg.withdrawnAt, withdrawReason: reg.withdrawReason });
      touched.add(reg.categoryId);
    }
    const skippedCategories = Array.from(skipped, ([id, label]) => ({ id, label }));
    await appendAudit(tx, {
      actorId: user.id, action: restore ? "entry.restore" : "entry.withdraw", entity: "EventEntry", entityId: entryId,
      before: { registrations: changed },
      after: { ...data, registrationIds: changed.map((r) => r.id), skippedCategories },
    });
    return { touched: [...touched], count: changed.length, skippedCategories };
  });
  revalidatePath(`/organizer/${entry.eventId}`);
  for (const categoryId of result.touched) revalidatePath(`/category/${categoryId}`);
  const summary = result.count
    ? `${restore ? "Возвращено в категории" : "Снято с категорий"}: ${result.count}`
    : "Нет регистраций для изменения";
  return {
    ok: result.skippedCategories.length === 0,
    msg:
      summary +
      (result.skippedCategories.length
        ? `. Не возвращено в категории с результатами схваток: ${result.skippedCategories.map((c) => c.label).join("; ")}`
        : "") +
      (!restore && result.count ? ". Где схватки уже идут, сетка не меняется — оставшиеся схватки отметьте как неявку." : ""),
    skippedCategories: result.skippedCategories,
  };
}

export async function withdrawEntry(entryId: string, reason?: string): Promise<EntryStatusResult> {
  return changeEntryStatus(entryId, false, reason);
}

export async function restoreEntry(entryId: string): Promise<EntryStatusResult> {
  return changeEntryStatus(entryId, true);
}

export async function markRefund(eventId: string, entryId: string, status: RefundStatus): Promise<{ ok: boolean; msg: string }> {
  const user = await requireEventRole(eventId, "ORGANIZER", "ADMIN");
  if (!isRefundStatus(status)) return { ok: false, msg: "Неизвестный статус возврата" };
  const rows = await listDropouts(eventId);
  if (!rows.some((row) => row.entryId === entryId)) return { ok: false, msg: "Выбывшая заявка не найдена в этом турнире" };
  await prisma.$transaction((tx) => appendAudit(tx, {
    actorId: user.id, action: "refund.mark", entity: "EventEntry", entityId: entryId, after: { status },
  }));
  revalidatePath("/organizer/[eventId]", "page");
  return { ok: true, msg: "Статус возврата сохранён" };
}

/** Удаление заявки организатором (дубли: человек заявился сам и его же заявил тренер).
 *  Нельзя, если участник уже стоит в сверстанной сетке. Профиль без аккаунта и без других
 *  заявок удаляется вместе с согласиями; снимок заявки пишется в аудит. */
export async function deleteEntry(entryId: string): Promise<{ ok: boolean; msg: string }> {
  await requireRole("ORGANIZER", "ADMIN");
  const entry = await prisma.eventEntry.findUnique({
    where: { id: entryId },
    include: { athlete: { include: { club: true } }, registrations: { include: { category: true } } },
  });
  if (!entry) return { ok: false, msg: "Заявка не найдена" };
  const user = await requireEventRole(entry.eventId, "ORGANIZER", "ADMIN");

  const athleteId = entry.athleteId;
  const inBracket = await prisma.match.count({
    where: {
      categoryId: { in: entry.registrations.map((r) => r.categoryId) },
      OR: [{ slotAAthleteId: athleteId }, { slotBAthleteId: athleteId }, { winnerAthleteId: athleteId }, { loserAthleteId: athleteId }],
    },
  });
  if (inBracket) return { ok: false, msg: "Участник уже в сетке — сначала уберите его из сетки" };

  await prisma.$transaction(async (tx) => {
    const regIds = entry.registrations.map((r) => r.id);
    await tx.weighInAttempt.deleteMany({ where: { registrationId: { in: regIds } } });
    await tx.registration.deleteMany({ where: { id: { in: regIds } } });
    await tx.eventEntry.delete({ where: { id: entryId } });
    const orphan = !entry.athlete.userId && (await tx.eventEntry.count({ where: { athleteId } })) === 0;
    if (orphan) {
      await tx.consent.deleteMany({ where: { athleteId } });
      await tx.athlete.delete({ where: { id: athleteId } });
    }
    await appendAudit(tx, {
      actorId: user.id,
      action: "entry.delete",
      entity: "EventEntry",
      entityId: entryId,
      before: {
        athlete: entry.athlete.fullName,
        birthDate: entry.athlete.birthDate,
        phone: entry.athlete.phone,
        club: entry.athlete.club?.name ?? null,
        source: entry.source,
        priceTotal: entry.priceTotal,
        paid: entry.paid,
        paymentKind: entry.paymentKind,
        categories: entry.registrations.map((r) => r.category.id),
        athleteDeleted: orphan,
      },
    });
  });
  revalidatePath(`/organizer/${entry.eventId}`);
  return { ok: true, msg: "Заявка удалена" };
}

/** Ковёр категории: сохраняется у категории и проставляется во все её схватки (null — снять). */
export async function setCategoryMat(categoryId: string, mat: number | null): Promise<{ ok: boolean; msg: string }> {
  const category = await prisma.category.findUnique({ where: { id: categoryId }, include: { event: true } });
  if (!category) return { ok: false, msg: "Категория не найдена" };
  await requireEventRole(category.eventId, "ORGANIZER", "ADMIN");
  if (mat != null && (!Number.isInteger(mat) || mat < 1 || mat > category.event.matsCount)) {
    return { ok: false, msg: `Ковёр должен быть от 1 до ${category.event.matsCount}` };
  }
  await prisma.$transaction([
    prisma.category.update({ where: { id: categoryId }, data: { matNumber: mat } }),
    prisma.match.updateMany({ where: { categoryId }, data: { matNumber: mat } }),
  ]);
  revalidatePath(`/organizer/${category.eventId}`);
  revalidatePath(`/category/${categoryId}`);
  return { ok: true, msg: mat ? `Ковёр ${mat}` : "Ковёр снят" };
}
