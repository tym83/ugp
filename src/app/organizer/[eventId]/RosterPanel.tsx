"use client";
import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  addAthleteToCategory,
  addNewAthleteToCategory,
  dissolveBracket,
  mergeCandidates,
  mergeIntoCategory,
  moveAthleteHere,
  removeFromCategory,
  saveBracket,
  searchEventAthletes,
  type RosterCandidate,
} from "@/app/roster-actions";

export type RosterRow = {
  registrationId: string;
  athleteId: string;
  fullName: string;
  birthYear: number;
  club: string | null;
  weight: number | null;
  status: string;
};

const STATUS_RU: Record<string, string> = { ADMITTED: "допущен", ENTERED: "не взвешен", OVERWEIGHT: "перевес", WITHDRAWN: "убран" };

type Props = { categoryId: string; hasBracket: boolean; locked: string | null; rows: RosterRow[]; slotted: string[] };

export default function RosterPanel({ categoryId, hasBracket, locked, rows, slotted }: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [q, setQ] = useState("");
  const [found, setFound] = useState<RosterCandidate[] | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [nw, setNw] = useState({ fullName: "", birthDate: "", club: "", weight: "" });
  const [showMerge, setShowMerge] = useState(false);
  const [mergeCands, setMergeCands] = useState<{ id: string; label: string; count: number }[] | null>(null);
  const [mergePick, setMergePick] = useState("");
  const [mergeAsk, setMergeAsk] = useState(false);
  /** Fit-check refusal: «Да, добавить» repeats the same call with force=true. */
  const [confirm, setConfirm] = useState<{ text: string; act: (force: boolean) => Promise<{ ok: boolean; msg: string }>; after?: () => void } | null>(null);

  const run = (act: (force: boolean) => Promise<{ ok: boolean; msg: string; needsConfirm?: boolean }>, after?: () => void) =>
    start(async () => {
      try {
        const r = await act(false);
        if (r.needsConfirm) {
          setConfirm({ text: r.msg, act, after });
          return;
        }
        setConfirm(null);
        setMsg({ ok: r.ok, text: r.msg });
        if (r.ok) {
          after?.();
          router.refresh();
        }
      } catch (e) {
        setMsg({ ok: false, text: (e as Error).message });
      }
    });

  const active = rows.filter((r) => r.status !== "WITHDRAWN");
  const removed = rows.filter((r) => r.status === "WITHDRAWN");
  const admitted = rows.filter((r) => r.status === "ADMITTED" || r.status === "ENTERED").length;
  const slottedSet = new Set(slotted);
  // Состав правится всегда; вливание доступно только без сетки и без результатов.
  const mergeVisible = !hasBracket && !locked;

  return (
    <div className="space-y-5">
      {locked && <p className="rounded bg-amber-50 px-3 py-2 text-sm text-amber-800">{locked}</p>}

      <div className="flex flex-wrap items-center gap-3 rounded border p-3">
        {hasBracket ? (
          <>
            <span className="text-sm">
              {locked ? "Сетка собрана, результаты есть — состав правится ниже, слоты схваток — в разделе «Правка сетки по схваткам»." : "Сетка собрана. Чтобы поменять состав — разберите её."}
            </span>
            <button
              disabled={pending || !!locked}
              onClick={() => run(() => dissolveBracket(categoryId))}
              className="rounded bg-red-600 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
            >
              Разобрать сетку
            </button>
          </>
        ) : (
          <>
            <span className="text-sm">Сетки нет. В сетку пойдут: {admitted}.</span>
            <button
              disabled={pending || !!locked || admitted === 0}
              onClick={() => run(() => saveBracket(categoryId))}
              className="rounded bg-emerald-700 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
            >
              Сохранить сетку
            </button>
          </>
        )}
        {msg && <span className={`text-sm ${msg.ok ? "text-green-700" : "text-red-600"}`}>{msg.text}</span>}
        {confirm && (
          <div className="flex w-full flex-wrap items-center gap-2 rounded bg-amber-50 px-3 py-2 text-sm text-amber-800">
            <span>{confirm.text}</span>
            <button
              disabled={pending}
              onClick={() =>
                start(async () => {
                  try {
                    const r = await confirm.act(true);
                    setConfirm(null);
                    setMsg({ ok: r.ok, text: r.msg });
                    if (r.ok) {
                      confirm.after?.();
                      router.refresh();
                    }
                  } catch (e) {
                    setConfirm(null);
                    setMsg({ ok: false, text: (e as Error).message });
                  }
                })
              }
              className="rounded bg-amber-600 px-3 py-1 text-xs font-semibold text-white disabled:opacity-50"
            >
              Да, добавить
            </button>
            <button type="button" disabled={pending} onClick={() => setConfirm(null)} className="rounded border px-3 py-1 text-xs">
              Отмена
            </button>
          </div>
        )}
      </div>

      <section>
        <h2 className="mb-2 font-semibold">Участники ({active.length})</h2>
        <table className="w-full text-sm">
          <tbody className="divide-y">
            {active.map((r) => (
              <tr key={r.registrationId}>
                <td className="py-1.5 pr-2">
                  <div className="font-medium">{r.fullName}</div>
                  <div className="text-xs text-gray-500">{r.birthYear}{r.club ? ` · ${r.club}` : ""}{r.weight ? ` · ${r.weight} кг` : ""}</div>
                </td>
                <td className={`px-2 text-xs ${r.status === "ADMITTED" ? "text-green-700" : "text-amber-700"}`}>{STATUS_RU[r.status] ?? r.status}</td>
                <td className="whitespace-nowrap text-right">
                  {r.status === "OVERWEIGHT" && (
                    <button disabled={pending} onClick={() => run((force) => addAthleteToCategory(categoryId, r.athleteId, null, force))} className="mr-2 rounded border px-2 py-0.5 text-xs text-blue-700">
                      допустить
                    </button>
                  )}
                  <button
                    disabled={pending || slottedSet.has(r.athleteId)}
                    title={slottedSet.has(r.athleteId) ? "Сначала замените участника в сетке" : undefined}
                    onClick={() => run(() => removeFromCategory(r.registrationId))}
                    className="rounded border px-2 py-0.5 text-xs text-red-600 disabled:opacity-50"
                  >
                    убрать
                  </button>
                </td>
              </tr>
            ))}
            {active.length === 0 && <tr><td className="py-2 text-gray-400">Пока никого</td></tr>}
          </tbody>
        </table>
        {removed.length > 0 && (
          <div className="mt-2 text-sm text-gray-500">
            Убраны:{" "}
            {removed.map((r) => (
              <span key={r.registrationId} className="mr-3 inline-flex items-center gap-1">
                {r.fullName}
                <button disabled={pending} onClick={() => run((force) => addAthleteToCategory(categoryId, r.athleteId, null, force))} className="text-xs text-blue-700 underline">
                  вернуть
                </button>
              </span>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-3 rounded border p-3">
        <h2 className="font-semibold">Добавить участника</h2>
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              start(async () => setFound(await searchEventAthletes(categoryId, q)));
            }}
          >
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="фамилия участника турнира" className="w-72 rounded border px-2 py-1 text-sm" />
            <button disabled={pending} className="rounded bg-blue-600 px-3 py-1 text-sm text-white disabled:opacity-50">Найти</button>
          </form>
          {found && (
            <ul className="space-y-1 text-sm">
              {found.length === 0 && <li className="text-gray-500">Не найдено среди заявленных на турнир.</li>}
              {found.map((c) => {
                const other = c.otherCategory;
                return (
                  <li key={c.athleteId} className="flex flex-wrap items-center gap-2">
                    <span>{c.fullName} <span className="text-gray-500">{c.birthYear}{c.club ? ` · ${c.club}` : ""}</span></span>
                    {c.allCategories.length > 0 && (
                      <span className="inline-flex flex-wrap gap-2 text-xs">
                        <span className="text-gray-500">сейчас:</span>
                        {c.allCategories.map((category) => (
                          <Link key={category.id} href={`/category/${encodeURIComponent(category.id)}?a=${encodeURIComponent(c.athleteId)}#a-${encodeURIComponent(c.athleteId)}`} target="_blank" rel="noopener" className="text-blue-600 hover:underline">
                            {category.label} →
                          </Link>
                        ))}
                      </span>
                    )}
                    {c.inCategory ? (
                      <span className="text-xs text-gray-400">уже в категории</span>
                    ) : other ? (
                      <>
                        <button disabled={pending} onClick={() => run((force) => moveAthleteHere(categoryId, other.registrationId, force), () => setFound(null))} className="rounded bg-blue-600 px-2 py-0.5 text-xs text-white">
                          перенести сюда
                        </button>
                        <button disabled={pending} onClick={() => run((force) => addAthleteToCategory(categoryId, c.athleteId, null, force), () => setFound(null))} className="rounded bg-emerald-700 px-2 py-0.5 text-xs text-white">
                          добавить ещё в одну
                        </button>
                      </>
                    ) : (
                      <button disabled={pending} onClick={() => run((force) => addAthleteToCategory(categoryId, c.athleteId, null, force), () => setFound(null))} className="rounded bg-emerald-700 px-2 py-0.5 text-xs text-white">
                        добавить
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          <button type="button" onClick={() => setShowNew((v) => !v)} className="text-sm text-blue-700 underline">
            {showNew ? "скрыть" : "Человека нет на сайте — добавить нового"}
          </button>
          {showNew && (
            <form
              className="flex flex-wrap items-end gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                const w = nw.weight ? Number(nw.weight.replace(",", ".")) : null;
                run(
                  (force) => addNewAthleteToCategory(categoryId, { fullName: nw.fullName, birthDate: nw.birthDate, club: nw.club, weight: w && w > 0 ? w : null }, force),
                  () => setNw({ fullName: "", birthDate: "", club: "", weight: "" }),
                );
              }}
            >
              <label className="text-xs">ФИО<input required value={nw.fullName} onChange={(e) => setNw({ ...nw, fullName: e.target.value })} className="block w-64 rounded border px-2 py-1 text-sm" /></label>
              <label className="text-xs">Дата рождения<input required type="date" value={nw.birthDate} onChange={(e) => setNw({ ...nw, birthDate: e.target.value })} className="block rounded border px-2 py-1 text-sm" /></label>
              <label className="text-xs">Клуб<input value={nw.club} onChange={(e) => setNw({ ...nw, club: e.target.value })} placeholder="можно пусто" className="block w-48 rounded border px-2 py-1 text-sm" /></label>
              <label className="text-xs">Вес, кг<input value={nw.weight} onChange={(e) => setNw({ ...nw, weight: e.target.value })} inputMode="decimal" className="block w-20 rounded border px-2 py-1 text-sm" /></label>
              <button disabled={pending} className="rounded bg-emerald-700 px-3 py-1.5 text-sm text-white disabled:opacity-50">Добавить</button>
            </form>
          )}
        </section>

      {mergeVisible && (
        <section className="space-y-3 rounded border p-3">
          <h2 className="font-semibold">Влить другую категорию</h2>
          {!showMerge ? (
            <button
              type="button"
              onClick={() => {
                setShowMerge(true);
                start(async () => setMergeCands(await mergeCandidates(categoryId)));
              }}
              className="text-sm text-blue-700 underline"
            >
              Показать совместимые категории
            </button>
          ) : mergeCands === null ? (
            <p className="text-sm text-gray-400">Загрузка…</p>
          ) : mergeCands.length === 0 ? (
            <p className="text-sm text-gray-500">Нет совместимых категорий для вливания.</p>
          ) : (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={mergePick}
                  onChange={(e) => {
                    setMergePick(e.target.value);
                    setMergeAsk(false);
                  }}
                  className="rounded border px-2 py-1 text-sm"
                >
                  <option value="">— выберите категорию —</option>
                  {mergeCands.map((c) => (
                    <option key={c.id} value={c.id}>{c.label} ({c.count})</option>
                  ))}
                </select>
                {mergePick && !mergeAsk && (
                  <button disabled={pending} onClick={() => setMergeAsk(true)} className="rounded bg-blue-600 px-3 py-1 text-sm text-white disabled:opacity-50">
                    Влить
                  </button>
                )}
              </div>
              {mergePick && mergeAsk && (
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span>
                    Все участники «{mergeCands.find((c) => c.id === mergePick)?.label}» перейдут сюда, а «{mergeCands.find((c) => c.id === mergePick)?.label}» исчезнет из списка. Влить?
                  </span>
                  <button
                    disabled={pending}
                    onClick={() =>
                      run(() => mergeIntoCategory(categoryId, mergePick), () => {
                        setShowMerge(false);
                        setMergeCands(null);
                        setMergePick("");
                        setMergeAsk(false);
                      })
                    }
                    className="rounded bg-red-600 px-3 py-1 text-sm font-semibold text-white disabled:opacity-50"
                  >
                    Да
                  </button>
                  <button type="button" disabled={pending} onClick={() => setMergeAsk(false)} className="rounded border px-3 py-1 text-sm">
                    Отмена
                  </button>
                </div>
              )}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
