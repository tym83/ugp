"use client";
import { useState, useTransition } from "react";
import { moveRegistration, categoryOptions } from "@/app/participant-actions";

type Opt = { id: string; label: string };

// Client-side cache of the event's category options: fetched once via the server action,
// shared by all rows of the page so the second «сменить» click renders instantly.
const optionsCache = new Map<string, Opt[]>();

/** Move one registration to another category: plain label + «сменить» by default, select with autosave on click. */
export default function MoveRegistration({ regId, currentCatId, currentLabel, eventId }: { regId: string; currentCatId: string; currentLabel: string; eventId: string }) {
  const [editing, setEditing] = useState(false);
  const [options, setOptions] = useState<Opt[] | null>(() => optionsCache.get(eventId) ?? null);
  const [loadError, setLoadError] = useState(false);
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

  const open = () => {
    const cached = optionsCache.get(eventId);
    if (cached) {
      setOptions(cached);
      setEditing(true);
      return;
    }
    start(async () => {
      try {
        const loaded = await categoryOptions(eventId);
        optionsCache.set(eventId, loaded);
        setOptions(loaded);
        setLoadError(false);
        setEditing(true);
      } catch {
        setLoadError(true);
      }
    });
  };

  if (!editing) {
    return (
      <span className="inline-flex items-center gap-1">
        <span>{currentLabel}</span>
        {loadError && <span className="text-xs text-red-500">не удалось загрузить категории</span>}
        <button type="button" onClick={open} disabled={pending} className="text-xs text-blue-600 disabled:opacity-50">
          {pending ? "…" : "сменить"}
        </button>
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1">
      <select
        value={val}
        disabled={pending}
        onChange={(e) => onChange(e.target.value)}
        className="max-w-[240px] rounded border px-1 py-0.5 text-xs disabled:opacity-50"
      >
        {(options ?? []).map((o) => (
          <option key={o.id} value={o.id}>{o.label}</option>
        ))}
      </select>
      <button type="button" onClick={() => setEditing(false)} className="text-xs text-blue-600">отмена</button>
      {pending && <span className="text-xs text-gray-400">…</span>}
      {msg && <span className="text-xs text-gray-500">{msg}</span>}
    </span>
  );
}
