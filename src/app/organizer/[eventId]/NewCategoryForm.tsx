"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createManualCategory } from "@/app/roster-actions";

type Opt = { id: string; label: string };

/** Ручная категория по образцу существующей: возраст/пол/дисциплина/уровень берутся из образца. */
export default function NewCategoryForm({ eventPath, options }: { eventPath: string; options: Opt[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [base, setBase] = useState(options[0]?.id ?? "");
  const [label, setLabel] = useState("");
  const [min, setMin] = useState("");
  const [max, setMax] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const num = (s: string) => (s.trim() ? Number(s.replace(",", ".")) : null);

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="rounded bg-emerald-700 px-3 py-1.5 text-sm font-semibold text-white">
        + Создать категорию вручную
      </button>
    );
  }
  return (
    <form
      className="flex flex-wrap items-end gap-2 rounded border p-3"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await createManualCategory(base, { label, weightMin: num(min), weightMax: num(max) });
          setMsg({ ok: r.ok, text: r.msg });
          if (r.ok && r.id) router.push(`/organizer/${eventPath}/bracket/${r.id}`);
        });
      }}
    >
      <label className="text-xs">
        Образец (возраст, пол, дисциплина, уровень)
        <select value={base} onChange={(e) => setBase(e.target.value)} className="block max-w-[22rem] rounded border px-2 py-1 text-sm">
          {options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
        </select>
      </label>
      <label className="text-xs">
        Название группы
        <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="как у образца" className="block w-48 rounded border px-2 py-1 text-sm" />
      </label>
      <label className="text-xs">
        Вес свыше, кг
        <input value={min} onChange={(e) => setMin(e.target.value)} inputMode="decimal" className="block w-20 rounded border px-2 py-1 text-sm" />
      </label>
      <label className="text-xs">
        Вес до, кг
        <input value={max} onChange={(e) => setMax(e.target.value)} inputMode="decimal" placeholder="пусто — без верха" className="block w-28 rounded border px-2 py-1 text-sm" />
      </label>
      <button disabled={pending} className="rounded bg-emerald-700 px-3 py-1.5 text-sm text-white disabled:opacity-50">Создать</button>
      <button type="button" onClick={() => setOpen(false)} className="text-sm text-gray-500">отмена</button>
      {msg && <span className={`text-sm ${msg.ok ? "text-green-700" : "text-red-600"}`}>{msg.text}</span>}
    </form>
  );
}
