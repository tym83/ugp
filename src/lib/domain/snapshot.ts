import { prisma } from "@/lib/prisma";
import { levelLabel } from "./levelLabel";
import { IN_BRACKET } from "./bracketStatus";
import type { Snapshot } from "./offlineBracket";

type LabelCat = {
  ageGroupLabel: string;
  level: string;
  sex: string;
  discipline: string;
  isAbsolute: boolean;
  isOpenTop: boolean;
  weightMin: number | null;
  weightMax: number | null;
};

export function categoryLabel(c: LabelCat): string {
  const lvl = levelLabel(c.level) ? ` · ${levelLabel(c.level)}` : "";
  const weight = c.isAbsolute ? "абсолютка" : c.isOpenTop ? `св. ${c.weightMin} кг` : `до ${c.weightMax} кг`;
  return `${c.ageGroupLabel}${lvl} · ${c.sex === "M" ? "муж" : "жен"} · ${c.discipline === "gi" ? "ги" : "ноу-ги"} · ${weight}`;
}

/** Every generated bracket of the event, with full athlete names (organizer-only data). */
export async function buildEventSnapshot(eventId: string, opts?: { categoryId?: string }): Promise<Snapshot> {
  const event = await prisma.event.findUniqueOrThrow({ where: { id: eventId } });
  const categories = await prisma.category.findMany({
    where: {
      eventId,
      ...(opts?.categoryId !== undefined ? { id: opts.categoryId } : { mergedIntoId: null, matches: { some: {} } }),
    },
    orderBy: { order: "asc" },
    include: {
      registrations: { where: { status: { in: IN_BRACKET } }, include: { athlete: { include: { club: true } } } },
      matches: {
        include: { result: { select: { winType: true } } },
        orderBy: [{ isBronzeMatch: "asc" }, { roundNumber: "asc" }, { positionInRound: "asc" }],
      },
    },
  });
  return {
    eventId,
    eventName: event.name,
    takenAt: new Date().toISOString(),
    categories: categories.map((c) => ({
      id: c.id,
      label: categoryLabel(c),
      bracketType: c.bracketType,
      mat: c.matNumber,
      athletes: Object.fromEntries(
        c.registrations.map((r) => [r.athleteId, { name: r.athlete.fullName, club: r.athlete.club?.name ?? null }]),
      ),
      matches: c.matches.map((m) => ({
        id: m.id,
        round: m.roundNumber,
        pos: m.positionInRound,
        bronze: m.isBronzeMatch,
        rr: m.isRoundRobin,
        mat: m.matNumber,
        status: m.status,
        a: m.slotAAthleteId,
        b: m.slotBAthleteId,
        aFrom: m.slotAFromMatchId,
        bFrom: m.slotBFromMatchId,
        aWinner: m.slotAWinner,
        bWinner: m.slotBWinner,
        winner: m.winnerAthleteId,
        loser: m.loserAthleteId,
        winType: m.result?.winType ?? null,
      })),
    })),
  };
}
