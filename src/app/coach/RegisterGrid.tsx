"use client";
import { useRef, useState, useTransition } from "react";
import { registerGroup, type GroupRow, type RowResult } from "@/app/coach-actions";
import { parseXlsx, TEMPLATE_HINT } from "./xlsx-import";

const empty = (): GroupRow => ({ fullName: "", birthDate: "", sex: "M", weight: 0, gi: true, nogi: false });
const isEmpty = (r: GroupRow) => !r.fullName.trim() && !r.birthDate && !r.weight;

export default function RegisterGrid({ eventId }: { eventId: string }) {
  const [rows, setRows] = useState<GroupRow[]>([empty()]);
  const [results, setResults] = useState<RowResult[]>([]);
  const [imported, setImported] = useState<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [pending, start] = useTransition();

  const onImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const parsed = parseXlsx(await file.arrayBuffer());
      setRows((rs) => [...rs.filter((r) => !isEmpty(r)), ...parsed]);
      setImported(parsed.length);
    } catch {
      setImported(-1);
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const upd = (i: number, patch: Partial<GroupRow>) =>
    setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));

  const submit = () =>
    start(async () => {
      const r = await registerGroup(JSON.stringify(rows), eventId);
      setResults(r);
      // оставляем только строки с ошибкой, чтобы тренер исправил
      const failedNames = new Set(r.filter((x) => !x.ok).map((x) => x.name));
      setRows((rs) => rs.filter((row) => failedNames.has(row.fullName)));
      if (r.every((x) => x.ok)) setRows([empty()]);
    });

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="text-sm w-full border">
          <thead className="bg-gray-50">
            <tr>
              <th className="border px-2 py-1 text-left">ФИО</th>
              <th className="border px-2 py-1">Дата рожд.</th>
              <th className="border px-2 py-1">Пол</th>
              <th className="border px-2 py-1">Вес</th>
              <th className="border px-2 py-1">ги</th>
              <th className="border px-2 py-1">ноу-ги</th>
              <th className="border px-2 py-1"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i}>
                <td className="border px-1"><input className="w-44 px-1 py-1" value={row.fullName} onChange={(e) => upd(i, { fullName: e.target.value })} placeholder="Иванов Иван" /></td>
                <td className="border px-1"><input type="date" className="px-1 py-1" value={row.birthDate} onChange={(e) => upd(i, { birthDate: e.target.value })} /></td>
                <td className="border px-1 text-center">
                  <select value={row.sex} onChange={(e) => upd(i, { sex: e.target.value as "M" | "F" })}>
                    <option value="M">М</option><option value="F">Ж</option>
                  </select>
                </td>
                <td className="border px-1"><input type="number" step="0.1" className="w-16 px-1 py-1" value={row.weight || ""} onChange={(e) => upd(i, { weight: Number(e.target.value) })} /></td>
                <td className="border px-1 text-center"><input type="checkbox" checked={row.gi} onChange={(e) => upd(i, { gi: e.target.checked })} /></td>
                <td className="border px-1 text-center"><input type="checkbox" checked={row.nogi} onChange={(e) => upd(i, { nogi: e.target.checked })} /></td>
                <td className="border px-1 text-center"><button onClick={() => setRows((rs) => rs.filter((_, idx) => idx !== i))} className="text-red-500">✕</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button onClick={() => setRows((rs) => [...rs, empty()])} className="rounded border px-3 py-1 text-sm">+ строка</button>
        <button onClick={() => fileRef.current?.click()} className="rounded border px-3 py-1 text-sm">Импорт из Excel</button>
        <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={onImport} />
        <button onClick={submit} disabled={pending} className="rounded bg-blue-600 px-4 py-1 text-white text-sm disabled:opacity-50">
          {pending ? "Отправка…" : "Заявить группу"}
        </button>
      </div>
      <p className="mt-1 text-xs text-gray-400">{TEMPLATE_HINT}</p>
      {imported !== null && (
        <p className={"mt-1 text-xs " + (imported < 0 ? "text-red-600" : "text-green-700")}>
          {imported < 0 ? "Не удалось прочитать файл" : `импортировано ${imported} строк`}
        </p>
      )}
      {results.length > 0 && (
        <ul className="mt-3 text-sm space-y-1">
          {results.map((r, i) => (
            <li key={i} className={r.ok ? "text-green-700" : "text-red-600"}>{r.ok ? "✓" : "✕"} {r.name} — {r.msg}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
