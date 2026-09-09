"use client";
import { Fragment, useMemo, useRef, useState, useTransition } from "react";
import { registerGroup, type GroupRow, type RowResult } from "@/app/coach-actions";
import { parseXlsx, TEMPLATE_HINT } from "./xlsx-import";
import { allowedCategories, suggestedCategories, type SelectableCat } from "@/lib/domain/eligibility";

type CatDTO = SelectableCat & { label: string };

const empty = (): GroupRow => ({ fullName: "", birthDate: "", sex: "M", weight: 0, categoryIds: [] });
const isEmpty = (r: GroupRow) => !r.fullName.trim() && !r.birthDate && !r.weight;

export default function RegisterGrid({ eventId, categories }: { eventId: string; categories: CatDTO[] }) {
  const [rows, setRows] = useState<GroupRow[]>([empty()]);
  const [results, setResults] = useState<RowResult[]>([]);
  const [imported, setImported] = useState<number | null>(null);
  const [openRow, setOpenRow] = useState<number | null>(null);
  const [showAll, setShowAll] = useState<Record<number, boolean>>({});
  const fileRef = useRef<HTMLInputElement>(null);
  const [pending, start] = useTransition();

  const labelById = useMemo(() => new Map(categories.map((c) => [c.id, c.label])), [categories]);

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

  // Категории, доступные строке: по полу+ДР (+вес-окно), с переключателем «все веса».
  const catsForRow = (row: GroupRow, i: number): CatDTO[] => {
    if (!row.birthDate) return [];
    const birthYear = new Date(row.birthDate).getFullYear();
    if (Number.isNaN(birthYear)) return [];
    const a = { sex: row.sex, birthYear, weight: row.weight ? Number(row.weight) : null };
    const base = showAll[i] ? allowedCategories(a, categories) : suggestedCategories(a, categories);
    const ids = new Set(base.map((c) => c.id));
    return categories.filter((c) => ids.has(c.id));
  };

  const toggleCat = (i: number, catId: string) =>
    setRows((rs) =>
      rs.map((r, idx) => {
        if (idx !== i) return r;
        const has = r.categoryIds.includes(catId);
        return { ...r, categoryIds: has ? r.categoryIds.filter((x) => x !== catId) : [...r.categoryIds, catId] };
      }),
    );

  const submit = () =>
    start(async () => {
      const r = await registerGroup(JSON.stringify(rows), eventId);
      setResults(r);
      const failedNames = new Set(r.filter((x) => !x.ok).map((x) => x.name));
      setRows((rs) => rs.filter((row) => failedNames.has(row.fullName)));
      if (r.every((x) => x.ok)) setRows([empty()]);
      setOpenRow(null);
    });

  const canSubmit = rows.some((r) => r.fullName.trim() && r.categoryIds.length > 0);

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
              <th className="border px-2 py-1 text-left">Категории</th>
              <th className="border px-2 py-1"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => {
              const rowCats = catsForRow(row, i);
              const open = openRow === i;
              return (
                <Fragment key={i}>
                  <tr>
                    <td className="border px-1"><input className="w-44 px-1 py-1" value={row.fullName} onChange={(e) => upd(i, { fullName: e.target.value })} placeholder="Иванов Иван" /></td>
                    <td className="border px-1"><input type="date" className="px-1 py-1" value={row.birthDate} onChange={(e) => upd(i, { birthDate: e.target.value })} /></td>
                    <td className="border px-1 text-center">
                      <select value={row.sex} onChange={(e) => upd(i, { sex: e.target.value as "M" | "F" })}>
                        <option value="M">М</option><option value="F">Ж</option>
                      </select>
                    </td>
                    <td className="border px-1"><input type="number" step="0.1" className="w-16 px-1 py-1" value={row.weight || ""} onChange={(e) => upd(i, { weight: Number(e.target.value) })} /></td>
                    <td className="border px-1">
                      <button type="button" onClick={() => setOpenRow(open ? null : i)} disabled={!row.birthDate}
                        className="rounded border px-2 py-1 text-xs disabled:opacity-40">
                        {row.categoryIds.length ? `выбрано ${row.categoryIds.length}` : row.birthDate ? "выбрать →" : "укажите дату"}
                      </button>
                      {row.categoryIds.length > 0 && (
                        <div className="mt-1 text-[11px] text-gray-500 max-w-[220px]">
                          {row.categoryIds.map((id) => labelById.get(id) ?? "?").join("; ")}
                        </div>
                      )}
                    </td>
                    <td className="border px-1 text-center"><button onClick={() => setRows((rs) => rs.filter((_, idx) => idx !== i))} className="text-red-500">✕</button></td>
                  </tr>
                  {open && (
                    <tr>
                      <td colSpan={6} className="border bg-gray-50 px-3 py-2">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-semibold text-gray-600">Категории для «{row.fullName || "спортсмена"}» — отметьте нужные (можно несколько, есть абсолютка)</span>
                          <button type="button" className="text-xs text-blue-600" onClick={() => setShowAll((s) => ({ ...s, [i]: !s[i] }))}>
                            {showAll[i] ? "← по весу" : "показать все веса →"}
                          </button>
                        </div>
                        {rowCats.length === 0 ? (
                          <p className="text-xs text-gray-400">Нет подходящих категорий. Проверьте дату/пол или «показать все веса».</p>
                        ) : (
                          <div className="grid gap-x-4 gap-y-1 sm:grid-cols-2 max-h-56 overflow-y-auto">
                            {rowCats.map((c) => (
                              <label key={c.id} className="flex items-center gap-2 text-xs">
                                <input type="checkbox" checked={row.categoryIds.includes(c.id)} onChange={() => toggleCat(i, c.id)} />
                                {c.label}
                              </label>
                            ))}
                          </div>
                        )}
                        <div className="mt-2 text-right">
                          <button type="button" className="rounded bg-gray-700 px-3 py-1 text-xs text-white" onClick={() => setOpenRow(null)}>Готово</button>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button onClick={() => setRows((rs) => [...rs, empty()])} className="rounded border px-3 py-1 text-sm">+ строка</button>
        <button onClick={() => fileRef.current?.click()} className="rounded border px-3 py-1 text-sm">Импорт из Excel</button>
        <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={onImport} />
        <button onClick={submit} disabled={pending || !canSubmit} className="rounded bg-blue-600 px-4 py-1 text-white text-sm disabled:opacity-50">
          {pending ? "Отправка…" : "Заявить группу"}
        </button>
      </div>
      <p className="mt-1 text-xs text-gray-400">{TEMPLATE_HINT}</p>
      {imported !== null && (
        <p className={"mt-1 text-xs " + (imported < 0 ? "text-red-600" : "text-green-700")}>
          {imported < 0 ? "Не удалось прочитать файл" : `импортировано ${imported} строк — теперь отметьте категории у каждого`}
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
