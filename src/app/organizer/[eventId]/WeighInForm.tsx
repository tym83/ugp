"use client";
import { useState, useTransition } from "react";
import { weighInAndAdmit } from "@/app/organizer-actions";

export default function WeighInForm({ registrationId, declared }: { registrationId: string; declared: number | null }) {
  const [weight, setWeight] = useState(declared != null ? String(declared) : "");
  const [msg, setMsg] = useState<string | null>(null);
  const [ok, setOk] = useState(true);
  const [pending, start] = useTransition();

  return (
    <form
      className="flex items-center gap-1"
      onSubmit={(e) => {
        e.preventDefault();
        const w = Number(weight);
        if (!Number.isFinite(w) || w <= 0) {
          setOk(false);
          setMsg("Неверный вес");
          return;
        }
        start(async () => {
          const res = await weighInAndAdmit(registrationId, w);
          setOk(res.ok);
          setMsg(res.msg);
        });
      }}
    >
      <input
        type="number"
        step="0.1"
        value={weight}
        onChange={(e) => setWeight(e.target.value)}
        placeholder="кг"
        className="w-16 rounded border px-1 py-0.5 text-sm"
      />
      <button disabled={pending} className="rounded bg-blue-600 px-2 py-0.5 text-xs text-white disabled:opacity-50">
        {pending ? "…" : "допустить"}
      </button>
      {msg && <span className={`text-xs ${ok ? "text-green-600" : "text-red-600"}`}>{msg}</span>}
    </form>
  );
}
