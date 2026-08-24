"use server";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { verifyPassword } from "@/lib/auth/password";
import { signIn, signOut } from "@/lib/auth/session";

export async function signInAction(formData: FormData) {
  const email = String(formData.get("email"));
  const password = String(formData.get("password"));
  const user = await prisma.user.findUnique({ where: { email }, include: { memberships: true } });
  if (!user || !verifyPassword(password, user.passwordHash)) redirect("/login?e=1");
  await signIn(user!.id);
  const roles = user!.memberships.map((m) => m.role);
  if (roles.includes("COACH")) redirect("/coach");
  redirect("/");
}

export async function signOutAction() {
  await signOut();
  redirect("/login");
}
