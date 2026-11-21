import ExcelJS from "exceljs";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {
  event: { findUniqueOrThrow: vi.fn().mockResolvedValue({ name: "Турнир" }) },
  eventEntry: { findMany: vi.fn().mockResolvedValue([]) },
} }));
vi.mock("./dropouts", () => ({ listDropouts: vi.fn().mockResolvedValue([{
  entryId: "deleted-entry", kind: "deleted", fullName: "Иван Иванов",
  birthDate: new Date("2000-01-02"), club: "Клуб", phone: "+79990000000",
  priceTotal: 2345, paid: true, paymentKind: "PAID", at: new Date("2026-01-01T10:00:00Z"),
  by: "organizer@example.com", reason: null, refund: "DONE",
}]) }));

import { buildEntriesWorkbook } from "./entriesXlsx";

describe("entries dropout sheet", () => {
  it.each([true, false])("exports the same rows and respects withMoney=%s", async (withMoney) => {
    const buffer = await buildEntriesWorkbook("event", withMoney);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as unknown as Parameters<typeof workbook.xlsx.load>[0]);
    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual(["Участники", "Выбывшие"]);
    const sheet = workbook.getWorksheet("Выбывшие")!;
    const headers = sheet.getRow(1).values;
    const values = sheet.getRow(2).values;
    expect(headers).toContain("Возврат");
    expect(values).toContain("Иван Иванов");
    expect(values).toContain("возвращено");
    expect(values).toContain("+79990000000");
    if (withMoney) {
      expect(headers).toContain("Взнос, ₽");
      expect(values).toContain(2345);
    } else {
      expect(headers).not.toContain("Взнос, ₽");
      expect(values).not.toContain(2345);
    }
  });
});
