import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";

const COOKIE = "ugp_session";

export async function signIn(userId: string) {
  const c = await cookies();
  c.set(COOKIE, userId, { httpOnly: true, sameSite: "lax", path: "/" });
}

export async function signOut() {
  const c = await cookies();
  c.delete(COOKIE);
}

export async function getCurrentUser() {
  const c = await cookies();
  const id = c.get(COOKIE)?.value;
  if (!id) return null;
  return prisma.user.findUnique({ where: { id }, include: { memberships: true } });
}

export function hasRole(
  user: { memberships: { role: string }[] } | null,
  role: string
): boolean {
  return !!user?.memberships.some((m) => m.role === role);
}
