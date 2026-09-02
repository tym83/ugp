// Хелперы для сценарного прогона: подделка сессии (тот же HMAC, что в session.ts),
// создание пользователей с ролями и базовых сущностей события/категории/атлета.
import { createHmac } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth/password";

const MAX_AGE_S = 60 * 60 * 24 * 7;
function secret() {
  return process.env.SESSION_SECRET && process.env.SESSION_SECRET.length >= 16
    ? process.env.SESSION_SECRET
    : "dev-insecure-session-secret-change-me";
}
/** Токен идентичен makeToken() из src/lib/auth/session.ts */
export function makeToken(userId: string): string {
  const exp = Date.now() + MAX_AGE_S * 1000;
  const payload = `${userId}.${exp}`;
  const mac = createHmac("sha256", secret()).update(payload).digest("base64url");
  return `${payload}.${mac}`;
}

let seq = 0;
export const uniq = (p = "x") => `${p}-${seq++}-${Math.floor(Date.now() % 1e6)}`;

/** Пользователь с набором membership-ролей (scope PLATFORM по умолчанию). */
export async function makeUser(roles: string[], opts: { eventId?: string; scope?: string } = {}) {
  const user = await prisma.user.create({
    data: {
      email: `${uniq("u")}@t.local`,
      fullName: `User ${seq}`,
      passwordHash: hashPassword("demo12345"),
      memberships: {
        create: roles.map((role) => ({
          role,
          scope: opts.scope ?? (opts.eventId ? "EVENT" : "PLATFORM"),
          eventId: opts.eventId ?? null,
        })),
      },
    },
    include: { memberships: true },
  });
  return user;
}

export async function makeEvent(overrides: Record<string, unknown> = {}) {
  return prisma.event.create({
    data: {
      name: uniq("Event"),
      city: "Челябинск",
      date: new Date("2026-11-22"),
      status: "REG_OPEN",
      registrationOpensAt: new Date("2026-09-01"),
      registrationClosesAt: new Date("2026-11-20"),
      ...overrides,
    },
  });
}

export async function makeCategory(eventId: string, overrides: Record<string, unknown> = {}) {
  return prisma.category.create({
    data: {
      eventId,
      ageGroupCode: "adults",
      ageGroupLabel: "Взрослые",
      birthYearFrom: 1980,
      birthYearTo: 2008,
      sex: "M",
      discipline: "nogi",
      bracketType: "SINGLE_ELIM",
      status: "OPEN",
      ...overrides,
    },
  });
}

export async function makeAthlete(overrides: Record<string, unknown> = {}) {
  return prisma.athlete.create({
    data: {
      fullName: uniq("Боец"),
      birthDate: new Date("2000-01-01"),
      sex: "M",
      ...overrides,
    },
  });
}

/** Полная регистрация атлета в категории (entry + registration). */
export async function registerAthlete(
  eventId: string,
  categoryId: string,
  athleteId: string,
  reg: Record<string, unknown> = {},
) {
  const entry = await prisma.eventEntry.create({ data: { athleteId, eventId } });
  const registration = await prisma.registration.create({
    data: { entryId: entry.id, athleteId, categoryId, status: "ENTERED", ...reg },
  });
  return { entry, registration };
}
