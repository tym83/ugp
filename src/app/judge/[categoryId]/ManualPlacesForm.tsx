"use client";

import { useState, useTransition } from "react";
import { setManualPlaces } from "@/app/manual-places-actions";

export default function ManualPlacesForm({ categoryId, athletes }: { categoryId: string; athletes: { id: string; name: string }[] }) {
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();
  return <form action={(data) => startTransition(async () => {
    try {
      await setManualPlaces(categoryId, [1, 2, 3].map((p) => String(data.get(`place${p}`))));
      setMessage("Места сохранены");
    } catch (e) { setMessage(e instanceof Error ? e.message : "Ошибка сохранения"); }
  })} className="my-4 space-y-2">
    {[1, 2, 3].map((p) => <label className="block" key={p}>{p} место
      <select required name={`place${p}`} defaultValue="" className="ml-2 rounded border p-2">
        <option value="" disabled>Выберите участника</option>
        {athletes.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
      </select>
    </label>)}
    <button disabled={pending} className="rounded bg-blue-600 px-3 py-2 text-white">{pending ? "Сохранение…" : "Сохранить места"}</button>
    <p role="status">{message}</p>
  </form>;
}
