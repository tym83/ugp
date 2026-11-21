"use server";

import { prisma } from "@/lib/prisma";
import { requireEventRole } from "@/lib/auth/session";
import { appendAudit } from "@/lib/domain/audit";
import { revalidatePath } from "next/cache";

export async function setManualPlaces(categoryId: string, athleteIds: string[]) {
  const category = await prisma.category.findUnique({ where: { id: categoryId } });
  if (!category) throw new Error("Категория не найдена");
  const user = await requireEventRole(category.eventId, "ORGANIZER", "ADMIN");
  await prisma.$transaction(async (tx) => {
    const cat = await tx.category.findUniqueOrThrow({ where: { id: categoryId }, include: { matches: true } });
    if (cat.bracketType !== "ROUND_ROBIN" || cat.matches.length !== 3 || cat.matches.some((m) => !m.isRoundRobin || m.status !== "COMPLETED")) {
      throw new Error("Сначала завершите все три схватки круговой категории");
    }
    const ids = new Set(cat.matches.flatMap((m) => [m.slotAAthleteId, m.slotBAthleteId]).filter((id): id is string => !!id));
    if (ids.size !== 3 || athleteIds.length !== 3 || new Set(athleteIds).size !== 3 || athleteIds.some((id) => !ids.has(id))) {
      throw new Error("Выберите каждого из трёх участников ровно один раз");
    }
    await tx.category.update({ where: { id: categoryId }, data: { placesOverride: JSON.stringify(athleteIds) } });
    await appendAudit(tx, { actorId: user.id, action: "places.manual", entity: "Category", entityId: categoryId, before: { placesOverride: cat.placesOverride }, after: { athleteIds } });
  }, { isolationLevel: "Serializable" });
  for (const id of new Set([categoryId, category.slug].filter(Boolean))) {
    revalidatePath(`/category/${id}`);
    revalidatePath(`/judge/${id}`);
  }
  revalidatePath(`/standings/${category.eventId}`);
}
