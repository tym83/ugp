"use server";
import { revalidatePath } from "next/cache";
import { buildBracketForCategory } from "@/lib/domain/persistBracket";
import { submitResult, type SubmitResultInput } from "@/lib/domain/results";

export async function buildBracketAction(categoryId: string) {
  await buildBracketForCategory(categoryId);
  revalidatePath(`/category/${categoryId}`);
  revalidatePath(`/judge/${categoryId}`);
}

export async function submitResultAction(formData: FormData) {
  const categoryId = String(formData.get("categoryId"));
  const input: SubmitResultInput = {
    matchId: String(formData.get("matchId")),
    winnerAthleteId: String(formData.get("winnerAthleteId")),
    winType: String(formData.get("winType")) as SubmitResultInput["winType"],
    clientMutationId: String(formData.get("clientMutationId")),
    refereeUserId: formData.get("refereeUserId") ? String(formData.get("refereeUserId")) : undefined,
  };
  await submitResult(input);
  revalidatePath(`/judge/${categoryId}`);
  revalidatePath(`/category/${categoryId}`);
}
