"use client";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addAthleteToCategory } from "@/app/roster-actions";
import { categoryOptions } from "@/app/participant-actions";

type Opt = { id: string; label: string };

// Client-side cache of the event's category options, shared by all rows (see MoveRegistration).
const optionsCache = new Map<string, Opt[]>();

/** Вернуть выбывшего участника: выбрать категорию и одной кнопкой вернуть его туда
 *  (снятая регистрация в этой категории оживает; в новой категории создаётся допущенной). */
export default function RestoreSelect({ eventId, athleteId, defaultCategoryId }: { eventId: string; athleteId: string; defaultCategoryId?: string | null }) {
  const router = useRouter();
  const [options, setOptions] = useState<Opt[] | null>(() => optionsCache.get(eventId) ?? null);
  const [catId, setCatId] = useState(defaultCategoryId ?? "");
  const [loadError, setLoadError] = useState(false);
  const [confirmText, setConfirmText] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    if (optionsCache.has(eventId)) return;
    let stale = false;
    categoryOptions(eventId)
      .then((loaded) => {
        if (stale) return;
        optionsCache.set(eventId, loaded);
        setOptions(loaded);
      })
      .catch(() => !stale && setLoadError(true));
    return () => {
      stale = true;
    };
  }, [eventId]);

  const run = (force: boolean) =>
    start(async () => {
      try {
        const r = await addAthleteToCategory(catId, athleteId, null, force);
        if (r.needsConfirm) {
          setConfirmText(r.msg);
          return;
        }
        setConfirmText(null);
        setMsg({ ok: r.ok, text: r.msg });
        if (r.ok) router.refresh();
      } catch (e) {
        setMsg({ ok: false, text: (e as Error).message });
      }
    });

  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      <select
        value={catId}
        onChange={(e) => setCatId(e.target.value)}
        disabled={pending || !options}
        className="max-w-[240px] rounded border px-1 py-0.5 text-xs disabled:opacity-50"
      >
        {!options && <option value="">загрузка категорий…</option>}
        {loadError && <option value="">не удалось загрузить категории</option>}
        {(options ?? []).map((o) => (
          <option key={o.id} value={o.id}>{o.label}</option>
        ))}
      </select>
      <button
        type="button"
        disabled={pending || !catId}
        onClick={() => run(false)}
        className="rounded bg-emerald-700 px-2 py-0.5 text-xs text-white disabled:opacity-50"
      >
        {pending ? "…" : "вернуть"}
      </button>
      {msg && <span className={`text-xs ${msg.ok ? "text-green-700" : "text-red-600"}`}>{msg.text}</span>}
      {confirmText && (
        <span className="flex w-full items-center gap-2 rounded bg-amber-50 px-2 py-1 text-xs text-amber-800">
          <span>{confirmText}</span>
          <button type="button" disabled={pending} onClick={() => run(true)} className="rounded bg-amber-600 px-2 py-0.5 text-white disabled:opacity-50">
            Да, добавить
          </button>
          <button type="button" disabled={pending} onClick={() => setConfirmText(null)} className="text-gray-500">
            Отмена
          </button>
        </span>
      )}
    </span>
  );
}
