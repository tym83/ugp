"use server";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { verifyPassword, hashPassword } from "@/lib/auth/password";
import { signIn, signOut, homeForRoles } from "@/lib/auth/session";
import { rateLimit } from "@/lib/rate-limit";

// Безопасный внутренний редирект: только относительный путь на своём сайте.
function safeNext(v: FormDataEntryValue | null): string {
  const s = typeof v === "string" ? v.trim() : "";
  return s.startsWith("/") && !s.startsWith("//") ? s : "";
}

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

  const next = safeNext(formData.get("next"));
  const user = await prisma.user.findUnique({ where: { email }, include: { memberships: true } });
  if (!user || !verifyPassword(password, user.passwordHash)) {
    redirect(`/login?e=1${next ? `&next=${encodeURIComponent(next)}` : ""}`);
  }
  await signIn(user!.id);
  if (next) redirect(next);
  const roles = user!.memberships.map((m) => m.role);
  redirect(homeForRoles(roles));
}

/** Публичная регистрация аккаунта участника (обязательна для подачи заявки на событие). */
export async function signUpAction(formData: FormData) {
  const fullName = String(formData.get("fullName") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const next = safeNext(formData.get("next"));
  const nextQ = next ? `&next=${encodeURIComponent(next)}` : "";

  // Понятные ошибки (без «машинных» сообщений).
  if (fullName.length < 2) redirect(`/signup?e=name${nextQ}`);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) redirect(`/signup?e=email${nextQ}`);
  if (password.length < 6) redirect(`/signup?e=weak${nextQ}`);

  // Брутфорс/спам-защита по IP.
  const ip = await clientIp();
  if (!rateLimit(`signup:ip:${ip}`, { limit: 10, windowMs: 10 * 60 * 1000 }).ok) {
    redirect(`/signup?e=rate${nextQ}`);
  }

  const exists = await prisma.user.findUnique({ where: { email } });
  if (exists) redirect(`/signup?e=dup${nextQ}`);

  const user = await prisma.user.create({
    data: {
      fullName,
      email,
      passwordHash: hashPassword(password),
      memberships: { create: [{ role: "ATHLETE", scope: "PLATFORM" }] },
    },
  });
  await signIn(user.id);
  redirect(next || "/me");
}

export async function signOutAction() {
  await signOut();
  redirect("/login");
}
