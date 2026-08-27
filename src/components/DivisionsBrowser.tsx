"use client";
import { useMemo, useState } from "react";
import Link from "next/link";

export type Division = {
  id: string;
  ageGroupLabel: string;
  ageGroupCode: string;
  order: number;
  sex: "M" | "F";
  discipline: "gi" | "nogi";
  weightMin: number | null;
  weightMax: number | null;
  isOpenTop: boolean;
  isAbsolute: boolean;
  count: number;
  hasBracket: boolean;
};

const weightLabel = (d: Division) =>
  d.isAbsolute ? "абсолютка" : d.isOpenTop ? `+${d.weightMin ?? ""} кг` : `до ${d.weightMax} кг`;

const disciplineLabel = (v: string) => (v === "gi" ? "Ги" : "Ноу-ги");

export default function DivisionsBrowser({ divisions }: { divisions: Division[] }) {
  const [discipline, setDiscipline] = useState<"all" | "gi" | "nogi">("all");
  const [sex, setSex] = useState<"all" | "M" | "F">("all");
  const [onlyReg, setOnlyReg] = useState(false);
  const [q, setQ] = useState("");

  const total = divisions.length;
  const withReg = divisions.filter((d) => d.count > 0).length;
  const athletes = divisions.reduce((s, d) => s + d.count, 0);

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    return divisions.filter((d) => {
      if (discipline !== "all" && d.discipline !== discipline) return false;
      if (sex !== "all" && d.sex !== sex) return false;
      if (onlyReg && d.count === 0) return false;
      if (query) {
        const hay = `${d.ageGroupLabel} ${weightLabel(d)} ${disciplineLabel(d.discipline)}`.toLowerCase();
        if (!hay.includes(query)) return false;
      }
      return true;
    });
  }, [divisions, discipline, sex, onlyReg, q]);

  // группировка по возрастной группе, сохраняя порядок
  const groups = useMemo(() => {
    const map = new Map<string, Division[]>();
    for (const d of [...filtered].sort((a, b) => a.order - b.order || (a.weightMax ?? 1e9) - (b.weightMax ?? 1e9))) {
      const key = d.ageGroupLabel;
      (map.get(key) ?? map.set(key, []).get(key)!).push(d);
    }
    return [...map.entries()];
  }, [filtered]);

  const chip = (active: boolean) =>
    `rounded-full px-3 py-1 text-sm border transition ${active ? "bg-gray-900 text-white border-gray-900" : "bg-white text-gray-700 hover:bg-gray-100"}`;

  return (
    <div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-gray-500 mb-3">
        <span><b className="text-gray-900">{total}</b> категорий</span>
        <span><b className="text-gray-900">{withReg}</b> с заявками</span>
        <span><b className="text-gray-900">{athletes}</b> спортсменов</span>
      </div>

      <div className="sticky top-0 z-10 -mx-1 mb-4 flex flex-wrap items-center gap-2 bg-white/90 px-1 py-2 backdrop-blur">
        <div className="flex gap-1">
          {(["all", "gi", "nogi"] as const).map((v) => (
            <button key={v} onClick={() => setDiscipline(v)} className={chip(discipline === v)}>
              {v === "all" ? "Все" : disciplineLabel(v)}
            </button>
          ))}
        </div>
        <div className="flex gap-1">
          {(["all", "M", "F"] as const).map((v) => (
            <button key={v} onClick={() => setSex(v)} className={chip(sex === v)}>
              {v === "all" ? "М+Ж" : v === "M" ? "Муж" : "Жен"}
            </button>
          ))}
        </div>
        <button onClick={() => setOnlyReg((x) => !x)} className={chip(onlyReg)}>С заявками</button>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="возраст / вес…"
          className="ml-auto w-40 rounded-full border px-3 py-1 text-sm"
        />
      </div>

      <div className="space-y-6">
        {groups.map(([label, items]) => (
          <div key={label}>
            <h3 className="mb-2 text-sm font-bold uppercase tracking-wide text-gray-500">{label}</h3>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {items.map((d) => {
                const clickable = d.count > 0;
                const inner = (
                  <div
                    className={`flex items-center justify-between rounded-lg border p-3 ${
                      clickable ? "bg-white hover:border-gray-900 hover:shadow-sm" : "bg-gray-50 text-gray-400"
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="truncate font-medium">
                        {d.sex === "M" ? "Муж" : "Жен"} · {disciplineLabel(d.discipline)}
                      </div>
                      <div className="text-sm text-gray-500">{weightLabel(d)}</div>
                    </div>
                    <span
                      className={`ml-2 shrink-0 rounded-full px-2 py-0.5 text-xs ${
                        d.count === 0
                          ? "bg-gray-100 text-gray-400"
                          : d.hasBracket
                            ? "bg-green-100 text-green-700"
                            : "bg-blue-100 text-blue-700"
                      }`}
                    >
                      {d.count === 0 ? "нет заявок" : d.hasBracket ? `сетка · ${d.count}` : `${d.count} заявок`}
                    </span>
                  </div>
                );
                return clickable ? (
                  <Link key={d.id} href={`/category/${d.id}`}>{inner}</Link>
                ) : (
                  <div key={d.id}>{inner}</div>
                );
              })}
            </div>
          </div>
        ))}
        {groups.length === 0 && <p className="text-sm text-gray-500">Ничего не найдено по фильтрам.</p>}
      </div>
    </div>
  );
}
