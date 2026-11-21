// Извлечение мест (1/2/3) из завершённых матчей категории → Placement[] для командного зачёта.
// Чистая функция: клубы приходят картами (athleteId → clubId/clubName), чтобы не тянуть БД.

import { rankRoundRobin, parsePlacesOverride } from "./roundRobin";
import type { Placement } from "./teamscore";

/** Минимальная форма категории для определения мест. */
export type PlacementCat = {
  placesOverride?: string | null;
  isAbsolute: boolean;
  bracketType: "SINGLE_ELIM" | "ROUND_ROBIN" | string;
};

/** Минимальная форма матча (строка БД). */
export type PlacementMatch = {
  winType?: string | null;
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
 *  ROUND_ROBIN: rank by wins and submissions, withholding unresolved places. */
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
    const rr = matches.filter((m) => m.isRoundRobin);
    if (!rr.length || rr.some((m) => m.status !== "COMPLETED")) return [];
    const ranked = rankRoundRobin(rr.map((m) => ({ a: m.slotAAthleteId, b: m.slotBAthleteId, winner: m.winnerAthleteId, status: m.status, winType: m.winType })), parsePlacesOverride(cat.placesOverride));
    const tied = new Set(ranked.tiedGroups.flat());
    const out: Placement[] = [];
    ([1, 2, 3] as const).forEach((p, i) => {
      const id = ranked.order[i];
      if (id && !tied.has(id)) {
        const pl = place(id, p);
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
  } else if (!matches.some((m) => m.isBronzeMatch) && final?.winnerAthleteId) {
    // без схватки за 3-е (на троих): 3-е — проигравшие полуфиналов
    for (const m of nonBronze.filter((x) => x.roundNumber === finalRound - 1 && x.status === "COMPLETED")) {
      const third = place(m.loserAthleteId, 3);
      if (third) out.push(third);
    }
  }
  return out;
}

function otherSlot(m: PlacementMatch, winnerId: string): string | null {
  if (m.slotAAthleteId && m.slotAAthleteId !== winnerId) return m.slotAAthleteId;
  if (m.slotBAthleteId && m.slotBAthleteId !== winnerId) return m.slotBAthleteId;
  return null;
}
