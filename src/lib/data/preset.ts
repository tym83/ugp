// Переиспользуемый билдер события из пресета.
// Идемпотентно создаёт Event + категории + тиры цен + ковры из объекта-пресета.
// Данные пресета «Танкоград» живут в ./tankograd.ts; здесь — только сборка.

import type { PrismaClient } from "@prisma/client";
import { tankogradCategories, TANKOGRAD_EVENT, TANKOGRAD_TIERS, type CategorySpec } from "./tankograd";

// ---------- Жизненный цикл события (EventStatus) ----------
// Хранится строкой (SQLite), валидируется приложением.
// DRAFT → REG_OPEN → REG_CLOSED → LIVE → COMPLETED; ARCHIVED — терминальный из любого.
export const EVENT_STATUSES = [
  "DRAFT",
  "REG_OPEN",
  "REG_CLOSED",
  "LIVE",
  "COMPLETED",
  "ARCHIVED",
] as const;
export type EventStatus = (typeof EVENT_STATUSES)[number];

export const EVENT_STATUS_LABELS: Record<EventStatus, string> = {
  DRAFT: "Черновик",
  REG_OPEN: "Регистрация открыта",
  REG_CLOSED: "Регистрация закрыта",
  LIVE: "Идёт турнир",
  COMPLETED: "Завершено",
  ARCHIVED: "В архиве",
};

// Разрешённые переходы «вперёд». ARCHIVED достижим из любого нетерминального.
const FORWARD: Record<EventStatus, EventStatus[]> = {
  DRAFT: ["REG_OPEN", "ARCHIVED"],
  REG_OPEN: ["REG_CLOSED", "ARCHIVED"],
  REG_CLOSED: ["LIVE", "REG_OPEN", "ARCHIVED"], // REG_OPEN — допускаем переоткрытие
  LIVE: ["COMPLETED", "ARCHIVED"],
  COMPLETED: ["ARCHIVED"],
  ARCHIVED: [],
};

export function isEventStatus(s: string): s is EventStatus {
  return (EVENT_STATUSES as readonly string[]).includes(s);
}

export function canTransition(from: string, to: string): boolean {
  if (!isEventStatus(from) || !isEventStatus(to)) return false;
  return FORWARD[from].includes(to);
}

export function nextStatuses(from: string): EventStatus[] {
  return isEventStatus(from) ? FORWARD[from] : [];
}

// ---------- Пресет ----------
export type EventPresetData = {
  name: string;
  series?: string;
  city: string;
  venue?: string;
  address?: string;
  date: Date;
  disciplines?: string;
  matsCount?: number;
  timings?: string;
  coachCommission?: number;
};

export type PriceTierSpec = {
  name: string;
  startsAt: Date;
  priceOneDivision: number;
  priceBothDivisions: number;
  absoluteSurcharge?: number;
  order?: number;
};

export type EventPreset = {
  event: EventPresetData;
  tiers: PriceTierSpec[];
  categories: CategorySpec[];
};

export type PresetOverrides = Partial<EventPresetData> & {
  status?: string;
  registrationOpensAt?: Date | null;
  registrationClosesAt?: Date | null;
};

/** Пресет «Андеграунд Грэпплинг Танкоград». */
export function tankogradPreset(): EventPreset {
  return {
    event: TANKOGRAD_EVENT,
    tiers: TANKOGRAD_TIERS,
    categories: tankogradCategories(),
  };
}

/**
 * Идемпотентно создаёт Event и вложенные категории/тиры/ковры.
 * Идемпотентность — по (name, date): если событие с таким именем и датой уже
 * есть, возвращает его без дублирования (не пересоздаёт детей).
 */
export async function createEventFromPreset(
  prisma: PrismaClient,
  preset: EventPreset,
  overrides: PresetOverrides = {}
) {
  const e = { ...preset.event, ...overrides };

  const existing = await prisma.event.findFirst({
    where: { name: e.name, date: e.date },
  });
  if (existing) return existing;

  const event = await prisma.event.create({
    data: {
      name: e.name,
      series: e.series ?? null,
      city: e.city,
      venue: e.venue ?? null,
      address: e.address ?? null,
      date: e.date,
      disciplines: e.disciplines ?? "gi,nogi",
      matsCount: e.matsCount ?? 3,
      timings: e.timings ?? null,
      coachCommission: e.coachCommission ?? 200,
      status: overrides.status ?? "DRAFT",
      registrationOpensAt: overrides.registrationOpensAt ?? null,
      registrationClosesAt: overrides.registrationClosesAt ?? null,
    },
  });

  for (const t of preset.tiers) {
    await prisma.priceTier.create({
      data: {
        eventId: event.id,
        name: t.name,
        startsAt: t.startsAt,
        priceOneDivision: t.priceOneDivision,
        priceBothDivisions: t.priceBothDivisions,
        absoluteSurcharge: t.absoluteSurcharge ?? 0,
        order: t.order ?? 0,
      },
    });
  }

  for (let i = 1; i <= (event.matsCount ?? 3); i++) {
    await prisma.mat.create({ data: { eventId: event.id, number: i } });
  }

  for (const s of preset.categories) {
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

  return event;
}
