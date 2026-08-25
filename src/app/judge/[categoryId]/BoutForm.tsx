"use client";
import { useState } from "react";
import { submitResultAction } from "@/app/actions";

type Props = {
  matchId: string;
  categoryId: string;
  cmid: string;
  aId: string;
  bId: string;
  aName: string;
  bName: string;
  roundLabel: string;
  winTypes: { v: string; ru: string }[];
};

/** Ввод результата с шагом подтверждения (защита от случайного тапа). */
export default function BoutForm({ matchId, categoryId, cmid, aId, bId, aName, bName, roundLabel, winTypes }: Props) {
  const [winner, setWinner] = useState<string>("");
  const [confirming, setConfirming] = useState(false);

  const winnerName = winner === aId ? aName : winner === bId ? bName : "";

  return (
    <form action={submitResultAction} className="rounded-lg border p-3">
      <input type="hidden" name="matchId" value={matchId} />
      <input type="hidden" name="categoryId" value={categoryId} />
      <input type="hidden" name="clientMutationId" value={cmid} />
      <div className="text-xs text-gray-400 mb-2">{roundLabel}</div>
      <div className="flex flex-col gap-2 mb-2">
        <label className="flex items-center gap-2 text-lg">
          <input type="radio" name="winnerAthleteId" value={aId} required checked={winner === aId} onChange={() => { setWinner(aId); setConfirming(false); }} />
          <span className="font-medium">{aName}</span>
        </label>
        <label className="flex items-center gap-2 text-lg">
          <input type="radio" name="winnerAthleteId" value={bId} checked={winner === bId} onChange={() => { setWinner(bId); setConfirming(false); }} />
          <span className="font-medium">{bName}</span>
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <select name="winType" className="border rounded px-2 py-1 text-sm" defaultValue="SUBMISSION">
          {winTypes.map((w) => <option key={w.v} value={w.v}>{w.ru}</option>)}
        </select>
        <input type="number" name="scoreA" placeholder="очки A" className="w-20 border rounded px-2 py-1 text-sm" aria-label={`очки ${aName}`} />
        <input type="number" name="scoreB" placeholder="очки B" className="w-20 border rounded px-2 py-1 text-sm" aria-label={`очки ${bName}`} />
        {!confirming ? (
          <button
            type="button"
            onClick={() => { if (winner) setConfirming(true); }}
            className="rounded bg-green-600 px-4 py-2 text-white text-sm disabled:opacity-50"
            disabled={!winner}
          >
            Записать результат
          </button>
        ) : (
          <>
            <span className="text-sm font-semibold">Победил {winnerName}?</span>
            <button type="submit" className="rounded bg-green-700 px-4 py-2 text-white text-sm">Подтвердить</button>
            <button type="button" onClick={() => setConfirming(false)} className="rounded border px-3 py-2 text-sm">Отмена</button>
          </>
        )}
      </div>
    </form>
  );
}
