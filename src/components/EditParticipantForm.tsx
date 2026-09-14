"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { updateAthlete, type EditResult } from "@/app/participant-actions";

type Data = {
  id: string;
  fullName: string;
  phone: string;
  city: string;
  club: string;
  belt: string;
  birthDate: string; // YYYY-MM-DD
  sex: "M" | "F";
};

const BELTS = ["", "белый", "серый", "жёлтый", "оранжевый", "зелёный", "синий", "фиолетовый", "коричневый", "чёрный"];

export default function EditParticipantForm({ data, canSeePhone, next }: { data: Data; canSeePhone: boolean; next: string }) {
  const [f, setF] = useState<Data>(data);
  const [res, setRes] = useState<EditResult | null>(null);
  const [pending, start] = useTransition();

  const submit = (formData: FormData) => start(async () => setRes(await updateAthlete(formData)));
  const upd = (patch: Partial<Data>) => setF((p) => ({ ...p, ...patch }));

  return (
    <form action={submit} className="space-y-4">
      <input type="hidden" name="athleteId" value={f.id} />

      <label className="block">
        <span className="text-sm text-gray-600">ФИО</span>
        <input name="fullName" value={f.fullName} onChange={(e) => upd({ fullName: e.target.value })} required className="mt-1 w-full border rounded px-3 py-2" />
      </label>

      {canSeePhone && (
        <label className="block">
          <span className="text-sm text-gray-600">Телефон</span>
          <input name="phone" type="tel" value={f.phone} onChange={(e) => upd({ phone: e.target.value })} placeholder="+7 900 000-00-00" className="mt-1 w-full border rounded px-3 py-2" />
        </label>
      )}

      <div className="flex gap-3">
        <label className="block flex-1">
          <span className="text-sm text-gray-600">Дата рождения</span>
          <input name="birthDate" type="date" value={f.birthDate} onChange={(e) => upd({ birthDate: e.target.value })} required className="mt-1 w-full border rounded px-3 py-2" />
        </label>
        <label className="block w-28">
          <span className="text-sm text-gray-600">Пол</span>
          <select name="sex" value={f.sex} onChange={(e) => upd({ sex: e.target.value as "M" | "F" })} className="mt-1 w-full border rounded px-3 py-2 bg-white">
            <option value="M">М</option><option value="F">Ж</option>
          </select>
        </label>
      </div>

      <label className="block">
        <span className="text-sm text-gray-600">Клуб</span>
        <input name="club" value={f.club} onChange={(e) => upd({ club: e.target.value })} placeholder="Название клуба" className="mt-1 w-full border rounded px-3 py-2" />
        <span className="mt-1 block text-xs text-gray-400">Если клуба ещё нет в системе — он будет создан. Пусто — без клуба.</span>
      </label>

      <div className="flex gap-3">
        <label className="block flex-1">
          <span className="text-sm text-gray-600">Город</span>
          <input name="city" value={f.city} onChange={(e) => upd({ city: e.target.value })} className="mt-1 w-full border rounded px-3 py-2" />
        </label>
        <label className="block flex-1">
          <span className="text-sm text-gray-600">Пояс</span>
          <select name="belt" value={f.belt} onChange={(e) => upd({ belt: e.target.value })} className="mt-1 w-full border rounded px-3 py-2 bg-white">
            {BELTS.map((b) => <option key={b} value={b}>{b || "— не указывать —"}</option>)}
          </select>
        </label>
      </div>

      {res && <p className={"text-sm " + (res.ok ? "text-green-700" : "text-red-600")}>{res.ok ? "✓ " : "✕ "}{res.msg}</p>}

      <div className="flex items-center gap-3">
        <button disabled={pending} className="rounded bg-blue-600 px-4 py-2 text-white disabled:opacity-50">
          {pending ? "Сохранение…" : "Сохранить"}
        </button>
        <Link href={next} className="text-sm text-blue-600">← назад</Link>
      </div>
    </form>
  );
}
