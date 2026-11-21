import ExcelJS from "exceljs";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ event: vi.fn(), entries: vi.fn(), dropouts: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: {
  event: { findUniqueOrThrow: mocks.event },
  eventEntry: { findMany: mocks.entries },
} }));
vi.mock("./dropouts", () => ({ listDropouts: mocks.dropouts }));

import { buildEntriesWorkbook } from "./entriesXlsx";
import { categoryLabel } from "./snapshot";

const registration = (discipline: string, weightMax = 60) => ({
  category: {
    id: `${discipline}-${weightMax}`, order: discipline === "gi" ? 3 : weightMax === 70 ? 1 : 2, matNumber: 2,
    ageGroupLabel: "Юниоры", level: "beginner", sex: "M", discipline,
    isAbsolute: false, isOpenTop: false, weightMin: null, weightMax,
  },
  declaredWeight: 58, actualWeight: 59, status: "ENTERED",
});
const entry = (fullName: string, registrations: ReturnType<typeof registration>[]) => ({
  athlete: { fullName, birthDate: new Date("2000-01-02"), sex: "M", club: { name: "Клуб" }, phone: "123" },
  registrations, priceTotal: 2500, paid: true, paymentKind: "PAID",
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.event.mockResolvedValue({ name: "Турнир" });
  mocks.entries.mockResolvedValue([
    entry("Виктор", [registration("gi"), registration("nogi")]),
    entry("Борис", []),
    entry("Антон", [registration("nogi"), registration("nogi", 70)]),
  ]);
  mocks.dropouts.mockResolvedValue([]);
});

