"use client";
import { useEffect, useState, useTransition } from "react";
import { resolveWeighIn, weighInAndAdmit, weighInCategoryOptions, type WeighInCategory, type WeighInResult } from "@/app/organizer-actions";

// Keep the result visible when revalidation removes the athlete from the queue.
export function WeighInNotice() {
  const [message, setMessage] = useState<string | null>(null);
  useEffect(() => {
    const receive = (event: Event) => setMessage((event as CustomEvent<string>).detail);
    window.addEventListener("weighin-result", receive);
    return () => window.removeEventListener("weighin-result", receive);
  }, []);
  return message ? <p role="status" className="rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{message}</p> : null;
}

export default function WeighInForm({ registrationId, declared }: { registrationId: string; declared: number | null }) {
  const [weight, setWeight] = useState(declared != null ? String(declared) : "");
  const [result, setResult] = useState<WeighInResult | null>(null);
  const [decision, setDecision] = useState<WeighInResult | null>(null);
  const [options, setOptions] = useState<WeighInCategory[] | null>(null);
  const [targetId, setTargetId] = useState("");
  const [pending, start] = useTransition();

  const showResult = (res: WeighInResult) => {
    setResult(res);
    if (res.ok) window.dispatchEvent(new CustomEvent("weighin-result", { detail: res.msg }));
  };
  const resolve = (choice: "KEEP" | "MOVE" | "WITHDRAW", target?: string) => {
    start(async () => {
      try {
        const res = await resolveWeighIn(registrationId, choice, target);
        showResult(res);
        if (res.ok) setDecision(null);
      } catch {
        setResult({ ok: false, status: "ERROR", msg: "Не удалось сохранить решение. Попробуйте ещё раз." });
      }
    });
  };
  const moveTarget = options?.find((o) => o.categoryId === targetId) ?? decision?.suggestion;

  return (
    <form className="flex flex-wrap items-center gap-2" onSubmit={(e) => {
      e.preventDefault();
      const w = Number(weight);
      if (!Number.isFinite(w) || w <= 0) {
        setResult({ ok: false, status: "ERROR", msg: "Неверный вес" });
        return;
      }
      start(async () => {
        try {
          const res = await weighInAndAdmit(registrationId, w);
          showResult(res);
          setDecision(res.status === "NEEDS_DECISION" ? res : null);
          setOptions(null);
          setTargetId("");
        } catch {
          setResult({ ok: false, status: "ERROR", msg: "Не удалось сохранить вес. Попробуйте ещё раз." });
        }
      });
    }}>
      <input type="number" step="0.1" value={weight} disabled={pending}
        onChange={(e) => { setWeight(e.target.value); setDecision(null); setResult(null); }}
        aria-label="Фактический вес, кг" placeholder="кг" className="w-16 rounded border px-1 py-0.5 text-sm" />
      <button disabled={pending} className="rounded bg-blue-600 px-2 py-0.5 text-xs text-white disabled:opacity-50">
        {pending ? "…" : "допустить"}
      </button>
      {result && <span role="status" className={`text-xs ${result.status === "NEEDS_DECISION" ? "text-amber-700" : result.ok ? "text-green-600" : "text-red-600"}`}>{result.msg}</span>}
      {decision && <div className="flex w-full flex-wrap items-center gap-2 text-xs">
        <button type="button" disabled={pending} onClick={() => resolve("KEEP")} className="rounded border px-2 py-1 disabled:opacity-50">Оставить в своей категории</button>
        {moveTarget && <button type="button" disabled={pending} onClick={() => resolve("MOVE", moveTarget.categoryId)} className="rounded border px-2 py-1 disabled:opacity-50">Перевести в «{moveTarget.label}»</button>}
        {options === null ? <button type="button" disabled={pending} className="text-blue-600 disabled:opacity-50" onClick={() => {
          start(async () => {
            try { setOptions(await weighInCategoryOptions(registrationId)); }
            catch { setResult({ ok: false, status: "ERROR", msg: "Не удалось загрузить категории. Попробуйте ещё раз." }); }
          });
        }}>другая категория…</button> : <select aria-label="Другая категория" disabled={pending} value={targetId} onChange={(e) => setTargetId(e.target.value)} className="max-w-64 rounded border p-1">
          <option value="">другая категория…</option>
          {options.map((o) => <option key={o.categoryId} value={o.categoryId}>{o.label}</option>)}
        </select>}
        <button type="button" disabled={pending} onClick={() => resolve("WITHDRAW")} className="rounded border border-red-300 px-2 py-1 text-red-700 disabled:opacity-50">Снять с категории</button>
      </div>}
    </form>
  );
}
