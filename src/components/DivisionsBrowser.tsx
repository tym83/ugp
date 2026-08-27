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
    `rounded-full px-3 py-1 text-sm border transition ${active ? "bg-[#e3863d] text-black border-[#e3863d] font-semibold" : "border-white/15 text-[#cec8bc] hover:bg-white/10"}`;

  return (
    <div className="text-[#f4f0e8]">
      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-[#cec8bc]">
        <span><b className="text-[#f4f0e8]">{total}</b> категорий</span>
        <span><b className="text-[#f4f0e8]">{withReg}</b> с заявками</span>
        <span><b className="text-[#f4f0e8]">{athletes}</b> спортсменов</span>
      </div>

      <div className="sticky top-14 z-10 -mx-1 mb-4 flex flex-wrap items-center gap-2 bg-[#0d0b08]/95 px-1 py-2 backdrop-blur">
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
          className="ml-auto w-40 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-sm text-[#f4f0e8] placeholder:text-[#8a8378]"
        />
      </div>

      <div className="space-y-6">
        {groups.map(([label, items]) => (
          <div key={label}>
            <h3 className="mb-2 text-sm font-bold uppercase tracking-[0.2em] text-[#e3863d]">{label}</h3>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {items.map((d) => {
                const clickable = d.count > 0;
                const inner = (
                  <div
                    className={`flex items-center justify-between rounded-lg border p-3 ${
                      clickable ? "border-white/10 bg-white/5 hover:border-[#e3863d]/60" : "border-white/5 bg-white/[0.02] text-[#8a8378]"
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="truncate font-semibold">
                        {d.sex === "M" ? "Муж" : "Жен"} · {disciplineLabel(d.discipline)}
                      </div>
                      <div className="text-sm text-[#cec8bc]">{weightLabel(d)}</div>
                    </div>
                    <span
                      className={`ml-2 shrink-0 rounded-full px-2 py-0.5 text-xs ${
                        d.count === 0
                          ? "bg-white/5 text-[#8a8378]"
                          : d.hasBracket
                            ? "bg-[#e3863d]/20 text-[#e3863d]"
                            : "bg-white/10 text-[#f4f0e8]"
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
        {groups.length === 0 && <p className="text-sm text-[#cec8bc]">Ничего не найдено по фильтрам.</p>}
      </div>
    </div>
  );
}
