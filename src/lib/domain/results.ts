import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { appendAudit } from "./audit";
import { advanceWinner } from "./persistBracket";

export type SubmitResultInput = {
  matchId: string;
  winnerAthleteId: string;
  winType: "SUBMISSION" | "POINTS" | "DECISION" | "DQ" | "NO_SHOW" | "INJURY" | "WALKOVER";
  scoreA?: number;
  scoreB?: number;
  details?: string;
  refereeUserId?: string;
  clientMutationId: string;
};

/** Идемпотентный ввод результата с иммутабельной финализацией и аудитом. */
export async function submitResult(input: SubmitResultInput) {
  // идемпотентность: повторный сабмит того же мутационного id → тот же результат
  const dup = await prisma.result.findUnique({ where: { clientMutationId: input.clientMutationId } });
  if (dup) return { ok: true, idempotent: true, resultId: dup.id };

  const match = await prisma.match.findUnique({ where: { id: input.matchId } });
  if (!match) throw new Error("match not found");
  if (match.status === "COMPLETED") throw new Error("Матч уже завершён — правка только через гл. судью");

  const inA = match.slotAAthleteId === input.winnerAthleteId;
  const inB = match.slotBAthleteId === input.winnerAthleteId;
  if (!inA && !inB) throw new Error("Победитель не участник этого матча");
  const loserAthleteId = inA ? match.slotBAthleteId : match.slotAAthleteId;

  try {
    await prisma.$transaction(async (tx) => {
      // optimistic lock: обновляем только если версия не изменилась
      const upd = await tx.match.updateMany({
        where: { id: match.id, version: match.version, status: { not: "COMPLETED" } },
        data: {
          status: "COMPLETED",
          endedAt: new Date(),
          winnerAthleteId: input.winnerAthleteId,
          loserAthleteId: loserAthleteId ?? undefined,
          version: match.version + 1,
        },
      });
      if (upd.count === 0) throw new Error("Конфликт версии матча — обновите и повторите");

      await tx.result.create({
        data: {
          matchId: match.id,
          winnerAthleteId: input.winnerAthleteId,
          winType: input.winType,
          scoreA: input.scoreA ?? 0,
          scoreB: input.scoreB ?? 0,
          details: input.details ?? null,
          refereeUserId: input.refereeUserId ?? null,
          clientMutationId: input.clientMutationId,
          finalized: true,
        },
      });

      await appendAudit(tx, {
        actorId: input.refereeUserId ?? null,
        action: "RESULT_SUBMIT",
        entity: "Match",
        entityId: match.id,
        after: { winner: input.winnerAthleteId, winType: input.winType, score: [input.scoreA ?? 0, input.scoreB ?? 0] },
      });

      // продвижение победителя (и проигравшего в бронзу) — в той же транзакции
      await advanceWinner(tx, match.id);
    });
  } catch (err) {
    // гонка одинакового clientMutationId: уникальный конфликт → трактуем как идемпотентный успех
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      const existing = await prisma.result.findUnique({ where: { clientMutationId: input.clientMutationId } });
      if (existing) return { ok: true, idempotent: true, resultId: existing.id };
    }
    throw err;
  }

  return { ok: true, idempotent: false };
}

export type CorrectResultInput = {
  matchId: string;
  winnerAthleteId: string;
  winType: SubmitResultInput["winType"];
  scoreA?: number;
  scoreB?: number;
  details?: string;
  headJudgeUserId: string;
  reason?: string;
};

/** Коррекция уже финализированного результата гл. судьёй.
 *  Безопасна только если зависимые матчи ещё не сыграны — иначе нужен ручной каскад
 *  (пере-продвижение через сыгранные матчи не выполняется автоматически).
 *  Пишет компенсирующую запись в аудит и пере-продвигает победителя в PENDING-зависимые слоты. */
export async function correctResult(input: CorrectResultInput) {
  const match = await prisma.match.findUnique({ where: { id: input.matchId }, include: { result: true } });
  if (!match) throw new Error("match not found");
  if (match.status !== "COMPLETED" || !match.result) throw new Error("Нечего исправлять — результат не финализирован");

  const inA = match.slotAAthleteId === input.winnerAthleteId;
  const inB = match.slotBAthleteId === input.winnerAthleteId;
  if (!inA && !inB) throw new Error("Победитель не участник этого матча");
  const newLoserId = inA ? match.slotBAthleteId : match.slotAAthleteId;

  // если зависимые матчи уже сыграны — авто-каскад небезопасен
  const dependents = await prisma.match.findMany({
    where: { OR: [{ slotAFromMatchId: match.id }, { slotBFromMatchId: match.id }] },
  });
  const playedDependent = dependents.find((d) => d.status === "COMPLETED");
  if (playedDependent) {
    throw new Error("Нельзя исправить: зависимый матч уже сыгран — требуется ручной пересбор ниже по сетке");
  }

  const before = {
    winner: match.winnerAthleteId,
    loser: match.loserAthleteId,
    winType: match.result.winType,
    score: [match.result.scoreA, match.result.scoreB],
  };

  await prisma.$transaction(async (tx) => {
    await tx.match.update({
      where: { id: match.id },
      data: {
        winnerAthleteId: input.winnerAthleteId,
        loserAthleteId: newLoserId ?? undefined,
        version: match.version + 1,
      },
    });
    // единственная запись на матч (Result.matchId @unique) → правим на месте, след — в аудите
    await tx.result.update({
      where: { matchId: match.id },
      data: {
        winnerAthleteId: input.winnerAthleteId,
        winType: input.winType,
        scoreA: input.scoreA ?? 0,
        scoreB: input.scoreB ?? 0,
        details: input.details ?? match.result!.details ?? null,
      },
    });
    await appendAudit(tx, {
      actorId: input.headJudgeUserId,
      action: "RESULT_CORRECT",
      entity: "Match",
      entityId: match.id,
      before,
      after: { winner: input.winnerAthleteId, winType: input.winType, score: [input.scoreA ?? 0, input.scoreB ?? 0], reason: input.reason ?? null },
    });
    // пере-продвижение в зависимые (все PENDING — проверено выше)
    await advanceWinner(tx, match.id);
  });

  return { ok: true };
}
