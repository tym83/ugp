import { cookies } from "next/headers";
import { createHmac, timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/prisma";

const COOKIE = "ugp_session";
const MAX_AGE_S = 60 * 60 * 24 * 7; // 7 дней

function secret(): string {
  const s = process.env.SESSION_SECRET;
  if (s && s.length >= 16) return s;
  if (process.env.NODE_ENV === "production") {
    throw new Error("SESSION_SECRET не задан (мин. 16 символов) — обязателен в продакшене");
  }
  return "dev-insecure-session-secret-change-me"; // только dev
}

function sign(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

/** Токен = userId.expMs.hmac(userId.expMs). Подписан HMAC, с TTL. */
function makeToken(userId: string): string {
  const exp = Date.now() + MAX_AGE_S * 1000;
  const payload = `${userId}.${exp}`;
  return `${payload}.${sign(payload)}`;
}

function verifyToken(token: string): string | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [userId, expStr, mac] = parts;
  const expected = sign(`${userId}.${expStr}`);
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  if (!Number.isFinite(Number(expStr)) || Number(expStr) < Date.now()) return null;
  return userId;
}

export async function signIn(userId: string) {
  const c = await cookies();
  c.set(COOKIE, makeToken(userId), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE_S,
  });
}

export async function signOut() {
  const c = await cookies();
  c.delete(COOKIE);
}

export async function getCurrentUser() {
  const c = await cookies();
  const token = c.get(COOKIE)?.value;
  if (!token) return null;
  const userId = verifyToken(token);
  if (!userId) return null;
  return prisma.user.findUnique({ where: { id: userId }, include: { memberships: true } });
}

export type SessionUser = NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>;

export function hasRole(
  user: { memberships: { role: string }[] } | null,
  ...roles: string[]
): boolean {
  return !!user?.memberships.some((m) => roles.includes(m.role));
}

/** Гард для server actions / API: требует хотя бы одну из ролей. Бросает при отказе. */
export async function requireRole(...roles: string[]): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) throw new Error("Не авторизован");
  if (roles.length && !hasRole(user, ...roles)) throw new Error("Недостаточно прав");
  return user;
}
