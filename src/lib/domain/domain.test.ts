import { describe, it, expect } from "vitest";
import {
  nextPow2,
  seedPositions,
  separateClubs,
  generateSingleElim,
  generateRoundRobin,
  type Participant,
} from "./bracket";
import { selectTier, priceEntry, coachTransferTotal, type Tier } from "./pricing";
import { weightFits, ageEligible, eligibleCategories, nativeCategory, type Cat } from "./eligibility";
import { canMerge, needsMerge, suggestMergeTarget, ageBand, type MergeCat } from "./merge";
import { computeTeamScores, type Placement } from "./teamscore";

const P = (id: string, clubId?: string, seed?: number): Participant => ({ id, clubId, seed });

describe("bracket: single elimination", () => {
  it("nextPow2", () => {
    expect(nextPow2(1)).toBe(1);
    expect(nextPow2(5)).toBe(8);
    expect(nextPow2(8)).toBe(8);
    expect(nextPow2(9)).toBe(16);
  });

  it("8 участников → 7 матчей + бронза, финал и бронза в последнем круге", () => {
    const parts = Array.from({ length: 8 }, (_, i) => P(`a${i}`, undefined, i + 1));
    const b = generateSingleElim(parts, { bronzeMode: "SINGLE_MATCH_3RD" });
    expect(b.size).toBe(8);
    const nonBronze = b.matches.filter((m) => !m.isBronze);
    expect(nonBronze.length).toBe(7); // 4+2+1
    const bronze = b.matches.filter((m) => m.isBronze);
    expect(bronze.length).toBe(1);
    const rounds = Math.max(...b.matches.map((m) => m.round));
    expect(rounds).toBe(3);
    const final = b.matches.find((m) => m.round === 3 && !m.isBronze);
    expect(final?.pos).toBe(0);
    // бронза кормится проигравшими полуфиналов
    expect(bronze[0].aFrom?.winner).toBe(false);
    expect(bronze[0].bFrom?.winner).toBe(false);
  });

  it("5 участников → размер 8, есть BYE в первом круге", () => {
    const parts = Array.from({ length: 5 }, (_, i) => P(`a${i}`, undefined, i + 1));
    const b = generateSingleElim(parts);
    expect(b.size).toBe(8);
    const r1 = b.matches.filter((m) => m.round === 1);
    expect(r1.length).toBe(4);
    const byes = r1.filter((m) => m.aId === null || m.bId === null);
    expect(byes.length).toBe(3); // 8-5 = 3 bye
  });

  it("seedPositions размещает 1 и 2 сида в разных половинах", () => {
    const pos = seedPositions(8);
    expect(pos[0]).toBe(1);
    expect(pos.indexOf(2)).toBeGreaterThanOrEqual(4); // сид 2 во второй половине
  });

  it("separateClubs разводит одноклубников в паре", () => {
    const slots = [P("a", "c1"), P("b", "c1"), P("c", "c2"), P("d", "c3")];
    const sep = separateClubs(slots);
    // первая пара больше не два из c1
    const pair0 = [sep[0], sep[1]];
    expect(pair0[0]?.clubId === "c1" && pair0[1]?.clubId === "c1").toBe(false);
  });

  it("2 участника → 1 матч, без бронзы", () => {
    const b = generateSingleElim([P("a"), P("b")]);
    expect(b.matches.filter((m) => !m.isBronze).length).toBe(1);
    expect(b.matches.filter((m) => m.isBronze).length).toBe(0);
  });
});

describe("bracket: round robin", () => {
  it("4 участника → 6 матчей, 3 тура", () => {
    const b = generateRoundRobin([P("a"), P("b"), P("c"), P("d")]);
    expect(b.matches.length).toBe(6);
    expect(Math.max(...b.matches.map((m) => m.round))).toBe(3);
  });
  it("3 участника → 3 матча (bye корректно)", () => {
    const b = generateRoundRobin([P("a"), P("b"), P("c")]);
    expect(b.matches.length).toBe(3);
  });
});

describe("pricing", () => {
  const tiers: Tier[] = [
    { name: "Ранняя", startsAt: new Date("2026-09-01"), priceOneDivision: 2000, priceBothDivisions: 3000, absoluteSurcharge: 1000 },
    { name: "Поздняя", startsAt: new Date("2026-11-01"), priceOneDivision: 3000, priceBothDivisions: 4500, absoluteSurcharge: 1000 },
  ];
  it("selectTier по дате", () => {
    expect(selectTier(tiers, new Date("2026-09-15"))?.name).toBe("Ранняя");
    expect(selectTier(tiers, new Date("2026-11-05"))?.name).toBe("Поздняя");
  });
  it("priceEntry: разделы и абсолютка", () => {
    const early = tiers[0];
    expect(priceEntry(early, { disciplines: ["gi"], absoluteAdded: false })).toBe(2000);
    expect(priceEntry(early, { disciplines: ["gi", "nogi"], absoluteAdded: false })).toBe(3000);
    expect(priceEntry(early, { disciplines: ["gi"], absoluteAdded: true })).toBe(3000);
    const late = tiers[1];
    expect(priceEntry(late, { disciplines: ["gi", "nogi"], absoluteAdded: false })).toBe(4500);
  });
  it("coachTransferTotal: комиссия 200 с каждого", () => {
    const r = coachTransferTotal([2000, 3000, 3000], 200);
    expect(r.gross).toBe(8000);
    expect(r.commission).toBe(600);
    expect(r.net).toBe(7400);
    expect(r.count).toBe(3);
  });
});

