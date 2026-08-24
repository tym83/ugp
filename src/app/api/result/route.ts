import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { submitResult, type SubmitResultInput } from "@/lib/domain/results";

// Отладочный/тестовый ввод результата (реальный путь — судейский экшен из UI).
export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const matchId = p.get("matchId");
  const winner = p.get("winner");
  if (!matchId || !winner) return NextResponse.json({ error: "matchId & winner required" }, { status: 400 });
  const winType = (p.get("winType") ?? "SUBMISSION") as SubmitResultInput["winType"];
  const clientMutationId = p.get("cmid") ?? randomUUID();
  try {
    const res = await submitResult({ matchId, winnerAthleteId: winner, winType, clientMutationId });
    return NextResponse.json(res);
  } catch (e) {
    return NextResponse.json({ error: String((e as Error).message) }, { status: 409 });
  }
}
