import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { generateBracket, type Bracket } from "./bracket";
import { applyResult, canUndo, isPlayable, placesOf, rebase, type SnapCategory, type SnapMatch, type Snapshot } from "./offlineBracket";
import { buildBracketWorkbook, orderedMatches } from "./bracketXlsx";

/** Turn a generated bracket into snapshot matches, resolving BYEs like persistBracket does. */
export function toSnap(b: Bracket): SnapMatch[] {
  const key = (r: number, p: number, bronze = false) => `${r}:${p}:${bronze ? "b" : ""}`;
  const ids = new Map(b.matches.map((m, i) => [key(m.round, m.pos, m.isBronze), `m${i + 1}`]));
  let ms: SnapMatch[] = b.matches.map((m) => ({
    id: ids.get(key(m.round, m.pos, m.isBronze))!,
    round: m.round,
    pos: m.pos,
    bronze: !!m.isBronze,
    rr: !!m.isRoundRobin,
    mat: null,
    status: "PENDING",
    a: m.aId ?? null,
    b: m.bId ?? null,
    aFrom: m.aFrom ? ids.get(key(m.aFrom.round, m.aFrom.pos))! : null,
    bFrom: m.bFrom ? ids.get(key(m.bFrom.round, m.bFrom.pos))! : null,
    aWinner: m.aFrom ? m.aFrom.winner : true,
    bWinner: m.bFrom ? m.bFrom.winner : true,
    winner: null,
    loser: null,
    winType: null,
  }));
  for (const m of [...ms]) {
    if (!m.aFrom && !m.bFrom && (!!m.a !== !!m.b)) {
      const w = (m.a ?? m.b)!;
      ms = ms.map((x) => {
        if (x.id === m.id) return { ...x, status: "COMPLETED", winner: w };
        let n = x;
        if (x.aFrom === m.id && x.aWinner) n = { ...n, a: w };
        if (x.bFrom === m.id && x.bWinner) n = { ...n, b: w };
        return n;
      });
    }
  }
  return ms;
}

const people = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `p${i + 1}`, clubId: `c${i}` }));

function category(n: number, type: "SINGLE_ELIM" | "ROUND_ROBIN" = "SINGLE_ELIM"): SnapCategory {
  const ps = people(n);
  return {
    id: `cat${n}`,
    label: `Тест ${n}`,
    bracketType: type,
    athletes: Object.fromEntries(ps.map((p) => [p.id, { name: `Спортсмен ${p.id}`, club: "Клуб" }])),
    matches: toSnap(generateBracket(ps, type)),
  };
}

/** Play every bout: the lower id always wins. */
function playAll(cat: SnapCategory): SnapCategory {
  let ms = cat.matches;
  for (let guard = 0; guard < 100; guard++) {
    const m = ms.find(isPlayable);
    if (!m) break;
    const w = [m.a!, m.b!].sort((x, y) => Number(x.slice(1)) - Number(y.slice(1)))[0];
    ms = applyResult(ms, m.id, w, "SUBMISSION");
  }
  return { ...cat, matches: ms };
}

