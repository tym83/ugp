import { listDropouts } from "@/lib/domain/dropouts";
import RefundSelect from "./RefundSelect";

const PAYMENT_LABEL: Record<string, string> = { PAID: "оплатил", LATER: "оплатит позже", FREE: "бесплатно" };

export default async function DropoutsSection({ eventId, showMoney }: { eventId: string; showMoney: boolean }) {
  const rows = await listDropouts(eventId);
  const total = (status: "TODO" | "DONE") => rows.filter((r) => r.refund === status).reduce((sum, r) => sum + r.priceTotal, 0);
  return (
    <details className="mt-6 rounded border p-3">
      <summary className="cursor-pointer font-semibold">Выбывшие — для возвратов ({rows.length})</summary>
      {showMoney && <p className="my-3 text-sm">к возврату: {total("TODO")} ₽ · возвращено: {total("DONE")} ₽</p>}
      {rows.length === 0 ? <p className="mt-3 text-sm text-gray-500">Выбывших нет.</p> : (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead><tr>
              {["Статус", "ФИО", "Год", "Клуб", "Телефон", ...(showMoney ? ["Взнос"] : []), "Оплата", "Когда", "Кто", "Причина", "Возврат"].map((label) => <th key={label} className="px-3 py-2">{label}</th>)}
            </tr></thead>
            <tbody className="divide-y">{rows.map((row) => (
              <tr key={row.entryId} className="align-top">
                <td className="px-3 py-2">{row.kind === "withdrawn" ? "снят" : "удалён"}</td>
                <td className="px-3 py-2">{row.fullName}</td>
                <td className="px-3 py-2">{row.birthDate?.getUTCFullYear() ?? "—"}</td>
                <td className="px-3 py-2">{row.club ?? "—"}</td>
                <td className="px-3 py-2">{row.phone ?? "—"}</td>
                {showMoney && <td className="px-3 py-2 whitespace-nowrap">{row.priceTotal} ₽</td>}
                <td className="px-3 py-2">{PAYMENT_LABEL[row.paymentKind ?? (row.paid ? "PAID" : "")] ?? "не оплачено"}</td>
                <td className="px-3 py-2 whitespace-nowrap">{row.at?.toLocaleString("ru-RU", { timeZone: "Asia/Yekaterinburg", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) ?? "—"}</td>
                <td className="px-3 py-2">{row.by ?? "—"}</td>
                <td className="px-3 py-2">{row.reason ?? "—"}</td>
                <td className="px-3 py-2"><RefundSelect eventId={eventId} entryId={row.entryId} status={row.refund} /></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </details>
  );
}
