"use server";
import { prisma } from "@/lib/prisma";
import { requireRole, requireEventRole } from "@/lib/auth/session";
import { hashPassword } from "@/lib/auth/password";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import {
  createEventFromPreset as buildEventFromPreset,
  tankogradPreset,
  canTransition,
  EVENT_STATUSES,
} from "@/lib/data/preset";

const ROLES = ["ADMIN", "ORGANIZER", "COACH", "REFEREE", "MAT_COORDINATOR", "ATHLETE"] as const;
const SCOPES = ["PLATFORM", "EVENT", "CLUB"] as const;

// Валидация: первое сообщение об ошибке — наружу (стиль проекта: throw на ошибке).
function parseOrThrow<T>(schema: z.ZodType<T>, data: unknown): T {
  const r = schema.safeParse(data);
  if (!r.success) throw new Error(r.error.issues[0]?.message ?? "неверные данные");
  return r.data;
}

// Дата из <input type="date"|"datetime-local"> → Date | null
function toDate(v: unknown): Date | null {
  if (typeof v !== "string" || !v.trim()) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

// ---------- События ----------
const eventSchema = z.object({
  name: z.string().trim().min(2, "укажите название"),
  city: z.string().trim().min(2, "укажите город"),
  venue: z.string().trim().optional().default(""),
  address: z.string().trim().optional().default(""),
  series: z.string().trim().optional().default(""),
  date: z.string().min(1, "укажите дату"),
  matsCount: z.coerce.number().int().min(1).max(30).default(3),
  disciplines: z.string().trim().default("gi,nogi"),
  coachCommission: z.coerce.number().int().min(0).default(200),
  registrationOpensAt: z.string().optional().default(""),
  registrationClosesAt: z.string().optional().default(""),
  status: z.enum(EVENT_STATUSES).default("DRAFT"),
});

export async function createEvent(formData: FormData): Promise<void> {
  await requireRole("ADMIN", "ORGANIZER");
  const d = parseOrThrow(eventSchema, Object.fromEntries(formData));
  const date = toDate(d.date);
  if (!date) throw new Error("неверная дата события");

  const event = await prisma.event.create({
    data: {
      name: d.name,
      city: d.city,
      venue: d.venue || null,
      address: d.address || null,
      series: d.series || null,
      date,
      matsCount: d.matsCount,
      disciplines: d.disciplines || "gi,nogi",
      coachCommission: d.coachCommission,
      registrationOpensAt: toDate(d.registrationOpensAt),
      registrationClosesAt: toDate(d.registrationClosesAt),
      status: d.status,
    },
  });
  for (let i = 1; i <= d.matsCount; i++) {
    await prisma.mat.create({ data: { eventId: event.id, number: i } });
  }
  revalidatePath("/admin");
  redirect(`/admin/events/${event.id}`);
}

const eventPatchSchema = eventSchema.partial();

export async function updateEvent(id: string, formData: FormData): Promise<void> {
  await requireEventRole(id, "ADMIN", "ORGANIZER");
  const d = parseOrThrow(eventPatchSchema, Object.fromEntries(formData));

  await prisma.event.update({
    where: { id },
    data: {
      ...(d.name !== undefined ? { name: d.name } : {}),
      ...(d.city !== undefined ? { city: d.city } : {}),
      ...(d.venue !== undefined ? { venue: d.venue || null } : {}),
      ...(d.address !== undefined ? { address: d.address || null } : {}),
      ...(d.series !== undefined ? { series: d.series || null } : {}),
      ...(d.date ? { date: toDate(d.date) ?? undefined } : {}),
      ...(d.matsCount !== undefined ? { matsCount: d.matsCount } : {}),
      ...(d.disciplines !== undefined ? { disciplines: d.disciplines } : {}),
      ...(d.coachCommission !== undefined ? { coachCommission: d.coachCommission } : {}),
      ...(d.registrationOpensAt !== undefined ? { registrationOpensAt: toDate(d.registrationOpensAt) } : {}),
      ...(d.registrationClosesAt !== undefined ? { registrationClosesAt: toDate(d.registrationClosesAt) } : {}),
    },
  });
  revalidatePath(`/admin/events/${id}`);
  revalidatePath("/admin");
}

export async function setEventStatus(eventId: string, status: string): Promise<void> {
  await requireEventRole(eventId, "ADMIN", "ORGANIZER");
  const event = await prisma.event.findUnique({ where: { id: eventId } });
  if (!event) throw new Error("событие не найдено");
  if (event.status === status) throw new Error("статус уже установлен");
  if (!canTransition(event.status, status)) {
    throw new Error(`недопустимый переход: ${event.status} → ${status}`);
  }
  await prisma.event.update({ where: { id: eventId }, data: { status } });
  revalidatePath(`/admin/events/${eventId}`);
  revalidatePath("/admin");
}

// ---------- Тиры цен ----------
const tierSchema = z.object({
  name: z.string().trim().min(1, "укажите название тира"),
  startsAt: z.string().min(1, "укажите дату старта"),
  priceFirstCategory: z.coerce.number().int().min(0),
  priceExtraCategory: z.coerce.number().int().min(0).optional(),
  order: z.coerce.number().int().default(0),
});

export async function addPriceTier(eventId: string, formData: FormData): Promise<void> {
  await requireEventRole(eventId, "ADMIN", "ORGANIZER");
  const raw = Object.fromEntries(formData);
  const d = parseOrThrow(tierSchema, raw);
  const startsAt = toDate(d.startsAt);
  if (!startsAt) throw new Error("неверная дата старта тира");
  // Пусто у «доп. категории» → null (тогда доп. считается по базовой цене).
  const hasExtra = typeof raw.priceExtraCategory === "string" && raw.priceExtraCategory.trim() !== "";
  await prisma.priceTier.create({
    data: {
      eventId,
      name: d.name,
      startsAt,
      priceFirstCategory: d.priceFirstCategory,
      priceExtraCategory: hasExtra ? d.priceExtraCategory ?? null : null,
      order: d.order,
    },
  });
  revalidatePath(`/admin/events/${eventId}`);
}

// ---------- Категория (ручная, одна) ----------
const categorySchema = z.object({
  ageGroupCode: z.string().trim().min(1, "код группы"),
  ageGroupLabel: z.string().trim().min(1, "название группы"),
  birthYearFrom: z.coerce.number().int(),
  birthYearTo: z.coerce.number().int(),
  sex: z.enum(["M", "F"]),
  discipline: z.enum(["gi", "nogi"]),
  weightMin: z.coerce.number().optional(),
  weightMax: z.coerce.number().optional(),
  isOpenTop: z.coerce.boolean().default(false),
  isAbsolute: z.coerce.boolean().default(false),
  ruleFormat: z.enum(["AGP", "SUBMISSION_ONLY"]).default("SUBMISSION_ONLY"),
  boutSeconds: z.coerce.number().int().min(30).default(300),
  order: z.coerce.number().int().default(0),
});

export async function addCategory(eventId: string, formData: FormData): Promise<void> {
  await requireEventRole(eventId, "ADMIN", "ORGANIZER");
  const raw = Object.fromEntries(formData);
  const d = parseOrThrow(categorySchema, raw);
  const hasMin = typeof raw.weightMin === "string" && raw.weightMin.trim() !== "";
  const hasMax = typeof raw.weightMax === "string" && raw.weightMax.trim() !== "";
  await prisma.category.create({
    data: {
      eventId,
      ageGroupCode: d.ageGroupCode,
      ageGroupLabel: d.ageGroupLabel,
      birthYearFrom: d.birthYearFrom,
      birthYearTo: d.birthYearTo,
      sex: d.sex,
      discipline: d.discipline,
      weightMin: hasMin ? d.weightMin ?? null : null,
      weightMax: d.isOpenTop || !hasMax ? null : d.weightMax ?? null,
      isOpenTop: d.isOpenTop,
      isAbsolute: d.isAbsolute,
      ruleFormat: d.ruleFormat,
      boutSeconds: d.boutSeconds,
      order: d.order,
    },
  });
  revalidatePath(`/admin/events/${eventId}`);
}

// ---------- Событие из пресета ----------
export async function createEventFromPreset(): Promise<void> {
  await requireRole("ADMIN", "ORGANIZER");
  const event = await buildEventFromPreset(prisma, tankogradPreset(), { status: "DRAFT" });
  revalidatePath("/admin");
  redirect(`/admin/events/${event.id}`);
}

// ---------- Пользователи (ADMIN only) ----------
const userSchema = z.object({
  fullName: z.string().trim().min(2, "укажите ФИО"),
  email: z.string().trim().email("неверный email"),
  password: z.string().min(4, "пароль ≥ 4 символов"),
});

export async function createUser(formData: FormData): Promise<void> {
  await requireRole("ADMIN");
  const d = parseOrThrow(userSchema, Object.fromEntries(formData));
  const exists = await prisma.user.findUnique({ where: { email: d.email } });
  if (exists) throw new Error("email уже занят");
  await prisma.user.create({
    data: { fullName: d.fullName, email: d.email, passwordHash: hashPassword(d.password) },
  });
  revalidatePath("/admin/users");
}

const membershipSchema = z.object({
  userId: z.string().min(1),
  role: z.enum(ROLES),
  scope: z.enum(SCOPES).default("PLATFORM"),
  eventId: z.string().optional().default(""),
  clubId: z.string().optional().default(""),
  matNumber: z.coerce.number().int().optional(),
});

export async function grantMembership(formData: FormData): Promise<void> {
  await requireRole("ADMIN");
  const raw = Object.fromEntries(formData);
  const d = parseOrThrow(membershipSchema, raw);
  const hasMat = typeof raw.matNumber === "string" && raw.matNumber.trim() !== "";
  await prisma.membership.create({
    data: {
      userId: d.userId,
      role: d.role,
      scope: d.scope,
      eventId: d.eventId || null,
      clubId: d.clubId || null,
      matNumber: hasMat ? d.matNumber ?? null : null,
    },
  });
  revalidatePath("/admin/users");
}

export async function revokeMembership(membershipId: string): Promise<void> {
  await requireRole("ADMIN");
  await prisma.membership.delete({ where: { id: membershipId } });
  revalidatePath("/admin/users");
}

// ---------- Судья → ковёр ----------
// Создаёт/обновляет REFEREE-membership с matNumber (scope=EVENT).
export async function assignRefereeToMat(userId: string, eventId: string, matNumber: number): Promise<void> {
  await requireEventRole(eventId, "ADMIN", "ORGANIZER");
  if (!userId || !eventId) throw new Error("userId и eventId обязательны");
  const n = Number(matNumber);
  if (!Number.isInteger(n) || n < 1) throw new Error("неверный номер ковра");

  const existing = await prisma.membership.findFirst({
    where: { userId, eventId, role: "REFEREE" },
  });
  if (existing) {
    await prisma.membership.update({ where: { id: existing.id }, data: { matNumber: n, scope: "EVENT" } });
  } else {
    await prisma.membership.create({
      data: { userId, role: "REFEREE", scope: "EVENT", eventId, matNumber: n },
    });
  }
  revalidatePath(`/admin/events/${eventId}`);
}

// Форм-обёртки (bind eventId), чтобы вызывать из <form action>.
export async function setEventStatusForm(eventId: string, formData: FormData): Promise<void> {
  await setEventStatus(eventId, String(formData.get("status") ?? ""));
}

export async function assignRefereeToMatForm(eventId: string, formData: FormData): Promise<void> {
  await assignRefereeToMat(
    String(formData.get("userId") ?? ""),
    eventId,
    Number(formData.get("matNumber") ?? 0)
  );
}
