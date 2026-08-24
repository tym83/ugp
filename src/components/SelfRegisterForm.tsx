"use client";
import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { selfRegister, type SelfRegisterResult } from "@/app/athlete-actions";
import { selectTier, priceEntry, type Tier } from "@/lib/domain/pricing";

type TierDTO = {
  name: string;
  startsAt: string;
  priceOneDivision: number;
  priceBothDivisions: number;
  absoluteSurcharge: number;
};

function ageYears(dob: Date, ref = new Date()): number {
  let a = ref.getFullYear() - dob.getFullYear();
  const m = ref.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && ref.getDate() < dob.getDate())) a--;
  return a;
}

export default function SelfRegisterForm({ eventId, tiers }: { eventId: string; tiers: TierDTO[] }) {
  const [fullName, setFullName] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [sex, setSex] = useState<"M" | "F">("M");
  const [weight, setWeight] = useState("");
  const [gi, setGi] = useState(true);
  const [nogi, setNogi] = useState(false);
  const [absolute, setAbsolute] = useState(false);
  const [consent, setConsent] = useState(false);
  const [parentName, setParentName] = useState("");
  const [parentConsent, setParentConsent] = useState(false);
  const [result, setResult] = useState<SelfRegisterResult | null>(null);
  const [pending, start] = useTransition();

  const isMinor = useMemo(() => {
    if (!birthDate) return false;
    const dob = new Date(birthDate);
    return !Number.isNaN(dob.getTime()) && ageYears(dob) < 18;
  }, [birthDate]);

  const pricePreview = useMemo(() => {
    const disciplines = [gi ? "gi" : null, nogi ? "nogi" : null].filter(Boolean) as ("gi" | "nogi")[];
    if (!disciplines.length) return null;
    const parsed: Tier[] = tiers.map((t) => ({ ...t, startsAt: new Date(t.startsAt) }));
    const tier = selectTier(parsed, new Date()) ?? parsed[0];
    if (!tier) return null;
    return { total: priceEntry(tier, { disciplines, absoluteAdded: absolute }), tierName: tier.name };
  }, [gi, nogi, absolute, tiers]);

  const submit = (formData: FormData) =>
    start(async () => {
      const r = await selfRegister(formData);
      setResult(r);
    });

  if (result?.ok) {
    return (
      <div className="rounded border border-green-300 bg-green-50 p-4 text-sm">
        <p className="text-green-800 font-semibold">Готово!</p>
        <p className="text-green-800 mt-1">{result.msg}</p>
        <div className="mt-3 flex gap-3">
          <Link href={`/category/${result.categoryId}`} className="text-blue-600">Ваша сетка →</Link>
          <Link href="/me" className="text-blue-600">Мой кабинет →</Link>
        </div>
      </div>
    );
  }

  return (
    <form action={submit} className="space-y-4">
      <input type="hidden" name="eventId" value={eventId} />

      <label className="block">
        <span className="text-sm text-gray-600">ФИО</span>
        <input name="fullName" value={fullName} onChange={(e) => setFullName(e.target.value)}
          placeholder="Иванов Иван Иванович" required
          className="mt-1 w-full border rounded px-3 py-2" />
      </label>

      <div className="flex gap-3">
        <label className="block flex-1">
          <span className="text-sm text-gray-600">Дата рождения</span>
          <input name="birthDate" type="date" value={birthDate} onChange={(e) => setBirthDate(e.target.value)}
            required className="mt-1 w-full border rounded px-3 py-2" />
        </label>
        <label className="block">
          <span className="text-sm text-gray-600">Пол</span>
          <select name="sex" value={sex} onChange={(e) => setSex(e.target.value as "M" | "F")}
            className="mt-1 w-full border rounded px-3 py-2">
            <option value="M">М</option><option value="F">Ж</option>
          </select>
        </label>
        <label className="block w-28">
          <span className="text-sm text-gray-600">Вес, кг</span>
          <input name="weight" type="number" step="0.1" value={weight} onChange={(e) => setWeight(e.target.value)}
            required className="mt-1 w-full border rounded px-3 py-2" />
        </label>
      </div>

      <fieldset>
        <span className="text-sm text-gray-600">Разделы</span>
        <div className="mt-1 flex gap-4 text-sm">
          <label className="flex items-center gap-2">
            <input type="checkbox" name="gi" checked={gi} onChange={(e) => setGi(e.target.checked)} /> ги
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" name="nogi" checked={nogi} onChange={(e) => setNogi(e.target.checked)} /> ноу-ги
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" name="absolute" checked={absolute} onChange={(e) => setAbsolute(e.target.checked)} /> абсолютка
          </label>
        </div>
      </fieldset>

      {pricePreview && (
        <div className="rounded bg-gray-50 border px-3 py-2 text-sm">
          Стоимость: <span className="font-semibold">{pricePreview.total} ₽</span>
          <span className="text-gray-500"> · тариф «{pricePreview.tierName}»</span>
        </div>
      )}

      {isMinor && (
        <div className="rounded border border-amber-300 bg-amber-50 p-3 space-y-2">
          <p className="text-sm text-amber-800 font-semibold">Участник несовершеннолетний</p>
          <label className="block">
            <span className="text-sm text-gray-600">ФИО родителя / законного представителя</span>
            <input name="parentName" value={parentName} onChange={(e) => setParentName(e.target.value)}
              className="mt-1 w-full border rounded px-3 py-2" />
          </label>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" name="parentConsent" checked={parentConsent}
              onChange={(e) => setParentConsent(e.target.checked)} className="mt-1" />
            <span>Я, родитель/законный представитель, даю согласие на участие ребёнка и обработку его персональных данных.</span>
          </label>
        </div>
      )}

      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="consent" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-1" />
        <span>Согласен на обработку персональных данных в соответствии с 152-ФЗ.</span>
      </label>

      {result && !result.ok && <p className="text-sm text-red-600">✕ {result.msg}</p>}

      <button disabled={pending} className="w-full rounded bg-blue-600 px-4 py-2 text-white disabled:opacity-50">
        {pending ? "Отправка…" : "Зарегистрироваться"}
      </button>
    </form>
  );
}
