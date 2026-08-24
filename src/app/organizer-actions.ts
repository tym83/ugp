"use server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth/session";
import { weightFits, eligibleCategories, type Cat, type AthleteInfo } from "@/lib/domain/eligibility";
import { canMerge, type MergeCat } from "@/lib/domain/merge";
import { canTransition } from "@/lib/data/preset";

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