describe("eligibility", () => {
  const cat = (o: Partial<Cat>): Cat => ({
    id: "x", sex: "M", discipline: "gi", birthYearFrom: 2015, birthYearTo: 2016,
    weightMin: 24, weightMax: 27, isOpenTop: false, isAbsolute: false, ...o,
  });
  it("weightFits границы", () => {
    const c = cat({ weightMin: 24, weightMax: 27 });
    expect(weightFits(24, c)).toBe(false); // 24 включ. в нижнюю → не сюда
    expect(weightFits(24.5, c)).toBe(true);
    expect(weightFits(27, c)).toBe(true);
    expect(weightFits(27.1, c)).toBe(false);
    const open = cat({ weightMin: 99, weightMax: null, isOpenTop: true });
    expect(weightFits(120, open)).toBe(true);
    expect(weightFits(80, open)).toBe(false);
  });
  it("ageEligible своя группа и play-up вверх", () => {
    const c = cat({ birthYearFrom: 2013, birthYearTo: 2014 });
    expect(ageEligible(2013, c, false)).toBe(true);
    expect(ageEligible(2016, c, false)).toBe(false); // младше, без play-up
    expect(ageEligible(2016, c, true)).toBe(true); // младший играет вверх в старшую
    expect(ageEligible(2010, c, true)).toBe(false); // старше — вниз нельзя
  });
  it("eligibleCategories / nativeCategory", () => {
    const cats = [
      cat({ id: "c1", weightMin: 24, weightMax: 27 }),
      cat({ id: "c2", weightMin: 27, weightMax: 30 }),
      cat({ id: "c3", sex: "F" }),
    ];
    const a = { sex: "M" as const, birthYear: 2015, weight: 26 };
    const el = eligibleCategories(a, "gi", cats);
    expect(el.map((c) => c.id)).toEqual(["c1"]);
    expect(nativeCategory(a, "gi", cats)?.id).toBe("c1");
  });
});

describe("merge", () => {
  const mc = (o: Partial<MergeCat>): MergeCat => ({
    id: "x", sex: "M", discipline: "gi", ageGroupCode: "kids-2015-2016",
    weightMax: 27, isOpenTop: false, isAbsolute: false, count: 1, minParticipants: 3, ...o,
  });
  it("ageBand", () => {
    expect(ageBand("kids-2015-2016")).toBe("kids");
    expect(ageBand("juniors-2011-2012")).toBe("juniors");
    expect(ageBand("adults-2008")).toBe("adults");
    expect(ageBand("veterans-1991")).toBe("veterans");
  });
  it("canMerge: нельзя дети↔взрослые, разный пол/дисциплина", () => {
    const kid = mc({ ageGroupCode: "kids-2015-2016" });
    const adult = mc({ ageGroupCode: "adults-2008" });
    expect(canMerge(kid, adult)).toBe(false);
    expect(canMerge(mc({ id: "a" }), mc({ id: "b", sex: "F" }))).toBe(false);
    expect(canMerge(mc({ id: "a" }), mc({ id: "b", discipline: "nogi" }))).toBe(false);
    expect(canMerge(mc({ id: "a", weightMax: 24 }), mc({ id: "b", weightMax: 27 }))).toBe(true);
  });
  it("needsMerge и suggestMergeTarget (ближайшая старшая по весу)", () => {
    const cats = [
      mc({ id: "a", weightMax: 24, count: 1 }),
      mc({ id: "b", weightMax: 27, count: 5 }),
      mc({ id: "c", weightMax: 30, count: 4 }),
    ];
    const need = needsMerge(cats);
    expect(need.map((c) => c.id)).toEqual(["a"]);
    expect(suggestMergeTarget(cats[0], cats)?.id).toBe("b");
  });
});

describe("teamscore", () => {
  it("суммирует очки и ранжирует клубы", () => {
    const pl: Placement[] = [
      { clubId: "c1", clubName: "Club1", place: 1 },
      { clubId: "c1", clubName: "Club1", place: 2 },
      { clubId: "c2", clubName: "Club2", place: 1 },
    ];
    const s = computeTeamScores(pl);
    expect(s[0].clubId).toBe("c1"); // 9+3=12
    expect(s[0].points).toBe(12);
    expect(s[1].points).toBe(9);
    expect(s[0].place).toBe(1);
    expect(s[1].place).toBe(2);
  });
});