describe("entries workbook", () => {
  it.each([true, false])("splits registrations and preserves table formatting (withMoney=%s)", async (withMoney) => {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(Uint8Array.from(await buildEntriesWorkbook("event", withMoney)).buffer);
    const [gi, nogi, all, cat70, cat60, catGi, dropouts] = workbook.worksheets;
    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual([
      "Ги", "Ноу-ги", "Все", cat70.name, cat60.name, catGi.name, "Выбывшие",
    ]);
    for (const [sheet, reg] of [[cat70, registration("nogi", 70)], [cat60, registration("nogi")], [catGi, registration("gi")]] as const) {
      expect(sheet.getCell("A1").value).toBe(`${categoryLabel(reg.category)} · ковёр 2`);
      expect(sheet.name.length).toBeLessThanOrEqual(31);
    }
    expect(cat60.getRow(3).values).toEqual([undefined, "№", "ФИО", "Дата рождения", "Клуб", "Телефон",
      "Заявленный вес, кг", "Фактический вес, кг", "Статус", ...(withMoney ? ["Взнос, ₽"] : []), "Оплата"]);
    expect(cat60.rowCount).toBe(5);
    for (const [index, fullName] of ["Антон", "Виктор"].entries()) {
      expect(cat60.getRow(index + 4).values).toEqual([undefined, index + 1, fullName, "02.01.2000", "Клуб", "123",
        58, 59, "заявлен", ...(withMoney ? [2500] : []), "оплатил"]);
    }
    expect(cat60.views[0]).toMatchObject({ state: "frozen", ySplit: 3 });
    expect(cat60.autoFilter).toBe(withMoney ? "A3:J3" : "A3:I3");
    expect(all.getCell("G4").value).toEqual({ text: categoryLabel(registration("nogi").category), hyperlink: `#'${cat60.name}'!A1` });
    expect(gi.getCell("G4").value).toEqual({ text: categoryLabel(registration("gi").category), hyperlink: `#'${catGi.name}'!A1` });
    expect(gi.rowCount).toBe(4);
    expect(nogi.rowCount).toBe(6);
    expect(all.rowCount).toBe(8);
    expect(gi.getCell("B4").value).toBe("Виктор");
    expect(nogi.getCell("B6").value).toBe("Виктор");
    expect(gi.getCell("G4").text).toContain(" · ги · до 60 кг");
    expect(nogi.getCell("G6").text).toContain(" · ноу-ги · до 60 кг");
    expect(nogi.getCell("G5").text).toContain("до 70 кг");
    expect(all.getCell("B6").value).toBe("Борис");
    expect(all.getCell("G6").value).toBe("—");
    expect(gi.getCell("A4").value).toBe(1);
    expect([4, 5, 6].map((row) => nogi.getCell(`A${row}`).value)).toEqual([1, null, 2]);
    expect([4, 5, 6, 7, 8].map((row) => all.getCell(`A${row}`).value)).toEqual([1, null, 2, 3, null]);
    const widths = [5, 36, 14, 6, 30, 16, 52, 12, 12, 12, ...(withMoney ? [10] : []), 16];
    for (const [index, sheet] of [gi, nogi, all].entries()) {
      expect(sheet.getCell("A1").value).toMatch(new RegExp(`^Турнир — ${["ги", "ноу-ги", "участники"][index]} \\(выгружено `));
      expect(sheet.views[0]).toMatchObject({ state: "frozen", ySplit: 3 });
      expect(sheet.autoFilter).toBe(withMoney ? "A3:L3" : "A3:K3");
      expect(sheet.columns.map((column) => column.width)).toEqual(widths);
      expect(sheet.getCell("K3").value).toBe(withMoney ? "Взнос, ₽" : "Оплата");
      expect(sheet.getCell("K4").value).toBe(withMoney ? 2500 : "оплатил");
    }
    if (withMoney) {
      expect([4, 5, 6].map((row) => nogi.getCell(`K${row}`).value)).toEqual([2500, null, 2500]);
      expect([4, 5, 6, 7, 8].map((row) => all.getCell(`K${row}`).value)).toEqual([2500, null, 2500, 2500, null]);
    }
    expect(dropouts.getCell("A1").value).toBe("Заявка");
    expect(dropouts.views[0]).toMatchObject({ state: "frozen", ySplit: 1 });
  });

  it("excludes inactive registrations and sanitizes and deduplicates category names", async () => {
    const first = registration("gi");
    first.category.ageGroupLabel = "Д'ети / ? * [ ] : \\ с очень длинным названием";
    first.category.matNumber = 0;
    const second = { ...first, category: { ...first.category, id: "second", order: 4 }, status: "ADMITTED" };
    mocks.entries.mockResolvedValue([
      entry("Антон", [first, second]),
      entry("Борис", [{ ...first, status: "WITHDRAWN" }]),
      entry("Виктор", [{ ...first, status: "OVERWEIGHT" }, { ...registration("nogi"), status: "WITHDRAWN" }]),
    ]);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(Uint8Array.from(await buildEntriesWorkbook("event", false)).buffer);
    expect(workbook.worksheets).toHaveLength(6);
    const [firstSheet, secondSheet] = workbook.worksheets.slice(3, 5);
    expect(firstSheet.name).not.toMatch(/[\\/?*[\]:]/);
    expect(firstSheet.name.length).toBe(31);
    expect(secondSheet.name).toBe(`${firstSheet.name.slice(0, 29)} 2`);
    expect(firstSheet.getCell("A1").value).toBe(categoryLabel(first.category));
    expect(firstSheet.rowCount).toBe(4);
    expect(secondSheet.rowCount).toBe(4);
    expect(secondSheet.getCell("H4").value).toBe("допущен");
    expect(workbook.getWorksheet("Ги")!.getCell("G4").value).toEqual({
      text: categoryLabel(first.category), hyperlink: `#'${firstSheet.name.replace(/'/g, "''")}'!A1`,
    });
    expect(workbook.getWorksheet("Ноу-ги")!.getCell("G4").type).toBe(ExcelJS.ValueType.String);
  });

  it("creates discipline sheets with headers when there are no registrations", async () => {
    mocks.entries.mockResolvedValue([entry("Борис", [])]);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(Uint8Array.from(await buildEntriesWorkbook("event", false)).buffer);
    expect(workbook.worksheets.map((sheet) => sheet.rowCount)).toEqual([3, 3, 4, 1]);
  });
});
