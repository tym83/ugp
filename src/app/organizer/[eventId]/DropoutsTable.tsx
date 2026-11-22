"use client";
import { useMemo, useState } from "react";
import RefundSelect from "./RefundSelect";
import RestoreSelect from "./RestoreSelect";
import type { RefundStatus } from "@/lib/domain/dropoutRefund";

export type DropoutRow = {
  entryId: string;
  kind: "withdrawn" | "deleted";
  athleteId: string | null;
  categoryId: string | null;
  fullName: string;
  birthYear: number | null;
  club: string | null;
  phone: string | null;
  priceTotal: number;
  paymentKind: string | null;
  paid: boolean;
  /** withdrawnAt / deletion time, ISO; null — неизвестно. */
  at: string | null;
  by: string | null;
  reason: string | null;
  refund: RefundStatus;
};

const PAYMENT_LABEL: Record<string, string> = { PAID: "оплатил", LATER: "оплатит позже", FREE: "бесплатно" };

/** Список выбывших: поиск по ФИО/клубу, возврат участника с выбором категории, отметки о возврате денег. */
export default function DropoutsTable({ eventId, showMoney, rows }: { eventId: string; showMoney: boolean; rows: DropoutRow[] }) {
  const [q, setQ] = useState("");
  const needle = q.trim().toLowerCase().replace(/ё/g, "е");
  const visible = useMemo(
    () => (needle ? rows.filter((r) => `${r.fullName} ${r.club ?? ""}`.toLowerCase().replace(/ё/g, "е").includes(needle)) : rows),
    [rows, needle],
  );
  const fmt = (iso: string) =>
    new Date(iso).toLocaleString("ru-RU", { timeZone: "Asia/Yekaterinburg", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

  return (
    <div className="mt-3 overflow-x-auto">
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Найти по ФИО или клубу…"
        className="mb-2 rounded border px-2 py-1 text-sm"
      />
      <table className="w-full text-left text-sm">
        <thead><tr>
          {["Статус", "ФИО", "Год", "Клуб", "Телефон", ...(showMoney ? ["Взнос"] : []), "Оплата", "Когда", "Кто", "Причина", "Вернуть", "Возврат"].map((label) => <th key={label} className="px-3 py-2">{label}</th>)}
        </tr></thead>
        <tbody className="divide-y">{visible.map((row) => (
          <tr key={row.entryId} className="align-top">
            <td className="px-3 py-2">{row.kind === "withdrawn" ? "снят" : "удалён"}</td>
            <td className="px-3 py-2">{row.fullName}</td>
            <td className="px-3 py-2">{row.birthYear ?? "—"}</td>
            <td className="px-3 py-2">{row.club ?? "—"}</td>
            <td className="px-3 py-2">{row.phone ?? "—"}</td>
            {showMoney && <td className="px-3 py-2 whitespace-nowrap">{row.priceTotal} ₽</td>}
            <td className="px-3 py-2">{PAYMENT_LABEL[row.paymentKind ?? (row.paid ? "PAID" : "")] ?? "не оплачено"}</td>
            <td className="px-3 py-2 whitespace-nowrap">{row.at ? fmt(row.at) : "—"}</td>
            <td className="px-3 py-2">{row.by ?? "—"}</td>
            <td className="px-3 py-2">{row.reason ?? "—"}</td>
            <td className="px-3 py-2">
              {row.kind === "withdrawn" && row.athleteId ? (
                <RestoreSelect eventId={eventId} athleteId={row.athleteId} defaultCategoryId={row.categoryId} />
              ) : (
                <span className="text-gray-300">—</span>
              )}
            </td>
            <td className="px-3 py-2"><RefundSelect eventId={eventId} entryId={row.entryId} status={row.refund} /></td>
          </tr>
        ))}
        {visible.length === 0 && <tr><td colSpan={12} className="px-3 py-2 text-gray-400">Никого не нашлось.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}
