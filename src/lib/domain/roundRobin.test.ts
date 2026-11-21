import ExcelJS from "exceljs";
import { buildBracketWorkbook } from "./bracketXlsx";
import { describe, expect, it } from "vitest";
import { bracketTypeForEntrants, rankRoundRobin, type RoundRobinMatch } from "./roundRobin";
import { generateBracket } from "./bracket";
import { placementsFromCategory, type PlacementMatch } from "./placement";
import { placesOf, rebase, type SnapCategory } from "./offlineBracket";

const cycle: RoundRobinMatch[] = [
  { a: "a", b: "b", winner: "a", status: "COMPLETED", winType: "POINTS" },
  { a: "b", b: "c", winner: "b", status: "COMPLETED", winType: "POINTS" },
  { a: "a", b: "c", winner: "c", status: "COMPLETED", winType: "POINTS" },
];
const placements = (matches: RoundRobinMatch[], override?: string[]) => placementsFromCategory(
  { isAbsolute: false, bracketType: "ROUND_ROBIN", placesOverride: override ? JSON.stringify(override) : null },
  matches.map((m, i): PlacementMatch => ({ roundNumber: 1, positionInRound: i, isBronzeMatch: false, isRoundRobin: true, status: m.status, slotAAthleteId: m.a, slotBAthleteId: m.b, winnerAthleteId: m.winner, loserAthleteId: null, winType: m.winType })),
  (id) => ({ clubId: id, clubName: id }),
);
const cat = (): SnapCategory => ({ id: "cat", label: "test", bracketType: "ROUND_ROBIN", athletes: {}, matches: cycle.map((m, i) => ({ ...m, winType: m.winType!, id: String(i), round: 1, pos: i, bronze: false, rr: true, mat: null, aFrom: null, bFrom: null, aWinner: true, bWinner: true, loser: null })) });

describe("round robin ranking", () => {
  it("ranks a clear winner and all places", () => {
    const matches = cycle.map((m, i) => i === 2 ? { ...m, winner: "a" } : m);
    expect(rankRoundRobin(matches)).toEqual({ order: ["a", "b", "c"], decided: true, tiedGroups: [] });
  });
  it("uses submissions to decide first place in a 1-1-1 cycle, leaving second and third tied", () => {
    const matches = cycle.map((m, i) => i === 1 ? { ...m, winType: "SUBMISSION" } : m);
    expect(rankRoundRobin(matches)).toEqual({ order: ["b", "a", "c"], decided: false, tiedGroups: [["a", "c"]] });
    expect(placements(matches).map((p) => [p.clubId, p.place])).toEqual([["b", 1]]);
  });
  it("awards no medals when all submissions are equal", () => {
    expect(rankRoundRobin(cycle)).toEqual({ order: ["a", "b", "c"], decided: false, tiedGroups: [["a", "b", "c"]] });
    expect(placements(cycle)).toEqual([]);
    expect(placesOf(cat())).toEqual({ first: null, second: null, third: [] });
  });
  it("manual places override scores in ranking, team placements and offline", () => {
    const override = ["c", "b", "a"];
    expect(rankRoundRobin(cycle, override)).toEqual({ order: override, decided: true, tiedGroups: [] });
    expect(placements(cycle, override).map((p) => [p.clubId, p.place])).toEqual([["c", 1], ["b", 2], ["a", 3]]);
    expect(placesOf({ ...cat(), placesOverride: override })).toEqual({ first: "c", second: "b", third: ["a"] });
  });
  it("rejects malformed overrides and withholds places before completion", () => {
    expect(rankRoundRobin(cycle, ["a", "a", "c"]).decided).toBe(false);
    expect(placements(cycle.map((m, i) => i === 2 ? { ...m, status: "PENDING" } : m))).toEqual([]);
  });
  it("clears manual places when replaying a local result", () => {
    const category = cat();
    category.placesOverride = ["c", "b", "a"];
    category.matches[0] = { ...category.matches[0], status: "PENDING", winner: null };
    const { view } = rebase({ eventId: "event", eventName: "test", takenAt: "", categories: [category] }, [{ cmid: "new", categoryId: "cat", matchId: "0", winnerAthleteId: "a", winType: "SUBMISSION", at: "" }]);
    expect(view.categories[0].placesOverride).toBeNull();
  });
});

describe("persisted bracket format selection", () => {
  it.each([0, 1, 2, 4, 8, 16])("uses elimination for %i entrants", (count) => {
    expect(bracketTypeForEntrants(count)).toBe("SINGLE_ELIM");
  });
  it("generates three independent bouts for three entrants", () => {
    const bracket = generateBracket(["a", "b", "c"].map((id) => ({ id, clubId: id })), bracketTypeForEntrants(3));
    expect(bracket.matches).toHaveLength(3);
    expect(bracket.matches.every((m) => m.isRoundRobin && !m.aFrom && !m.bFrom)).toBe(true);
    expect(new Set(bracket.matches.map((m) => [m.aId, m.bId].sort().join(":"))).size).toBe(3);
  });
});

describe("round robin Excel export", () => {
  it("exports submission scoring, unresolved places and linked print bouts", async () => {
    const category = cat();
    category.athletes = Object.fromEntries(["a", "b", "c"].map((id) => [id, { name: id, club: null }]));
    const buffer = await buildBracketWorkbook({ eventId: "event", eventName: "test", takenAt: new Date().toISOString(), categories: [category] });
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as unknown as ExcelJS.Buffer);
    const sheet = wb.worksheets.find((s) => s.getCell("L6").value === "Сдачей")!;
    expect(sheet).toBeDefined();
    expect(sheet.getCell("L7").formula).toBe('COUNTIFS($E$7:$E$9,J7,$G$7:$G$9,"Сдача")');
    expect(sheet.getCell("M7").formula).toBe("K7*100+L7");
    expect(sheet.getCell("C3").formula).toContain('COUNTIF($M$7:$M$9,LARGE($M$7:$M$9,1))>1,"ничья — решает судья"');
    expect(sheet.getCell("C3").formula).toContain('COUNTIF($E$7:$E$9,"?*")<3');
    const print = wb.getWorksheet("Все категории")!;
    expect(print).toBeDefined();
    const formulas: string[] = [];
    print.eachRow((row) => row.eachCell((cell) => { if (cell.formula) formulas.push(cell.formula); }));
    expect(formulas.some((formula) => formula.includes("!C3"))).toBe(true);
    for (const row of [7, 8, 9]) expect(formulas.some((formula) => formula.includes(`!E${row}`))).toBe(true);
  });
});
