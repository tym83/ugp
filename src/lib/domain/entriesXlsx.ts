// Excel list of the event's entries: one row per athlete per category.
import ExcelJS from "exceljs";
import { prisma } from "@/lib/prisma";
import { categoryLabel } from "./snapshot";

const PAYMENT_RU: Record<string, string> = { PAID: "оплатил", LATER: "оплатит позже", FREE: "бесплатно" };
const STATUS_RU: Record<string, string> = { ENTERED: "заявлен", ADMITTED: "допущен", OVERWEIGHT: "перевес", WITHDRAWN: "убран" };
const HEAD_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE3863D" } };

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
  const ws = wb.addWorksheet("Участники", { views: [{ state: "frozen", ySplit: 3 }] });
  ws.getCell("A1").value = `${event.name} — участники (выгружено ${new Date().toLocaleString("ru-RU", { timeZone: "Asia/Yekaterinburg" })})`;
  ws.getCell("A1").font = { bold: true, size: 14 };

  const cols: { header: string; width: number }[] = [
    { header: "№", width: 5 },
    { header: "ФИО", width: 36 },
    { header: "Дата рождения", width: 14 },
    { header: "Пол", width: 6 },
    { header: "Клуб", width: 30 },
    { header: "Телефон", width: 16 },
    { header: "Категория", width: 52 },
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
    n++;
    const a = e.athlete;
    const payment = PAYMENT_RU[e.paymentKind ?? (e.paid ? "PAID" : "")] ?? "не оплачено";
    const regs = e.registrations.length ? e.registrations : [null];
    regs.forEach((r, i) => {
      ws.addRow([
        i === 0 ? n : null,
        a.fullName,
        a.birthDate.toLocaleDateString("ru-RU", { timeZone: "UTC" }),
        a.sex === "M" ? "м" : "ж",
        a.club?.name ?? "",
        a.phone ?? "",
        r ? categoryLabel(r.category) : "—",
        r?.declaredWeight ?? null,
        r?.actualWeight ?? null,
        r ? STATUS_RU[r.status] ?? r.status : "",
        ...(withMoney ? [i === 0 ? e.priceTotal : null] : []),
        payment,
      ]);
    });
  }
  ws.autoFilter = { from: { row: 3, column: 1 }, to: { row: 3, column: cols.length } };
  return Buffer.from(await wb.xlsx.writeBuffer());
}
