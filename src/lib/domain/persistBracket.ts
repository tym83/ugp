import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { generateBracket, type Participant } from "./bracket";

type Tx = Prisma.TransactionClient;

/** Сгенерировать и сохранить сетку категории из допущенных регистраций.
 *  Пересборка поверх финализированных результатов запрещена без force (гл. судья). */
export async function buildBracketForCategory(categoryId: string, opts: { force?: boolean } = {}) {
  const category = await prisma.category.findUnique({ where: { id: categoryId } });
  if (!category) throw new Error("category not found");

  const finalized = await prisma.result.count({ where: { match: { categoryId }, finalized: true } });
  if (finalized > 0 && !opts.force) {
    throw new Error("Сетка содержит финализированные результаты — пересборка запрещена (нужно подтверждение гл. судьи)");
  }

  const regs = await prisma.registration.findMany({
    where: { categoryId, status: "ADMITTED" },
    include: { athlete: true },
    orderBy: { seed: "asc" },
  });

  const participants: Participant[] = regs.map((r, i) => ({
    id: r.athleteId,
    clubId: r.athlete.clubId,
    seed: r.seed ?? i + 1,
  }));

  const bracket =
    regs.length >= 2
      ? generateBracket(
          participants,
          category.bracketType as "SINGLE_ELIM" | "ROUND_ROBIN",
          { bronzeMode: category.bronzeMode as "SINGLE_MATCH_3RD" | "TWO_BRONZE" | "NONE" }
        )
      : null;

  await prisma.$transaction(async (tx) => {
    // очистить прошлую сетку
    await tx.result.deleteMany({ where: { match: { categoryId } } });
    await tx.match.deleteMany({ where: { categoryId } });

    if (!bracket) {
      await tx.category.update({
        where: { id: categoryId },
        data: { status: "GENERATED", bracketVersion: { increment: 1 }, frozenAt: new Date() },
      });
      return;
    }

    // 1-й проход: создаём матчи, запоминаем id по ключу round:pos:bronze
    const key = (round: number, pos: number, bronze = false) => `${round}:${pos}:${bronze ? "b" : ""}`;
    const idByKey = new Map<string, string>();
    for (const m of bracket.matches) {
      const created = await tx.match.create({
        data: {
          categoryId,
          roundNumber: m.round,
          positionInRound: m.pos,
          isBronzeMatch: !!m.isBronze,
          isRoundRobin: !!m.isRoundRobin,
          slotAAthleteId: m.aId ?? null,
          slotBAthleteId: m.bId ?? null,
          slotAWinner: m.aFrom ? m.aFrom.winner : true,
          slotBWinner: m.bFrom ? m.bFrom.winner : true,
          status: "PENDING",
        },
      });
      idByKey.set(key(m.round, m.pos, m.isBronze), created.id);
    }

    // 2-й проход: проставляем ссылки на матчи-источники
    for (const m of bracket.matches) {
      if (!m.aFrom && !m.bFrom) continue;
      const selfId = idByKey.get(key(m.round, m.pos, m.isBronze))!;
      const aFromId = m.aFrom ? idByKey.get(key(m.aFrom.round, m.aFrom.pos)) : null;
      const bFromId = m.bFrom ? idByKey.get(key(m.bFrom.round, m.bFrom.pos)) : null;
      await tx.match.update({
        where: { id: selfId },
        data: { slotAFromMatchId: aFromId ?? undefined, slotBFromMatchId: bFromId ?? undefined },
      });
    }

    // Разрешение BYE: матч с ровно одним участником без ссылок → авто-победа и продвижение
    await resolveByes(tx, categoryId);

    await tx.category.update({
      where: { id: categoryId },
      data: { status: "GENERATED", bracketVersion: { increment: 1 } },
    });
  });

  return { matches: bracket?.matches.length ?? 0, participants: participants.length, size: bracket?.size ?? 0 };
}

/** Продвинуть победителя (и проигравшего — в бронзу) матча в зависимые слоты.
 *  Работает внутри переданной транзакции. Пропускает пустые фидеры (BYE без проигравшего). */
export async function advanceWinner(tx: Tx, matchId: string) {
  const m = await tx.match.findUnique({ where: { id: matchId } });
  if (!m || !m.winnerAthleteId) return;
  const dependents = await tx.match.findMany({
    where: { OR: [{ slotAFromMatchId: matchId }, { slotBFromMatchId: matchId }] },
  });
  for (const d of dependents) {
    const data: Record<string, string> = {};
    if (d.slotAFromMatchId === matchId) {
      const who = d.slotAWinner ? m.winnerAthleteId : m.loserAthleteId;
      if (who) data.slotAAthleteId = who; // guard: BYE-победа не даёт проигравшего → не пишем null
    }
    if (d.slotBFromMatchId === matchId) {
      const who = d.slotBWinner ? m.winnerAthleteId : m.loserAthleteId;
      if (who) data.slotBAthleteId = who;
    }
    if (Object.keys(data).length) await tx.match.update({ where: { id: d.id }, data });
  }
}

async function resolveByes(tx: Tx, categoryId: string) {
  const byes = await tx.match.findMany({
    where: {
      categoryId,
      status: "PENDING",
      slotAFromMatchId: null,
      slotBFromMatchId: null,
      OR: [
        { slotAAthleteId: { not: null }, slotBAthleteId: null },
        { slotAAthleteId: null, slotBAthleteId: { not: null } },
      ],
    },
  });
  for (const m of byes) {
    const winner = m.slotAAthleteId ?? m.slotBAthleteId!;
    await tx.match.update({
      where: { id: m.id },
      data: { winnerAthleteId: winner, status: "COMPLETED", endedAt: new Date() },
    });
    await advanceWinner(tx, m.id);
  }
}
