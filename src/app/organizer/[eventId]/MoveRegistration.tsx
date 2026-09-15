"use client";
import { useState, useTransition } from "react";
import { moveRegistration } from "@/app/participant-actions";

type Opt = { id: string; label: string };

/** Перенос одной регистрации в другую категорию (селект + автосохранение). */
export default function MoveRegistration({ regId, currentCatId, options }: { regId: string; currentCatId: string; options: Opt[] }) {
  const [val, setVal] = useState(currentCatId);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const onChange = (next: string) => {
    if (next === val) return;
    setVal(next);
    start(async () => {
      const r = await moveRegistration(regId, next);
      setMsg(r.ok ? "✓" : r.msg);
      if (!r.ok) setVal(currentCatId);
    });
  };

  return (
    <span className="inline-flex items-center gap-1">
      <select
        value={val}
        disabled={pending}
        onChange={(e) => onChange(e.target.value)}
        className="max-w-[240px] rounded border px-1 py-0.5 text-xs disabled:opacity-50"
      >
        {options.map((o) => (
          <option key={o.id} value={o.id}>{o.label}</option>
        ))}
      </select>
      {pending && <span className="text-xs text-gray-400">…</span>}
      {msg && <span className="text-xs text-gray-500">{msg}</span>}
    </span>
  );
}
