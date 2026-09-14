"use server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth/session";
import { revalidatePath } from "next/cache";
import { z } from "zod";

export type EditResult = { ok: boolean; msg: string };

const schema = z.object({
  athleteId: z.string().min(1),
  fullName: z.string().trim().min(2, "укажите ФИО"),
  birthDate: z.string().min(1, "укажите дату рождения"),
  sex: z.enum(["M", "F"]),
  city: z.string().trim().optional().default(""),
  club: z.string().trim().optional().default(""),
  belt: z.string().trim().optional().default(""),
  phone: z.string().trim().optional().default(""),
});

/** Редактирование анкеты участника.
 *  Организатор/админ — все поля (в т.ч. телефон и клуб).
 *  Тренер — только своих спортсменов (coachUserId), без телефона (телефон видят только организаторы). */
export async function updateAthlete(formData: FormData): Promise<EditResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, msg: "Войдите в аккаунт" };
  const roles = new Set(user.memberships.map((m) => m.role));
  const isOrg = roles.has("ORGANIZER") || roles.has("ADMIN");
  const isCoach = roles.has("COACH");

  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    const first = parsed.error.issues[0]?.message ?? "";
    return { ok: false, msg: /[а-яё]/i.test(first) ? first : "Проверьте правильность заполнения полей" };
  }
  const d = parsed.data;

  const athlete = await prisma.athlete.findUnique({ where: { id: d.athleteId } });
  if (!athlete) return { ok: false, msg: "Участник не найден" };

  const owns = isCoach && athlete.coachUserId === user.id;
  if (!isOrg && !owns) return { ok: false, msg: "Нет прав на редактирование этого участника" };

  const dob = new Date(d.birthDate);
  if (Number.isNaN(dob.getTime())) return { ok: false, msg: "неверная дата рождения" };

  // Клуб: находим по названию или создаём. Пустое → без клуба.
  let clubId: string | null = athlete.clubId;
  const clubName = d.club.trim();
  if (clubName) {
    const existing = await prisma.club.findFirst({ where: { name: clubName } });
    clubId = existing ? existing.id : (await prisma.club.create({ data: { name: clubName, city: d.city || null } })).id;
  } else {
    clubId = null;
  }

  await prisma.athlete.update({
    where: { id: d.athleteId },
    data: {
      fullName: d.fullName,
      birthDate: dob,
      sex: d.sex,
      city: d.city || null,
      belt: d.belt || null,
      clubId,
      // Телефон меняет только организатор/админ.
      ...(isOrg ? { phone: d.phone || null } : {}),
    },
  });

  revalidatePath("/coach");
  return { ok: true, msg: "Анкета обновлена" };
}
