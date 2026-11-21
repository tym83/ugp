import { rankRoundRobin } from "./roundRobin";
// Excel workbook of all brackets: one sheet per category. The winner of each bout is picked
// from a dropdown, and formulas carry winners (and semifinal losers, for the bronze bout)
// into the next bouts, so the workbook works as a stand-alone paper-free fallback.
import ExcelJS from "exceljs";
import type { Snapshot, SnapCategory, SnapMatch } from "./offlineBracket";
import { inBracket } from "./bracketStatus";

const WIN_TYPES = ["Сдача", "По очкам", "Решением", "Дисквалификация", "Неявка", "Травма"];
const WIN_TYPE_RU: Record<string, string> = {
  SUBMISSION: "Сдача",
  POINTS: "По очкам",
  DECISION: "Решением",
  DQ: "Дисквалификация",
  NO_SHOW: "Неявка",
  INJURY: "Травма",
  WALKOVER: "Неявка",
};
const HEADER_ROW = 6;
const INPUT_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFF4CC" } };
const HEAD_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE3863D" } };

/** Bouts in playing order: rounds ascending, the bronze bout right before the final. */
export function orderedMatches(cat: SnapCategory): SnapMatch[] {
  const main = cat.matches.filter((m) => !m.bronze).sort((x, y) => x.round - y.round || x.pos - y.pos);
  const bronze = cat.matches.filter((m) => m.bronze);
  if (!bronze.length || cat.bracketType === "ROUND_ROBIN") return [...main, ...bronze];
  const lastRound = Math.max(...main.map((m) => m.round));
  const beforeFinal = main.filter((m) => m.round < lastRound);
  const final = main.filter((m) => m.round === lastRound);
  return [...beforeFinal, ...bronze, ...final];
}

function roundName(m: SnapMatch, lastRound: number, rr: boolean): string {
  if (rr) return `Тур ${m.round}`;
  if (m.bronze) return "За 3-е место";
  const left = lastRound - m.round;
  if (left === 0) return "Финал";
  if (left === 1) return "Полуфинал";
  if (left === 2) return "1/4 финала";
  return `Круг ${m.round}`;
}

function sheetName(label: string, used: Set<string>): string {
  const base = label.replace(/[\\/?*[\]:]/g, " ").replace(/\s+/g, " ").trim().slice(0, 28);
  let name = base;
  for (let i = 2; used.has(name.toLowerCase()); i++) name = `${base.slice(0, 26)} ${i}`;
  used.add(name.toLowerCase());
  return name;
}

const q = (s: string) => `"${s.replace(/"/g, '""')}"`;

