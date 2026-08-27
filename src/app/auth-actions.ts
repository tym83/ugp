"use server";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { verifyPassword } from "@/lib/auth/password";
import { signIn, signOut, homeForRoles } from "@/lib/auth/session";
import { rateLimit } from "@/lib/rate-limit";

// Клиентский IP за реверс-прокси (nginx на reg.ru): первый адрес из x-forwarded-for,
// иначе x-real-ip, иначе "local".
async function clientIp(): Promise<string> {
  const h = await headers();
  const xff = h.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]!.trim();
  return h.get("x-real-ip")?.trim() || "local";
}

export async function signInAction(formData: FormData) {
  const email = String(formData.get("email"));
  const password = String(formData.get("password"));

  // Брутфорс-защита: 10 попыток / 5 мин, по IP и по email независимо.
  // При превышении — тот же generic-редирект, что и при неверных данных
  // (не раскрываем, сработал ли лимит).
  const ip = await clientIp();
  const win = { limit: 10, windowMs: 5 * 60 * 1000 };
  const ipRl = rateLimit(`login:ip:${ip}`, win);
  const emailRl = rateLimit(`login:email:${email}`, win);
  if (!ipRl.ok || !emailRl.ok) redirect("/login?e=1");

  const user = await prisma.user.findUnique({ where: { email }, include: { memberships: true } });
  if (!user || !verifyPassword(password, user.passwordHash)) redirect("/login?e=1");
  await signIn(user!.id);
  const roles = user!.memberships.map((m) => m.role);
  redirect(homeForRoles(roles));
}

export async function signOutAction() {
  await signOut();
  redirect("/login");
}
