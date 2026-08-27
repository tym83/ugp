"use server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { buildBracketForCategory } from "@/lib/domain/persistBracket";
import { submitResult, correctResult, type SubmitResultInput } from "@/lib/domain/results";
import { requireEventRole, hasRole } from "@/lib/auth/session";

async function eventIdOfCategory(categoryId: string): Promise<string> {
  const c = await prisma.category.findUnique({ where: { id: categoryId }, select: { eventId: true } });
  if (!c) throw new Error("Категория не найдена");
  return c.eventId;
}

export async function buildBracketAction(categoryId: string) {
  const eventId = await eventIdOfCategory(categoryId);
  await requireEventRole(eventId, "ORGANIZER", "ADMIN", "MAT_COORDINATOR");
  await buildBracketForCategory(categoryId);
  revalidatePath(`/category/${categoryId}`);
  revalidatePath(`/judge/${categoryId}`);
}

export async function submitResultAction(formData: FormData) {
  const matchId = String(formData.get("matchId"));
  const match = await prisma.match.findUnique({
    where: { id: matchId },
    include: { category: { select: { eventId: true } } },
  });
  if (!match) throw new Error("Матч не найден");
  const eventId = match.category.eventId;

  // судья должен иметь роль ИМЕННО для этого события
  const user = await requireEventRole(eventId, "REFEREE", "MAT_COORDINATOR", "ORGANIZER", "ADMIN");

  // single-writer: если у матча задан ковёр, писать может только судья этого ковра
  // (голова-судья ORGANIZER/ADMIN — исключение).
  const isHead = hasRole(user, "ORGANIZER", "ADMIN");
  if (!isHead && match.matNumber != null) {
    const ownsMat = user.memberships.some(
      (m) => (m.role === "REFEREE" || m.role === "MAT_COORDINATOR") && m.matNumber === match.matNumber,
    );
    if (!ownsMat) throw new Error(`Этот матч на ковре №${match.matNumber} — вы к нему не назначены`);
  }

  const categoryId = String(formData.get("categoryId"));
  const input: SubmitResultInput = {
    matchId,
    winnerAthleteId: String(formData.get("winnerAthleteId")),
    winType: String(formData.get("winType")) as SubmitResultInput["winType"],
    scoreA: formData.get("scoreA") ? Number(formData.get("scoreA")) : undefined,
    scoreB: formData.get("scoreB") ? Number(formData.get("scoreB")) : undefined,
    details: formData.get("details") ? String(formData.get("details")) : undefined,
    clientMutationId: String(formData.get("clientMutationId")),
    refereeUserId: user.id,
  };
  await submitResult(input);
  revalidatePath(`/judge/${categoryId}`);
  revalidatePath(`/category/${categoryId}`);
}

/** Коррекция финализированного результата — только гл. судья (ORGANIZER/ADMIN) этого события. */
export async function correctResultAction(formData: FormData) {
  const matchId = String(formData.get("matchId"));
  const match = await prisma.match.findUnique({
    where: { id: matchId },
    include: { category: { select: { eventId: true } } },
  });
  if (!match) throw new Error("Матч не найден");
  const user = await requireEventRole(match.category.eventId, "ORGANIZER", "ADMIN");
  const categoryId = String(formData.get("categoryId"));
  await correctResult({
    matchId,
    winnerAthleteId: String(formData.get("winnerAthleteId")),
    winType: String(formData.get("winType") || "SUBMISSION") as SubmitResultInput["winType"],
    scoreA: formData.get("scoreA") ? Number(formData.get("scoreA")) : undefined,
    scoreB: formData.get("scoreB") ? Number(formData.get("scoreB")) : undefined,
    reason: formData.get("reason") ? String(formData.get("reason")) : undefined,
    headJudgeUserId: user.id,
  });
  revalidatePath(`/judge/${categoryId}`);
  revalidatePath(`/category/${categoryId}`);
}
