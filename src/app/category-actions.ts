"use server";
import { prisma } from "@/lib/prisma";
import { isMinor, maskName } from "@/lib/privacy";

export type CategoryParticipant = {
  id: string;
  name: string;
  club: string | null;
  weight: number | null;
  admitted: boolean;
};

/** Публичный список участников категории для инлайн-раскрытия в браузере категорий.
 *  Показываем и заявленных (ENTERED), и допущенных (ADMITTED) — видно наполненность. */
export async function categoryParticipants(categoryId: string): Promise<CategoryParticipant[]> {
  const regs = await prisma.registration.findMany({
    where: { categoryId, status: { in: ["ENTERED", "ADMITTED"] } },
    include: { athlete: { include: { club: true } } },
    orderBy: [{ status: "asc" }, { seed: "asc" }, { createdAt: "asc" }],
  });
  return regs.map((r) => ({
    id: r.id,
    name: maskName(r.athlete.fullName, isMinor(r.athlete.birthDate)),
    club: r.athlete.club?.name ?? null,
    weight: r.actualWeight ?? r.declaredWeight ?? null,
    admitted: r.status === "ADMITTED",
  }));
}
