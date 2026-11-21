"use client";
import { useTransition, useState } from "react";
import { applyMerge, setWeighInLock, setEntryPayment, deleteEntry, withdrawEntry, restoreEntry, setCategoryMat, type PaymentKind } from "@/app/organizer-actions";

export function MergeButton({ sourceId, targetId, targetLabel }: { sourceId: string; targetId: string; targetLabel: string }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <span className="inline-flex items-center gap-2">
      <button
        disabled={pending}
        onClick={() => start(async () => setMsg((await applyMerge(sourceId, targetId)).msg))}
        className="rounded bg-amber-600 px-2 py-0.5 text-xs text-white disabled:opacity-50"
      >
        {pending ? "…" : `объединить → ${targetLabel}`}
      </button>
      {msg && <span className="text-xs text-gray-500">{msg}</span>}
    </span>
  );
}

const PAYMENT_OPTIONS: { value: PaymentKind | ""; label: string }[] = [
  { value: "", label: "не оплачено" },
  { value: "PAID", label: "оплатил" },
  { value: "LATER", label: "оплатит позже" },
  { value: "FREE", label: "бесплатно" },
];

// Любой вариант, кроме «не оплачено», публично показывается как «оплачено».
export function PaymentSelect({ entryId, kind }: { entryId: string; kind: PaymentKind | null }) {
  const [pending, start] = useTransition();
  const [state, setState] = useState<PaymentKind | "">(kind ?? "");
  return (
    <select
      disabled={pending}
      value={state}
      onChange={(ev) => {
        const next = ev.target.value as PaymentKind | "";
        start(async () => {
          const r = await setEntryPayment(entryId, next || null);
          if (r.ok) setState(next);
        });
      }}
      className={
        "rounded border px-1 py-0.5 text-xs font-semibold disabled:opacity-50 " +
        (state === "PAID" ? "bg-green-100 text-green-800" : state === "" ? "bg-amber-200 text-amber-900" : "bg-sky-100 text-sky-900")
      }
    >
      {PAYMENT_OPTIONS.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}

// Подтверждение вторым нажатием, без браузерного confirm.
export function DeleteEntryButton({ entryId, paid }: { entryId: string; paid: boolean }) {
  const [pending, start] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  if (msg) return <span className="text-xs text-gray-500">{msg}</span>;
  if (!confirming)
    return (
      <button onClick={() => setConfirming(true)} className="text-xs text-red-600">
        удалить
      </button>
    );
  return (
    <span className="inline-flex flex-col gap-1 text-xs">
      <span className="text-red-700">{paid ? "Заявка отмечена оплаченной. Удалить?" : "Удалить заявку?"}</span>
      <span className="inline-flex gap-2">
        <button
          disabled={pending}
          onClick={() => start(async () => setMsg((await deleteEntry(entryId)).msg))}
          className="rounded bg-red-600 px-2 py-0.5 text-white disabled:opacity-50"
        >
          {pending ? "…" : "да"}
        </button>
        <button disabled={pending} onClick={() => setConfirming(false)} className="text-gray-500">
          нет
        </button>
      </span>
    </span>
  );
}

export function LockButton({ eventId, locked }: { eventId: string; locked: boolean }) {
  const [pending, start] = useTransition();
  const [state, setState] = useState(locked);
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <span className="inline-flex items-center gap-2">
      <button
        disabled={pending}
        onClick={() => start(async () => {
          const r = await setWeighInLock(eventId, !state);
          setMsg(r.msg);
          if (r.ok) setState(!state);
        })}
        className={`rounded px-3 py-1 text-sm text-white disabled:opacity-50 ${state ? "bg-gray-600" : "bg-red-600"}`}
      >
        {state ? "Взвешивание закрыто" : "Закрыть взвешивание · старт"}
      </button>
      {msg && <span className="text-xs text-gray-500">{msg}</span>}
    </span>
  );
}

/** Ковёр категории: выбирается до или после сборки сетки, применяется ко всем её схваткам. */
export function MatSelect({ categoryId, mat, matsCount }: { categoryId: string; mat: number | null; matsCount: number }) {
  const [pending, start] = useTransition();
  const [value, setValue] = useState(mat ?? 0);
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <span className="inline-flex items-center gap-1">
      <select
        value={value}
        disabled={pending}
        onChange={(e) => {
          const n = Number(e.target.value);
          setValue(n);
          start(async () => {
            const r = await setCategoryMat(categoryId, n || null);
            setMsg(r.ok ? null : r.msg);
          });
        }}
        className={`rounded border px-2 py-1 text-xs ${value ? "border-amber-500 bg-amber-50 font-semibold" : ""}`}
      >
        <option value={0}>ковёр —</option>
        {Array.from({ length: matsCount }, (_, i) => i + 1).map((n) => (
          <option key={n} value={n}>ковёр {n}</option>
        ))}
      </select>
      {msg && <span className="text-xs text-red-600">{msg}</span>}
    </span>
  );
}

export function EntryWithdrawalButton({ entryId, withdrawn }: { entryId: string; withdrawn: boolean }) {
  const [pending, start] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const submit = () => start(async () => {
    try {
      const result = await (withdrawn ? restoreEntry(entryId) : withdrawEntry(entryId));
      setMsg(result.msg);
      setConfirming(false);
    } catch {
      setMsg("Не удалось изменить заявку. Попробуйте ещё раз.");
    }
  });
  return (
    <span className="inline-flex flex-col gap-1 text-xs">
      {confirming && !withdrawn ? <>
        <span>Снять участника с турнира?</span>
        <span className="inline-flex gap-2">
          <button disabled={pending} onClick={submit} className="rounded bg-gray-600 px-2 py-0.5 text-white disabled:opacity-50">{pending ? "…" : "да"}</button>
          <button disabled={pending} onClick={() => setConfirming(false)} className="text-gray-500">нет</button>
        </span>
      </> : (
        <button disabled={pending} onClick={withdrawn ? submit : () => { setMsg(null); setConfirming(true); }} className="text-gray-600 disabled:opacity-50">
          {pending ? "…" : withdrawn ? "вернуть" : "снять с турнира"}
        </button>
      )}
      {msg && <span role="status" className="text-gray-500">{msg}</span>}
    </span>
  );
}
