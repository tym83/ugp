// Excel list of the event's entries: one row per athlete per category.
import ExcelJS from "exceljs";
import { prisma } from "@/lib/prisma";
import { categoryLabel } from "./snapshot";
import { listDropouts } from "./dropouts";
import { REFUND_LABEL } from "./dropoutRefund";

const PAYMENT_RU: Record<string, string> = { PAID: "оплатил", LATER: "оплатит позже", FREE: "бесплатно" };
const STATUS_RU: Record<string, string> = { ENTERED: "заявлен", ADMITTED: "допущен", OVERWEIGHT: "перевес", WITHDRAWN: "убран" };
const HEAD_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE3863D" } };

function sheetName(label: string, used: Set<string>): string {
  const base = label.replace(/[\\/?*[\]:]/g, " ").replace(/\s+/g, " ").trim().slice(0, 31);
  let name = base;
  for (let i = 2; used.has(name.toLowerCase()); i++) {
    const suffix = ` ${i}`;
    name = `${base.slice(0, 31 - suffix.length)}${suffix}`;
  }
  used.add(name.toLowerCase());
  return name;
}

export async function buildEntriesWorkbook(eventId: string, withMoney: boolean): Promise<Buffer> {
  const event = await prisma.event.findUniqueOrThrow({ where: { id: eventId } });
  const entries = await prisma.eventEntry.findMany({
    where: { eventId },
    include: {
      athlete: { include: { club: true } },
      registrations: { include: { category: true }, orderBy: { category: { order: "asc" } } },
    },
  });
  entries.sort((a, b) => a.athlete.fullName.localeCompare(b.athlete.fullName, "ru"));

  const wb = new ExcelJS.Workbook();
  const exportedAt = new Date().toLocaleString("ru-RU", { timeZone: "Asia/Yekaterinburg" });
  type Category = (typeof entries)[number]["registrations"][number]["category"];
  const active = (status: string) => status === "ENTERED" || status === "ADMITTED";
  const categories = [...new Map(entries.flatMap((e) => e.registrations
    .filter((r) => active(r.status)).map((r) => [r.category.id, r.category] as const))).values()]
    .sort((a, b) => a.order - b.order);
  const used = new Set(["ги", "ноу-ги", "все", "выбывшие"]);
  const categoryNames = new Map(categories.map((c) => [c.id, sheetName(categoryLabel(c), used)]));
  function categoryCell(category: Category): ExcelJS.CellValue {
    const text = categoryLabel(category);
    const name = categoryNames.get(category.id);
    return name ? { text, hyperlink: `#'${name.replace(/'/g, "''")}'!A1` } : text;
  }
  function writeEntriesSheet(name: string, title: string, discipline?: "gi" | "nogi", category?: Category) {
    const ws = wb.addWorksheet(name, { views: [{ state: "frozen", ySplit: 3 }] });
    ws.getCell("A1").value = category ? title : `${event.name} — ${title} (выгружено ${exportedAt})`;
    ws.getCell("A1").font = { bold: true, size: 14 };

    const cols: { header: string; width: number }[] = [
      { header: "№", width: 5 },
      { header: "ФИО", width: 36 },
      { header: "Дата рождения", width: 14 },
      ...(!category ? [{ header: "Пол", width: 6 }] : []),
      { header: "Клуб", width: 30 },
      { header: "Телефон", width: 16 },
      ...(!category ? [{ header: "Категория", width: 52 }] : []),
      { header: "Заявленный вес, кг", width: 12 },
      { header: "Фактический вес, кг", width: 12 },
      { header: "Статус", width: 12 },
      ...(withMoney ? [{ header: "Взнос, ₽", width: 10 }] : []),
      { header: "Оплата", width: 16 },
    ];
    cols.forEach((c, i) => (ws.getColumn(i + 1).width = c.width));
    const head = ws.getRow(3);
    head.values = cols.map((c) => c.header);
    head.eachCell((c) => {
      c.font = { bold: true };
      c.fill = HEAD_FILL;
    });

    let n = 0;
    for (const e of entries) {
      const registrations = category
        ? e.registrations.filter((r) => r.category.id === category.id && active(r.status))
        : discipline
        ? e.registrations.filter((r) => r.category.discipline === discipline)
        : e.registrations;
      if ((discipline || category) && registrations.length === 0) continue;
      n++;
      const a = e.athlete;
      const payment = PAYMENT_RU[e.paymentKind ?? (e.paid ? "PAID" : "")] ?? "не оплачено";
      const regs = registrations.length ? registrations : [null];
      regs.forEach((r, i) => {
        ws.addRow([
          i === 0 ? n : null,
          a.fullName,
          a.birthDate.toLocaleDateString("ru-RU", { timeZone: "UTC" }),
          ...(!category ? [a.sex === "M" ? "м" : "ж"] : []),
          a.club?.name ?? "",
          a.phone ?? "",
          ...(!category ? [r ? categoryCell(r.category) : "—"] : []),
          r?.declaredWeight ?? null,
          r?.actualWeight ?? null,
          r ? STATUS_RU[r.status] ?? r.status : "",
          ...(withMoney ? [i === 0 ? e.priceTotal : null] : []),
          payment,
        ]);
      });
    }
    ws.autoFilter = { from: { row: 3, column: 1 }, to: { row: 3, column: cols.length } };
  }
  writeEntriesSheet("Ги", "ги", "gi");
  writeEntriesSheet("Ноу-ги", "ноу-ги", "nogi");
  writeEntriesSheet("Все", "участники");
  for (const category of categories) {
    const label = categoryLabel(category);
    writeEntriesSheet(categoryNames.get(category.id)!,
      category.matNumber ? `${label} · ковёр ${category.matNumber}` : label, undefined, category);
  }
  const dropouts = await listDropouts(eventId);
  const ds = wb.addWorksheet("Выбывшие", { views: [{ state: "frozen", ySplit: 1 }] });
  const dropoutHeaders = ["Заявка", "Статус", "ФИО", "Дата рождения", "Клуб", "Телефон", ...(withMoney ? ["Взнос, ₽"] : []), "Оплата", "Когда", "Кто", "Причина", "Возврат"];
  ds.addRow(dropoutHeaders).eachCell((cell) => { cell.font = { bold: true }; cell.fill = HEAD_FILL; });
  dropoutHeaders.forEach((label, index) => { ds.getColumn(index + 1).width = label === "ФИО" || label === "Причина" ? 36 : 24; });
  for (const row of dropouts) {
    ds.addRow([
      row.entryId, row.kind === "withdrawn" ? "снят" : "удалён", row.fullName,
      row.birthDate?.toLocaleDateString("ru-RU", { timeZone: "UTC" }) ?? "",
      row.club ?? "", row.phone ?? "", ...(withMoney ? [row.priceTotal] : []),
      PAYMENT_RU[row.paymentKind ?? (row.paid ? "PAID" : "")] ?? "не оплачено",
      row.at?.toLocaleString("ru-RU", { timeZone: "Asia/Yekaterinburg" }) ?? "",
      row.by ?? "", row.reason ?? "", REFUND_LABEL[row.refund],
    ]);
  }
  ds.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: dropoutHeaders.length } };
  return Buffer.from(await wb.xlsx.writeBuffer());
}
