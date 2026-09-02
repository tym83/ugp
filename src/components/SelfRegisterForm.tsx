"use client";
import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { selfRegister, type SelfRegisterResult } from "@/app/athlete-actions";
import { selectTier, priceEntry, type Tier } from "@/lib/domain/pricing";
import { allowedCategories, suggestedCategories, type SelectableCat } from "@/lib/domain/eligibility";

type TierDTO = { name: string; startsAt: string; priceFirstCategory: number; priceExtraCategory: number | null };
type CatDTO = SelectableCat & { label: string; ageGroupLabel: string };

function ageYears(dob: Date, ref = new Date()): number {
  let a = ref.getFullYear() - dob.getFullYear();
  const m = ref.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && ref.getDate() < dob.getDate())) a--;
  return a;
}

export default function SelfRegisterForm({
  eventId,
  tiers,
  categories,
}: {
  eventId: string;
  tiers: TierDTO[];
  categories: CatDTO[];
}) {
  const [fullName, setFullName] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [sex, setSex] = useState<"M" | "F">("M");
  const [weight, setWeight] = useState("");
  const [belt, setBelt] = useState("");
  const [showAll, setShowAll] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [consent, setConsent] = useState(false);
  const [parentName, setParentName] = useState("");
  const [parentConsent, setParentConsent] = useState(false);
  const [result, setResult] = useState<SelfRegisterResult | null>(null);
  const [pending, start] = useTransition();

  const dob = useMemo(() => (birthDate ? new Date(birthDate) : null), [birthDate]);
  const isMinor = useMemo(() => !!dob && !Number.isNaN(dob.getTime()) && ageYears(dob) < 18, [dob]);

  // Список категорий: сужённый (пол+возраст+вес±2) или полный (пол+возраст) по кнопке «Показать все».
  const visible = useMemo(() => {
    if (!dob || Number.isNaN(dob.getTime())) return [];
    const a = { sex, birthYear: dob.getFullYear(), weight: weight ? Number(weight) : null };
    const base = showAll ? allowedCategories(a, categories) : suggestedCategories(a, categories);
    const ids = new Set(base.map((c) => c.id));
    return categories.filter((c) => ids.has(c.id));
  }, [dob, sex, weight, showAll, categories]);

  const grouped = useMemo(() => {
    const g = new Map<string, CatDTO[]>();
    for (const c of visible) {
      const key = c.isAbsolute ? "Абсолютка" : c.discipline === "gi" ? "Ги" : "Ноу-ги";
      (g.get(key) ?? g.set(key, []).get(key)!).push(c);
    }
    return [...g.entries()];
  }, [visible]);

  const pricePreview = useMemo(() => {
    if (!picked.size) return null;
    const parsed: Tier[] = tiers.map((t) => ({ ...t, startsAt: new Date(t.startsAt) }));
    const tier = selectTier(parsed, new Date()) ?? parsed[0];
    if (!tier) return null;
    return { total: priceEntry(tier, { categoryCount: picked.size }), tierName: tier.name };
  }, [picked, tiers]);

  const toggle = (id: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const submit = (formData: FormData) => {
    // категории добавляем вручную (мультизначения)
    for (const id of picked) formData.append("categoryIds", id);
    start(async () => setResult(await selfRegister(formData)));
  };

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
          placeholder="Иванов Иван Иванович" required className="mt-1 w-full border rounded px-3 py-2" />
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
            placeholder="напр. 75" className="mt-1 w-full border rounded px-3 py-2" />
        </label>
      </div>
      <p className="text-xs text-gray-400 -mt-2">Вес нужен только чтобы подсказать подходящие весовые — категорию вы выбираете сами.</p>

      <label className="block">
        <span className="text-sm text-gray-600">Пояс (необязательно)</span>
        <input name="belt" value={belt} onChange={(e) => setBelt(e.target.value)}
          placeholder="напр. синий" className="mt-1 w-full border rounded px-3 py-2" />
      </label>

      <fieldset>
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-600">Категории {picked.size > 0 && `· выбрано ${picked.size}`}</span>
          <button type="button" onClick={() => setShowAll((v) => !v)} className="text-xs text-blue-600">
            {showAll ? "← только подходящие" : "Показать все →"}
          </button>
        </div>
        {!birthDate ? (
          <p className="mt-2 text-sm text-gray-400">Укажите дату рождения и пол — покажем доступные категории.</p>
        ) : visible.length === 0 ? (
          <p className="mt-2 text-sm text-gray-400">Подходящих категорий нет. Попробуйте «Показать все».</p>
        ) : (
          <div className="mt-2 max-h-72 overflow-y-auto rounded border divide-y">
            {grouped.map(([group, list]) => (
              <div key={group} className="p-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-1">{group}</p>
                {list.map((c) => (
                  <label key={c.id} className="flex items-center gap-2 py-1 text-sm">
                    <input type="checkbox" checked={picked.has(c.id)} onChange={() => toggle(c.id)} />
                    {c.label}
                  </label>
                ))}
              </div>
            ))}
          </div>
        )}
      </fieldset>

      {pricePreview && (
        <div className="rounded bg-gray-50 border px-3 py-2 text-sm">
          Стоимость: <span className="font-semibold">{pricePreview.total} ₽</span>
          <span className="text-gray-500"> · тариф «{pricePreview.tierName}» · {picked.size} категор.</span>
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

      <button disabled={pending || picked.size === 0} className="w-full rounded bg-blue-600 px-4 py-2 text-white disabled:opacity-50">
        {pending ? "Отправка…" : picked.size ? `Зарегистрироваться (${picked.size})` : "Выберите категорию"}
      </button>
    </form>
  );
}
