"use client";
import { useState, useTransition } from "react";
import {
  swapSeeds,
  moveAthleteSeed,
  resolveConflict,
  type SeedRow,
  type Conflict,
} from "@/app/organizer-actions";

type Props = { categoryId: string; seeds: SeedRow[]; conflicts: Conflict[] };

export default function BracketEdit({ categoryId, seeds, conflicts }: Props) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [a1, setA1] = useState("");
  const [a2, setA2] = useState("");
  const [moveId, setMoveId] = useState("");
  const [moveSeed, setMoveSeed] = useState("");

  const run = (p: Promise<{ ok: boolean; msg: string }>) => start(async () => setMsg((await p).msg));

  return (
    <div className="rounded border p-3 space-y-4">
      {conflicts.length > 0 ? (
        <div>
          <h3 className="text-sm font-semibold text-red-600 mb-2">
            Конфликты 1-го круга — развести ({conflicts.length})
          </h3>
          <ul className="space-y-1 text-sm">
            {conflicts.map((c, i) => (
              <li key={i} className="flex items-center gap-2 flex-wrap">
                <span>
                  {c.matchLabel}: <b>{c.a.fullName}</b> ↔ <b>{c.b.fullName}</b>{" "}
                  <span className="text-gray-400">({c.kind === "club" ? "один клуб" : "однофамильцы"})</span>
                </span>
                <button
                  disabled={pending}
                  onClick={() => run(resolveConflict(categoryId, c.b.athleteId))}
                  className="rounded bg-red-600 px-2 py-0.5 text-xs text-white disabled:opacity-50"
                >
                  {pending ? "…" : "развести"}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="text-sm text-green-600">Конфликтов 1-го круга нет.</p>
      )}

      <div>
        <h3 className="text-sm font-semibold mb-2">Текущий посев</h3>
        <ol className="list-decimal ml-6 text-sm">
          {seeds.map((s) => (
            <li key={s.athleteId}>
              {s.fullName} <span className="text-gray-400">({s.clubName ?? "—"})</span>
            </li>
          ))}
        </ol>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-1">
          <div className="text-xs font-semibold text-gray-500">Поменять местами</div>
          <div className="flex flex-wrap items-center gap-1">
            <select value={a1} onChange={(e) => setA1(e.target.value)} className="rounded border px-1 py-0.5 text-sm">
              <option value="">атлет A</option>
              {seeds.map((s) => (
                <option key={s.athleteId} value={s.athleteId}>{s.fullName}</option>
              ))}
            </select>
            <select value={a2} onChange={(e) => setA2(e.target.value)} className="rounded border px-1 py-0.5 text-sm">
              <option value="">атлет B</option>
              {seeds.map((s) => (
                <option key={s.athleteId} value={s.athleteId}>{s.fullName}</option>
              ))}
            </select>
            <button
              disabled={pending || !a1 || !a2}
              onClick={() => run(swapSeeds(categoryId, a1, a2))}
              className="rounded bg-blue-600 px-2 py-0.5 text-xs text-white disabled:opacity-50"
            >
              поменять
            </button>
          </div>
        </div>

        <div className="space-y-1">
          <div className="text-xs font-semibold text-gray-500">Задать посев</div>
          <div className="flex flex-wrap items-center gap-1">
            <select value={moveId} onChange={(e) => setMoveId(e.target.value)} className="rounded border px-1 py-0.5 text-sm">
              <option value="">атлет</option>
              {seeds.map((s) => (
                <option key={s.athleteId} value={s.athleteId}>{s.fullName}</option>
              ))}
            </select>
            <input
              type="number"
              min={1}
              value={moveSeed}
              onChange={(e) => setMoveSeed(e.target.value)}
              placeholder="№"
              className="w-14 rounded border px-1 py-0.5 text-sm"
            />
            <button
              disabled={pending || !moveId || !moveSeed}
              onClick={() => run(moveAthleteSeed(categoryId, moveId, Number(moveSeed)))}
              className="rounded bg-blue-600 px-2 py-0.5 text-xs text-white disabled:opacity-50"
            >
              применить
            </button>
          </div>
        </div>
      </div>

      {msg && <p className="text-xs text-gray-600">{msg}</p>}
    </div>
  );
}
