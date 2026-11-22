import { listDropouts } from "@/lib/domain/dropouts";
import DropoutsTable, { type DropoutRow } from "./DropoutsTable";

export default async function DropoutsSection({ eventId, showMoney }: { eventId: string; showMoney: boolean }) {
  const rows = await listDropouts(eventId);
  const total = (status: "TODO" | "DONE") => rows.filter((r) => r.refund === status).reduce((sum, r) => sum + r.priceTotal, 0);
  const tableRows: DropoutRow[] = rows.map((r) => ({
    entryId: r.entryId,
    kind: r.kind,
    athleteId: r.athleteId,
    categoryId: r.categoryId,
    fullName: r.fullName,
    birthYear: r.birthDate?.getUTCFullYear() ?? null,
    club: r.club,
    phone: r.phone,
    priceTotal: r.priceTotal,
    paymentKind: r.paymentKind,
    paid: r.paid,
    at: r.at?.toISOString() ?? null,
    by: r.by,
    reason: r.reason,
    refund: r.refund,
  }));
  return (
    <details className="mt-6 rounded border p-3">
      <summary className="cursor-pointer font-semibold">Выбывшие — для возвратов ({rows.length})</summary>
      {showMoney && <p className="my-3 text-sm">к возврату: {total("TODO")} ₽ · возвращено: {total("DONE")} ₽</p>}
      {rows.length === 0 ? <p className="mt-3 text-sm text-gray-500">Выбывших нет.</p> : (
        <DropoutsTable eventId={eventId} showMoney={showMoney} rows={tableRows} />
      )}
    </details>
  );
}
