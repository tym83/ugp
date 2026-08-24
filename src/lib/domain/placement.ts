// Извлечение мест (1/2/3) из завершённых матчей категории → Placement[] для командного зачёта.
// Чистая функция: клубы приходят картами (athleteId → clubId/clubName), чтобы не тянуть БД.

import type { Placement } from "./teamscore";

/** Минимальная форма категории для определения мест. */
export type PlacementCat = {
  isAbsolute: boolean;
  bracketType: "SINGLE_ELIM" | "ROUND_ROBIN" | string;
};

/** Минимальная форма матча (строка БД). */
export type PlacementMatch = {
  roundNumber: number;
  positionInRound: number;
  isBronzeMatch: boolean;
  isRoundRobin: boolean;
  status: string;
  winnerAthleteId: string | null;
  loserAthleteId: string | null;
  slotAAthleteId: string | null;
  slotBAthleteId: string | null;
};

export type ClubOf = (athleteId: string) => { clubId: string; clubName: string } | null;

/** Определить призёров (1/2/3) категории по завершённым матчам.
 *  SINGLE_ELIM: победитель финала = 1, проигравший финала = 2, победитель бронзы = 3.
 *  ROUND_ROBIN: ранжирование по числу побед (1/2/3). */
export function placementsFromCategory(
  cat: PlacementCat,
  matches: PlacementMatch[],
  clubOf: ClubOf
): Placement[] {
  const place = (athleteId: string | null, p: 1 | 2 | 3): Placement | null => {
    if (!athleteId) return null;
    const club = clubOf(athleteId);
    if (!club) return null;
    return { clubId: club.clubId, clubName: club.clubName, place: p, isAbsolute: cat.isAbsolute || undefined };
  };

  if (cat.bracketType === "ROUND_ROBIN") {
    const wins = new Map<string, number>();
    const seen = new Set<string>();
    for (const m of matches.filter((x) => x.isRoundRobin)) {
      for (const id of [m.slotAAthleteId, m.slotBAthleteId]) if (id) seen.add(id);
      if (m.status === "COMPLETED" && m.winnerAthleteId) {
        wins.set(m.winnerAthleteId, (wins.get(m.winnerAthleteId) ?? 0) + 1);
      }
    }
    const ranked = Array.from(seen)
      .map((id) => ({ id, w: wins.get(id) ?? 0 }))
      .sort((a, b) => b.w - a.w);
    const out: Placement[] = [];
    ([1, 2, 3] as const).forEach((p, i) => {
      const r = ranked[i];
      if (r) {
        const pl = place(r.id, p);
        if (pl) out.push(pl);
      }
    });
    return out;
  }

  // SINGLE_ELIM
  const nonBronze = matches.filter((m) => !m.isBronzeMatch);
  if (!nonBronze.length) return [];
  const finalRound = Math.max(...nonBronze.map((m) => m.roundNumber));
  // в single-elim в финальном круге ровно один не-бронзовый матч — это финал;
  // не завязываемся на positionInRound (генератор может нумеровать иначе)
  const final = nonBronze.find(
    (m) => m.roundNumber === finalRound && m.status === "COMPLETED"
  );
  const bronze = matches.find((m) => m.isBronzeMatch && m.status === "COMPLETED");

  const out: Placement[] = [];
  if (final?.winnerAthleteId) {
    const first = place(final.winnerAthleteId, 1);
    if (first) out.push(first);
    const secondId = final.loserAthleteId ?? otherSlot(final, final.winnerAthleteId);
    const second = place(secondId, 2);
    if (second) out.push(second);
  }
  if (bronze?.winnerAthleteId) {
    const third = place(bronze.winnerAthleteId, 3);
    if (third) out.push(third);
  }
  return out;
}

function otherSlot(m: PlacementMatch, winnerId: string): string | null {
  if (m.slotAAthleteId && m.slotAAthleteId !== winnerId) return m.slotAAthleteId;
  if (m.slotBAthleteId && m.slotBAthleteId !== winnerId) return m.slotBAthleteId;
  return null;
}
