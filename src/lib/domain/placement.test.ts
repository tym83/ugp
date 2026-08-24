import { describe, it, expect } from "vitest";
import { placementsFromCategory, type PlacementCat, type PlacementMatch, type ClubOf } from "./placement";
import { computeTeamScores } from "./teamscore";

const clubs: Record<string, { clubId: string; clubName: string }> = {
  a1: { clubId: "c1", clubName: "Club1" },
  a2: { clubId: "c2", clubName: "Club2" },
  a3: { clubId: "c3", clubName: "Club3" },
  a4: { clubId: "c1", clubName: "Club1" },
};
const clubOf: ClubOf = (id) => clubs[id] ?? null;

const m = (o: Partial<PlacementMatch>): PlacementMatch => ({
  roundNumber: 1,
  positionInRound: 0,
  isBronzeMatch: false,
  isRoundRobin: false,
  status: "COMPLETED",
  winnerAthleteId: null,
  loserAthleteId: null,
  slotAAthleteId: null,
  slotBAthleteId: null,
  ...o,
});

const elim: PlacementCat = { isAbsolute: false, bracketType: "SINGLE_ELIM" };
const rr: PlacementCat = { isAbsolute: false, bracketType: "ROUND_ROBIN" };

describe("placementsFromCategory: single elimination", () => {
  it("финал даёт 1 и 2 место, бронза — 3", () => {
    const matches = [
      m({ roundNumber: 1, positionInRound: 0, slotAAthleteId: "a1", slotBAthleteId: "a4", winnerAthleteId: "a1", loserAthleteId: "a4" }),
      m({ roundNumber: 1, positionInRound: 1, slotAAthleteId: "a2", slotBAthleteId: "a3", winnerAthleteId: "a2", loserAthleteId: "a3" }),
      m({ roundNumber: 2, positionInRound: 0, slotAAthleteId: "a1", slotBAthleteId: "a2", winnerAthleteId: "a1", loserAthleteId: "a2" }),
      m({ roundNumber: 2, positionInRound: 1, isBronzeMatch: true, slotAAthleteId: "a4", slotBAthleteId: "a3", winnerAthleteId: "a3", loserAthleteId: "a4" }),
    ];
    const pl = placementsFromCategory(elim, matches, clubOf);
    expect(pl.find((p) => p.place === 1)?.clubId).toBe("c1"); // a1
    expect(pl.find((p) => p.place === 2)?.clubId).toBe("c2"); // a2
    expect(pl.find((p) => p.place === 3)?.clubId).toBe("c3"); // a3
    expect(pl.length).toBe(3);
  });

  it("проигравший финала выводится и без loserAthleteId (по слотам)", () => {
    const matches = [
      m({ roundNumber: 1, positionInRound: 0, slotAAthleteId: "a1", slotBAthleteId: "a2", winnerAthleteId: "a1" }),
    ];
    const pl = placementsFromCategory(elim, matches, clubOf);
    expect(pl.find((p) => p.place === 1)?.clubId).toBe("c1");
    expect(pl.find((p) => p.place === 2)?.clubId).toBe("c2");
  });

  it("незавершённый финал → нет мест", () => {
    const matches = [m({ roundNumber: 2, positionInRound: 0, status: "PENDING" })];
    expect(placementsFromCategory(elim, matches, clubOf)).toEqual([]);
  });
});

describe("placementsFromCategory: round robin", () => {
  it("ранжирует по числу побед", () => {
    const matches = [
      m({ isRoundRobin: true, slotAAthleteId: "a1", slotBAthleteId: "a2", winnerAthleteId: "a1" }),
      m({ isRoundRobin: true, slotAAthleteId: "a1", slotBAthleteId: "a3", winnerAthleteId: "a1" }),
      m({ isRoundRobin: true, slotAAthleteId: "a2", slotBAthleteId: "a3", winnerAthleteId: "a2" }),
    ];
    const pl = placementsFromCategory(rr, matches, clubOf);
    expect(pl.find((p) => p.place === 1)?.clubId).toBe("c1"); // a1 2 wins
    expect(pl.find((p) => p.place === 2)?.clubId).toBe("c2"); // a2 1 win
    expect(pl.find((p) => p.place === 3)?.clubId).toBe("c3"); // a3 0 wins
  });
});

describe("placement → teamscore integration", () => {
  it("места дают очки клубам", () => {
    const matches = [
      m({ roundNumber: 2, positionInRound: 0, slotAAthleteId: "a1", slotBAthleteId: "a2", winnerAthleteId: "a1", loserAthleteId: "a2" }),
      m({ roundNumber: 2, positionInRound: 1, isBronzeMatch: true, slotAAthleteId: "a3", slotBAthleteId: "a4", winnerAthleteId: "a3" }),
    ];
    const pl = placementsFromCategory(elim, matches, clubOf);
    const scores = computeTeamScores(pl);
    expect(scores[0].clubId).toBe("c1"); // 9
    expect(scores[0].points).toBe(9);
  });
});
