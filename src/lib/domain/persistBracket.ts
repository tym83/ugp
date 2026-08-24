import { prisma } from "@/lib/prisma";
import { generateBracket, type Participant } from "./bracket";

/** Сгенерировать и сохранить сетку категории из допущенных регистраций. */
export async function buildBracketForCategory(categoryId: string) {
  const category = await prisma.category.findUnique({ where: { id: categoryId } });
  if (!category) throw new Error("category not found");

  const regs = await prisma.registration.findMany({
    where: { categoryId, status: "ADMITTED" },
    include: { athlete: true },
    orderBy: { seed: "asc" },
  });

  // очистить прошлую сетку
  await prisma.result.deleteMany({ where: { match: { categoryId } } });
  await prisma.match.deleteMany({ where: { categoryId } });

  if (regs.length < 2) {
    await prisma.category.update({
      where: { id: categoryId },
      data: { status: "GENERATED", bracketVersion: { increment: 1 }, frozenAt: new Date() },
    });
    return { matches: 0, participants: regs.length };
  }

  const participants: Participant[] = regs.map((r, i) => ({
    id: r.athleteId,
    clubId: r.athlete.clubId,
    seed: r.seed ?? i + 1,
  }));

  const bracket = generateBracket(
    participants,
    category.bracketType as "SINGLE_ELIM" | "ROUND_ROBIN",
    { bronzeMode: category.bronzeMode as "SINGLE_MATCH_3RD" | "TWO_BRONZE" | "NONE" }
  );

  // 1-й проход: создаём матчи, запоминаем id по ключу round:pos:bronze
  const key = (round: number, pos: number, bronze = false) => `${round}:${pos}:${bronze ? "b" : ""}`;
  const idByKey = new Map<string, string>();
  for (const m of bracket.matches) {
    const created = await prisma.match.create({
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
    await prisma.match.update({
      where: { id: selfId },
      data: { slotAFromMatchId: aFromId ?? undefined, slotBFromMatchId: bFromId ?? undefined },
    });
  }

  // Разрешение BYE: матч с ровно одним участником без ссылок → авто-победа и продвижение
  await resolveByes(categoryId);

  await prisma.category.update({
    where: { id: categoryId },
    data: { status: "GENERATED", bracketVersion: { increment: 1 } },
  });

  return { matches: bracket.matches.length, participants: participants.length, size: bracket.size };
}

/** Продвинуть победителя матча в зависимые слоты. */
export async function advanceWinner(matchId: string) {
  const m = await prisma.match.findUnique({ where: { id: matchId } });
  if (!m || !m.winnerAthleteId) return;
  const dependents = await prisma.match.findMany({
    where: { OR: [{ slotAFromMatchId: matchId }, { slotBFromMatchId: matchId }] },
  });
  for (const d of dependents) {
    const data: Record<string, string> = {};
    if (d.slotAFromMatchId === matchId) data.slotAAthleteId = d.slotAWinner ? m.winnerAthleteId! : m.loserAthleteId!;
    if (d.slotBFromMatchId === matchId) data.slotBAthleteId = d.slotBWinner ? m.winnerAthleteId! : m.loserAthleteId!;
    await prisma.match.update({ where: { id: d.id }, data });
  }
}

async function resolveByes(categoryId: string) {
  const byes = await prisma.match.findMany({
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
    await prisma.match.update({
      where: { id: m.id },
      data: { winnerAthleteId: winner, status: "COMPLETED", endedAt: new Date() },
    });
    await advanceWinner(m.id);
  }
}