describe("offline bracket", () => {
  it("advances winners and semifinal losers like the server", () => {
    const done = playAll(category(8));
    expect(done.matches.every((m) => m.status === "COMPLETED")).toBe(true);
    const p = placesOf(done);
    expect(p.first).toBe("p1");
    expect(p.second).toBe("p2");
    expect(p.third).toEqual(["p3"]);
  });

  it("plays a 5-athlete bracket with byes to the end", () => {
    const done = playAll(category(5));
    expect(done.matches.filter((m) => !m.bronze).every((m) => m.status === "COMPLETED")).toBe(true);
    expect(placesOf(done).first).toBe("p1");
  });

  it("three athletes: no bronze bout, the semifinal loser is third", () => {
    const cat = category(3);
    expect(cat.matches.some((m) => m.bronze)).toBe(false);
    const done = playAll(cat);
    expect(done.matches.every((m) => m.status === "COMPLETED")).toBe(true);
    const p = placesOf(done);
    expect([p.first, p.second, p.third]).toEqual(["p1", "p2", ["p3"]]);
  });

  it("round robin ranks by wins", () => {
    const done = playAll(category(4, "ROUND_ROBIN"));
    const p = placesOf(done);
    expect([p.first, p.second, p.third[0]]).toEqual(["p1", "p2", "p3"]);
  });

  it("rejects a winner who is not in the bout and a second result", () => {
    const cat = category(4);
    const m = cat.matches.find(isPlayable)!;
    expect(() => applyResult(cat.matches, m.id, "p99", "SUBMISSION")).toThrow();
    const after = applyResult(cat.matches, m.id, m.a!, "SUBMISSION");
    expect(() => applyResult(after, m.id, m.a!, "SUBMISSION")).toThrow();
  });

  it("undo is allowed only while the next bout is unplayed", () => {
    let ms = category(4).matches;
    const [s1, s2] = ms.filter((m) => m.round === 1);
    ms = applyResult(ms, s1.id, s1.a!, "SUBMISSION");
    expect(canUndo(ms, s1.id)).toBe(true);
    ms = applyResult(ms, s2.id, s2.a!, "SUBMISSION");
    const final = ms.find((m) => m.round === 2 && !m.bronze)!;
    ms = applyResult(ms, final.id, final.a!, "SUBMISSION");
    expect(canUndo(ms, s1.id)).toBe(false);
  });

  it("rebase drops results already on the site and flags different winners", () => {
    const cat = category(4);
    const [s1, s2] = cat.matches.filter((m) => m.round === 1);
    const snap: Snapshot = { eventId: "e", eventName: "E", takenAt: new Date().toISOString(), categories: [cat] };
    const outbox = [
      { cmid: "1", categoryId: cat.id, matchId: s1.id, winnerAthleteId: s1.a!, winType: "SUBMISSION", at: "" },
      { cmid: "2", categoryId: cat.id, matchId: s2.id, winnerAthleteId: s2.a!, winType: "SUBMISSION", at: "" },
    ];
    // the site already has s1 with the same winner and s2 with the other athlete
    let server = applyResult(cat.matches, s1.id, s1.a!, "SUBMISSION");
    server = applyResult(server, s2.id, s2.b!, "SUBMISSION");
    const r = rebase({ ...snap, categories: [{ ...cat, matches: server }] }, outbox);
    expect(r.outbox).toEqual([]);
    expect(r.conflicts.map((c) => c.cmid)).toEqual(["2"]);

    // nothing on the site yet: both stay pending and the final is filled locally
    const fresh = rebase(snap, outbox);
    expect(fresh.outbox.length).toBe(2);
    const final = fresh.view.categories[0].matches.find((m) => m.round === 2 && !m.bronze)!;
    expect([final.a, final.b]).toEqual([s1.a, s2.a]);
  });

  it("rebase flags results for bouts removed by a bracket rebuild", () => {
    const cat = category(4);
    const snap: Snapshot = { eventId: "e", eventName: "E", takenAt: "", categories: [cat] };
    const r = rebase(snap, [{ cmid: "x", categoryId: cat.id, matchId: "gone", winnerAthleteId: "p1", winType: "SUBMISSION", at: "" }]);
    expect(r.conflicts.length).toBe(1);
  });
});

describe("bracket workbook", () => {
  it("has a sheet per category, winner dropdowns and formulas feeding later bouts", async () => {
    const cats = [category(4), category(3), category(5, "ROUND_ROBIN")];
    const buf = await buildBracketWorkbook({ eventId: "e", eventName: "Турнир", takenAt: new Date().toISOString(), categories: cats });
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as unknown as ArrayBuffer);
    expect(wb.worksheets.map((w) => w.name)).toEqual(["Призёры", "Тест 4", "Тест 3", "Тест 5"]);

    const ws = wb.getWorksheet("Тест 4")!;
    const order = orderedMatches(cats[0]);
    expect(order.map((m) => (m.bronze ? "B" : m.round))).toEqual([1, 1, "B", 2]);
    // final (row 10) takes the winners of rows 7 and 8; bronze (row 9) takes their losers
    expect((ws.getCell("C10").value as ExcelJS.CellFormulaValue).formula).toContain("E7");
    expect((ws.getCell("D10").value as ExcelJS.CellFormulaValue).formula).toContain("E8");
    expect((ws.getCell("C9").value as ExcelJS.CellFormulaValue).formula).toContain("F7");
    expect(ws.getCell("E7").dataValidation?.formulae).toEqual(["$C$7:$D$7"]);
    expect((ws.getCell("C3").value as ExcelJS.CellFormulaValue).formula).toBe('IF(E10="","",E10)');
  });
});
