"use server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth/session";
import { weightFits, eligibleCategories, type Cat, type AthleteInfo } from "@/lib/domain/eligibility";
import { canMerge, type MergeCat } from "@/lib/domain/merge";
import { canTransition } from "@/lib/data/preset";
import { buildBracketForCategory } from "@/lib/domain/persistBracket";
import { selectTier, priceEntry, type Tier } from "@/lib/domain/pricing";

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

export type WeighInResult = { ok: boolean; status: string; msg: string };

/** Взвесить и допустить: пишем фактический вес, создаём попытку, валидируем вес.
 *  Подходит → ADMITTED. Перевес → пытаемся переклассифицировать в ближайшую подходящую
 *  категорию (тот же event/discipline/sex) с play-up. Нет подходящей → OVERWEIGHT. */
export async function weighInAndAdmit(registrationId: string, actualWeight: number): Promise<WeighInResult> {
  await requireRole(...ORG_ROLES);

  const reg = await prisma.registration.findUnique({
    where: { id: registrationId },
    include: { category: true, athlete: true },
  });
  if (!reg) return { ok: false, status: "ERROR", msg: "Регистрация не найдена" };

  const event = await prisma.event.findUnique({ where: { id: reg.category.eventId } });
  if (event && isWeighInLocked(event.status)) {
    return { ok: false, status: reg.status, msg: "Взвешивание закрыто (турнир уже идёт)" };
  }

  const cat = toCat(reg.category);
  const fits = weightFits(actualWeight, cat);

  await prisma.$transaction(async (tx) => {
    await tx.registration.update({
      where: { id: registrationId },
      data: { actualWeight, weighedAt: new Date() },
    });
    await tx.weighInAttempt.create({
      data: { registrationId, weight: actualWeight, ok: fits },
    });
  });

  if (fits) {
    await prisma.registration.update({
      where: { id: registrationId },
      data: { status: "ADMITTED", admittedAt: new Date(), effectiveCategoryId: reg.categoryId },
    });
    revalidatePath(`/organizer/${reg.category.eventId}`);
    return { ok: true, status: "ADMITTED", msg: `Допущен (${actualWeight} кг)` };
  }

  // Перевес — ищем подходящую категорию в том же событии/дисциплине/поле.
  const birthYear = reg.athlete.birthDate.getUTCFullYear();
  const info: AthleteInfo = { sex: reg.athlete.sex as "M" | "F", birthYear, weight: actualWeight };

  const siblings = (await prisma.category.findMany({
    where: {
      eventId: reg.category.eventId,
      discipline: reg.category.discipline,
      sex: reg.category.sex,
      isAbsolute: false,
      mergedIntoId: null,
    },
  })) as CategoryRow[];

  const candidates = eligibleCategories(info, cat.discipline, siblings.map(toCat), { allowPlayUp: true })
    // ближайшая по весу сверху
    .sort((x, y) => (x.weightMax ?? 1e9) - (y.weightMax ?? 1e9));
  const target = candidates.find((c) => c.id !== reg.categoryId) ?? candidates[0] ?? null;

  if (target) {
    await prisma.registration.update({
      where: { id: registrationId },
      // effectiveCategoryId хранит фактическую категорию; buildBracketForCategory читает categoryId.
      data: { categoryId: target.id, effectiveCategoryId: target.id, status: "ADMITTED", admittedAt: new Date() },
    });
    revalidatePath(`/organizer/${reg.category.eventId}`);
    return { ok: true, status: "ADMITTED", msg: `Перевес → переведён в другую категорию и допущен` };
  }

  await prisma.registration.update({
    where: { id: registrationId },
    data: { status: "OVERWEIGHT" },
  });
  revalidatePath(`/organizer/${reg.category.eventId}`);
  return { ok: false, status: "OVERWEIGHT", msg: `Перевес ${actualWeight} кг — подходящей категории нет` };
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
    prisma.registration.findFirst({ where: { categoryId, athleteId: athleteId1, status: "ADMITTED" } }),
    prisma.registration.findFirst({ where: { categoryId, athleteId: athleteId2, status: "ADMITTED" } }),
  ]);
  if (!r1 || !r2) return { ok: false, msg: "Регистрация не найдена" };

  // Если seed не проставлен — берём текущий порядок (индекс) как базовый посев.
  const ordered = await prisma.registration.findMany({
    where: { categoryId, status: "ADMITTED" },
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
    where: { categoryId, status: "ADMITTED" },
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
    where: { categoryId, status: "ADMITTED" },
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
  await requireRole("ORGANIZER", "ADMIN");

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
  return { ok: true, msg: surcharge ? `Добавлен в абсолютку (+${surcharge} ₽)` : "Добавлен в абсолютку" };
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