function addCategorySheet(wb: ExcelJS.Workbook, cat: SnapCategory, name: string): { sheet: string; places: string[] } {
  const ws = wb.addWorksheet(name, { views: [{ state: "frozen", ySplit: HEADER_ROW }] });
  const rr = cat.bracketType === "ROUND_ROBIN";
  const nameOf = (id: string | null) => (id ? cat.athletes[id]?.name ?? "?" : "");
  const label = (id: string | null) => {
    if (!id) return "";
    const a = cat.athletes[id];
    return a?.club ? `${a.name} (${a.club})` : nameOf(id);
  };
  const ms = orderedMatches(cat);
  const main = ms.filter((m) => !m.bronze);
  const lastRound = main.length ? Math.max(...main.map((m) => m.round)) : 0;
  const rowOf = new Map(ms.map((m, i) => [m.id, HEADER_ROW + 1 + i]));
  const numOf = new Map(ms.map((m, i) => [m.id, i + 1]));

  ws.columns = [
    { key: "n", width: 5 },
    { key: "round", width: 14 },
    { key: "a", width: 38 },
    { key: "b", width: 38 },
    { key: "winner", width: 38 },
    { key: "loser", width: 38 },
    { key: "how", width: 16 },
    { key: "note", width: 18 },
  ];
  ws.getCell("A1").value = cat.mat ? `${cat.label} · ковёр ${cat.mat}` : cat.label;
  ws.getCell("A1").font = { bold: true, size: 14 };
  ws.getCell("A2").value = "Выберите победителя в жёлтой колонке — следующие схватки заполнятся сами.";
  ws.getCell("A2").font = { italic: true, color: { argb: "FF666666" } };

  const head = ws.getRow(HEADER_ROW);
  head.values = ["№", "Круг", "Участник A", "Участник B", "Победитель", "Проигравший", "Как", "Счёт / заметка"];
  head.eachCell((c) => {
    c.font = { bold: true, color: { argb: "FF000000" } };
    c.fill = HEAD_FILL;
  });

  // Participant cell: either a fixed athlete or a formula pointing at a feeder bout.
  const slot = (athlete: string | null, from: string | null, winner: boolean, m: SnapMatch): ExcelJS.CellValue => {
    if (from && rowOf.has(from)) {
      const r = rowOf.get(from)!;
      const col = winner ? "E" : "F";
      const placeholder = `${winner ? "победитель" : "проигравший"} №${numOf.get(from)}`;
      const result = athlete ? label(athlete) : placeholder;
      return { formula: `IF(${col}${r}="",${q(placeholder)},${col}${r})`, result };
    }
    if (athlete) return label(athlete);
    return m.status === "COMPLETED" ? "— (проход без соперника)" : "";
  };

  ms.forEach((m) => {
    const r = rowOf.get(m.id)!;
    const row = ws.getRow(r);
    row.getCell(1).value = numOf.get(m.id)!;
    row.getCell(2).value = roundName(m, lastRound, rr);
    row.getCell(3).value = slot(m.a, m.aFrom, m.aWinner, m);
    row.getCell(4).value = slot(m.b, m.bFrom, m.bWinner, m);
    const bye = m.status === "COMPLETED" && (!m.a || !m.b);
    if (bye) {
      // a walk-over decided at bracket generation: the winner is fixed, there is no loser
      row.getCell(5).value = label(m.winner);
      row.getCell(6).value = "";
      row.getCell(7).value = "проход";
    } else {
      row.getCell(5).value = m.status === "COMPLETED" ? label(m.winner) : null;
      row.getCell(6).value = {
        formula: `IF(E${r}="","",IF(E${r}=C${r},D${r},IF(E${r}=D${r},C${r},"")))`,
        result: m.status === "COMPLETED" ? label(m.loser) : "",
      };
      row.getCell(7).value = m.winType ? WIN_TYPE_RU[m.winType] ?? m.winType : null;
      row.getCell(5).dataValidation = {
        type: "list",
        allowBlank: true,
        formulae: [`$C$${r}:$D$${r}`],
        showErrorMessage: true,
        errorTitle: "Победитель",
        error: "Выберите одного из двух участников схватки",
      };
      row.getCell(7).dataValidation = { type: "list", allowBlank: true, formulae: [`"${WIN_TYPES.join(",")}"`] };
      for (const c of [5, 7, 8]) row.getCell(c).fill = INPUT_FILL;
    }
    if (m.bronze) row.getCell(2).font = { color: { argb: "FFB5651D" }, bold: true };
    if (!m.bronze && m.round === lastRound && !rr) row.getCell(2).font = { bold: true };
  });

  // Places block: rows 3–5, right under the title.
  const places: string[] = [];
  const setPlace = (row: number, title: string, formula: string, result: string) => {
    ws.getCell(`A${row}`).value = title;
    ws.getCell(`A${row}`).font = { bold: true };
    ws.getCell(`C${row}`).value = { formula, result };
    ws.getCell(`C${row}`).font = { bold: true };
    places.push(`'${name.replace(/'/g, "''")}'!C${row}`);
  };
  if (rr) {
    // Score preserves wins as the primary criterion; equal scores remain unresolved.
    const ids = [...new Set(ms.flatMap((m) => [m.a, m.b]).filter((id): id is string => !!id))];
    const first = HEADER_ROW + 1;
    const last = HEADER_ROW + ms.length;
    ws.getCell(HEADER_ROW, 10).value = "Участник";
    ws.getCell(HEADER_ROW, 11).value = "Побед";
    ws.getCell(HEADER_ROW, 12).value = "Сдачей";
    ws.getCell(HEADER_ROW, 13).value = "Баллы";
    ws.getColumn(10).width = 38;
    ids.forEach((id, i) => {
      const r = first + i;
      ws.getCell(r, 10).value = label(id);
      ws.getCell(r, 11).value = { formula: `COUNTIF($E$${first}:$E$${last},J${r})` };
      ws.getCell(r, 12).value = { formula: `COUNTIFS($E$${first}:$E$${last},J${r},$G$${first}:$G$${last},"Сдача")` };
      ws.getCell(r, 13).value = { formula: `K${r}*100+L${r}` };
    });
    const range = `$M$${first}:$M$${HEADER_ROW + ids.length}`;
    const names = `$J$${first}:$J$${HEADER_ROW + ids.length}`;
    const ranking = rankRoundRobin(ms, cat.placesOverride);
    const validOverride = cat.placesOverride && ranking.decided && ranking.order.every((id, i) => id === cat.placesOverride![i]);
    // An exported manual decision applies only while the recorded results remain unchanged.
    const unchanged = ms.flatMap((m, i) => [`E${first + i}=${q(label(m.winner))}`, `G${first + i}=${q(m.winType ? WIN_TYPE_RU[m.winType] ?? m.winType : "")}`]).join(",");
    [1, 2, 3].forEach((p, i) => {
      const automatic = `IF(COUNTIF(${range},LARGE(${range},${p}))>1,"ничья — решает судья",INDEX(${names},MATCH(LARGE(${range},${p}),${range},0)))`;
      const decision = validOverride ? `IF(AND(${unchanged}),${q(label(ranking.order[i]))},${automatic})` : automatic;
      const complete = ms.length > 0 && ms.every((m) => m.status === "COMPLETED");
      const tied = ranking.tiedGroups.some((group) => group.includes(ranking.order[i]));
      const cached = complete ? tied ? "ничья — решает судья" : label(ranking.order[i]) : "";
      setPlace(3 + i, `${p} место`, `IFERROR(IF(COUNTIF($E$${first}:$E$${last},"?*")<${ms.length},"",${decision}),"")`, cached);
    });
  } else {
    const final = ms.find((m) => !m.bronze && m.round === lastRound);
    const bronze = ms.find((m) => m.bronze);
    const fr = final ? rowOf.get(final.id)! : null;
    setPlace(3, "1 место", fr ? `IF(E${fr}="","",E${fr})` : `""`, final?.winner ? label(final.winner) : "");
    setPlace(4, "2 место", fr ? `IF(F${fr}="","",F${fr})` : `""`, final?.loser ? label(final.loser) : "");
    if (bronze) {
      const br = rowOf.get(bronze.id)!;
      setPlace(5, "3 место", `IF(E${br}="","",E${br})`, bronze.winner ? label(bronze.winner) : "");
    } else {
      // на троих схватки за 3-е нет: 3-е — проигравший полуфинала, когда сыгран финал
      const semi = main.find((m) => m.round === lastRound - 1 && !(m.status === "COMPLETED" && (!m.a || !m.b)));
      const sr = semi ? rowOf.get(semi.id)! : null;
      setPlace(
        5,
        "3 место",
        sr && fr ? `IF(E${fr}="","",IF(F${sr}="","",F${sr}))` : `""`,
        final?.winner && semi?.loser ? label(semi.loser) : "",
      );
    }
  }
  return { sheet: name, places };
}

