import { NextRequest, NextResponse } from "next/server";
import { submitResult, type SubmitResultInput } from "@/lib/domain/results";
import { getCurrentUser, hasRole } from "@/lib/auth/session";
import { rateLimit } from "@/lib/rate-limit";

// Ввод результата — только POST + роль судьи. Судья берётся из сессии, не из запроса.
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!hasRole(user, "REFEREE", "MAT_COORDINATOR", "ORGANIZER", "ADMIN")) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  // Троттлинг: 120/мин на пользователя (судья вводит много результатов подряд).
  const rl = rateLimit(`result:${user.id}`, { limit: 120, windowMs: 60_000 });
  if (!rl.ok) {
    return NextResponse.json(
      { error: "rate_limited" },
      { status: 429, headers: { "Retry-After": String(Math.ceil(rl.retryAfterMs / 1000)) } },
    );
  }
  const body = await req.json().catch(() => ({}));
  const { matchId, winnerAthleteId, winType, clientMutationId, scoreA, scoreB, details } = body ?? {};
  if (!matchId || !winnerAthleteId || !clientMutationId) {
    return NextResponse.json({ error: "matchId, winnerAthleteId, clientMutationId required" }, { status: 400 });
  }
  const input: SubmitResultInput = {
    matchId,
    winnerAthleteId,
    winType: (winType ?? "SUBMISSION") as SubmitResultInput["winType"],
    scoreA,
    scoreB,
    details,
    clientMutationId,
    refereeUserId: user.id,
  };
  try {
    const res = await submitResult(input);
    return NextResponse.json(res);
  } catch (e) {
    return NextResponse.json({ error: String((e as Error).message) }, { status: 409 });
  }
}
