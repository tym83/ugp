"use server";
import { revalidatePath } from "next/cache";
import { buildBracketForCategory } from "@/lib/domain/persistBracket";
import { submitResult, correctResult, type SubmitResultInput } from "@/lib/domain/results";
import { requireRole } from "@/lib/auth/session";

export async function buildBracketAction(categoryId: string) {
  await requireRole("ORGANIZER", "ADMIN", "MAT_COORDINATOR");
  await buildBracketForCategory(categoryId);
  revalidatePath(`/category/${categoryId}`);
  revalidatePath(`/judge/${categoryId}`);
}

export async function submitResultAction(formData: FormData) {
  // судья берётся из сессии, а не из формы — иначе audit-trail недостоверен
  const user = await requireRole("REFEREE", "MAT_COORDINATOR", "ORGANIZER", "ADMIN");
  const categoryId = String(formData.get("categoryId"));
  const input: SubmitResultInput = {
    matchId: String(formData.get("matchId")),
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

/** Коррекция финализированного результата — только гл. судья (ORGANIZER/ADMIN). */
export async function correctResultAction(formData: FormData) {
  const user = await requireRole("ORGANIZER", "ADMIN");
  const categoryId = String(formData.get("categoryId"));
  await correctResult({
    matchId: String(formData.get("matchId")),
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