export type CategoryParticipant = {
  fullName: string;
  birthYear: number;
  club: string | null;
  weight: number | null;
  status: string;
};

export async function buildCategoryWorkbook(
  snapshot: Snapshot,
  category: SnapCategory,
  participants: readonly CategoryParticipant[],
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.created = new Date(snapshot.takenAt);
  wb.calcProperties.fullCalcOnLoad = true;
  const ws = wb.addWorksheet("Участники", { views: [{ state: "frozen", ySplit: 1 }] });
  ws.columns = [{ width: 6 }, { width: 40 }, { width: 16 }, { width: 32 }, { width: 12 }, { width: 18 }];
  ws.addRow(["№", "ФИО", "Год рождения", "Клуб", "Вес", "Статус"]);
  ws.getRow(1).eachCell((cell) => {
    cell.font = { bold: true };
    cell.fill = HEAD_FILL;
  });
  participants.filter((p) => inBracket(p.status)).forEach((p, i) => {
    ws.addRow([i + 1, p.fullName, p.birthYear, p.club, p.weight, p.status === "ADMITTED" ? "допущен" : "не взвешен"]);
  });
  if (category.matches.length) {
    addCategorySheet(wb, category, sheetName(category.label, new Set(["участники"])));
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}

export async function buildBracketWorkbook(snapshot: Snapshot): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.created = new Date(snapshot.takenAt);
  wb.calcProperties.fullCalcOnLoad = true;
  const summary = wb.addWorksheet("Призёры", { views: [{ state: "frozen", ySplit: 2 }] });
  summary.columns = [{ width: 60 }, { width: 40 }, { width: 40 }, { width: 40 }];
  summary.getCell("A1").value = `${snapshot.eventName} — призёры (обновляются по листам категорий)`;
  summary.getCell("A1").font = { bold: true, size: 14 };
  const sh = summary.getRow(2);
  sh.values = ["Категория", "1 место", "2 место", "3 место"];
  sh.eachCell((c) => {
    c.font = { bold: true };
    c.fill = HEAD_FILL;
  });

  const print = wb.addWorksheet("Все категории", {
    pageSetup: {
      paperSize: 9,
      orientation: "portrait",
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      margins: { left: 0.25, right: 0.25, top: 0.25, bottom: 0.25, header: 0, footer: 0 },
    },
  });
  print.columns = [{ width: 5 }, { width: 16 }, { width: 30 }, { width: 30 }, { width: 30 }, { width: 16 }];
  print.mergeCells("A1:F1");
  print.getCell("A1").value = "Лист только для печати и просмотра. Победителей вводите на листах категорий — здесь всё обновится само.";
  print.getCell("A1").alignment = { wrapText: true };
  print.getCell("A1").font = { italic: true, size: 10 };
  print.getRow(1).height = 30;
  let printRow = 3;

  const used = new Set<string>(["призёры", "все категории"]);
  snapshot.categories.forEach((cat, i) => {
    const name = sheetName(cat.label, used);
    const { places } = addCategorySheet(wb, cat, name);
    const row = summary.getRow(3 + i);
    row.getCell(1).value = { text: cat.mat ? `${cat.label} · ковёр ${cat.mat}` : cat.label, hyperlink: `#'${name.replace(/'/g, "''")}'!A1` };
    row.getCell(1).font = { color: { argb: "FF1F5FBF" }, underline: true };
    places.forEach((ref, j) => {
      row.getCell(2 + j).value = { formula: `IF(${ref}="","",${ref})` };
    });

    const source = wb.getWorksheet(name)!;
    const quotedName = `'${name.replace(/'/g, "''")}'`;
    // Reuse the snapshot-derived values, including cached feeder placeholders and byes.
    const reference = (address: string, preserveBlank = false): ExcelJS.CellFormulaValue => {
      const cell = source.getCell(address);
      const ref = `${quotedName}!${address}`;
      return {
        formula: preserveBlank ? `IF(${ref}="","",${ref})` : ref,
        result: (cell.type === ExcelJS.ValueType.Formula ? cell.result : cell.value) as string | number ?? "",
      };
    };
    print.mergeCells(`A${printRow}:F${printRow}`);
    print.getCell(printRow, 1).value = row.getCell(1).value;
    print.getCell(printRow, 1).font = { bold: true, size: 14, color: { argb: "FF1F5FBF" }, underline: true };
    print.getRow(printRow++).height = 24;
    print.getCell(printRow++, 1).value = "Участники: ";
    Object.values(cat.athletes).filter((a) => !a.withdrawn).forEach((athlete) => {
      print.mergeCells(`A${printRow}:C${printRow}`);
      print.mergeCells(`D${printRow}:F${printRow}`);
      print.getCell(printRow, 1).value = athlete.name;
      print.getCell(printRow++, 4).value = athlete.club ?? "";
    });
    const header = print.getRow(printRow++);
    header.values = ["№", "Круг", "Участник A", "Участник B", "Победитель", "Как"];
    header.eachCell((cell) => {
      cell.font = { bold: true };
      cell.fill = HEAD_FILL;
    });
    orderedMatches(cat).forEach((_, index) => {
      const target = print.getRow(printRow++);
      ["A", "B", "C", "D", "E", "G"].forEach((column, j) => {
        target.getCell(j + 1).value = reference(`${column}${HEADER_ROW + 1 + index}`, j >= 2);
        target.getCell(j + 1).alignment = { wrapText: true, vertical: "middle" };
      });
      target.height = 30;
    });
    [3, 4, 5].forEach((placeRow, j) => {
      print.mergeCells(`A${printRow}:B${printRow}`);
      print.getCell(printRow, 1).value = `${j + 1} место`;
      print.getCell(printRow, 1).font = { bold: true };
      print.mergeCells(`C${printRow}:F${printRow}`);
      print.getCell(printRow++, 3).value = reference(`C${placeRow}`, true);
    });
    printRow++;
  });
  print.pageSetup.printArea = `A1:F${printRow - 1}`;
  await print.protect("", { selectLockedCells: true, selectUnlockedCells: true, formatColumns: true });
  return Buffer.from(await wb.xlsx.writeBuffer());
}
