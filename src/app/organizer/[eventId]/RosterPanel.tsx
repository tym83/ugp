"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  addAthleteToCategory,
  addNewAthleteToCategory,
  dissolveBracket,
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

type Props = { categoryId: string; hasBracket: boolean; locked: string | null; rows: RosterRow[] };

export default function RosterPanel({ categoryId, hasBracket, locked, rows }: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [q, setQ] = useState("");
  const [found, setFound] = useState<RosterCandidate[] | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [nw, setNw] = useState({ fullName: "", birthDate: "", club: "", weight: "" });

  const run = (p: () => Promise<{ ok: boolean; msg: string }>, after?: () => void) =>
    start(async () => {
      try {
        const r = await p();
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
  const editable = !hasBracket && !locked;

  return (
    <div className="space-y-5">
      {locked && <p className="rounded bg-amber-50 px-3 py-2 text-sm text-amber-800">{locked}</p>}

      <div className="flex flex-wrap items-center gap-3 rounded border p-3">
        {hasBracket ? (
          <>
            <span className="text-sm">Сетка собрана. Чтобы поменять состав — разберите её.</span>
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
                  {editable && r.status === "OVERWEIGHT" && (
                    <button disabled={pending} onClick={() => run(() => addAthleteToCategory(categoryId, r.athleteId, null))} className="mr-2 rounded border px-2 py-0.5 text-xs text-blue-700">
                      допустить
                    </button>
                  )}
                  {editable && (
                    <button disabled={pending} onClick={() => run(() => removeFromCategory(r.registrationId))} className="rounded border px-2 py-0.5 text-xs text-red-600">
                      убрать
                    </button>
                  )}
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
                {editable && (
                  <button disabled={pending} onClick={() => run(() => addAthleteToCategory(categoryId, r.athleteId, null))} className="text-xs text-blue-700 underline">
                    вернуть
                  </button>
                )}
              </span>
            ))}
          </div>
        )}
      </section>

      {editable && (
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
              {found.map((c) => (
                <li key={c.athleteId} className="flex items-center gap-2">
                  <span>{c.fullName} <span className="text-gray-500">{c.birthYear}{c.club ? ` · ${c.club}` : ""}</span></span>
                  {c.inCategory ? (
                    <span className="text-xs text-gray-400">уже в категории</span>
                  ) : (
                    <button disabled={pending} onClick={() => run(() => addAthleteToCategory(categoryId, c.athleteId, null), () => setFound(null))} className="rounded bg-emerald-700 px-2 py-0.5 text-xs text-white">
                      добавить
                    </button>
                  )}
                </li>
              ))}
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
                  () => addNewAthleteToCategory(categoryId, { fullName: nw.fullName, birthDate: nw.birthDate, club: nw.club, weight: w && w > 0 ? w : null }),
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
      )}
    </div>
  );
}
