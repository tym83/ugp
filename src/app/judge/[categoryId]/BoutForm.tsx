"use client";
import { useEffect, useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
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

/** Кнопка подтверждения + индикатор статуса отправки (useFormStatus живёт внутри <form>). */
function ConfirmButton({ online, onSynced }: { online: boolean; onSynced: () => void }) {
  const { pending } = useFormStatus();

  // pending переходит true→false после успешного action → значит синхронизировано
  const [wasPending, setWasPending] = useState(false);
  useEffect(() => {
    if (pending) setWasPending(true);
    else if (wasPending) { setWasPending(false); onSynced(); }
  }, [pending, wasPending, onSynced]);

  return (
    <button
      type="submit"
      className="rounded bg-green-700 px-4 py-2 text-white text-sm disabled:opacity-50"
      disabled={pending || !online}
    >
      {pending ? "Отправка…" : "Подтвердить"}
    </button>
  );
}

/** Ввод результата с шагом подтверждения (защита от случайного тапа). */
export default function BoutForm({ matchId, categoryId, cmid, aId, bId, aName, bName, roundLabel, winTypes }: Props) {
  const [winner, setWinner] = useState<string>("");
  const [confirming, setConfirming] = useState(false);

  // овертайм / пенальти (submission-only: ничьи решаются пенальти)
  const [overtime, setOvertime] = useState(false);
  const [penA, setPenA] = useState(0);
  const [penB, setPenB] = useState(0);

  // сеть + статус синхронизации
  const [online, setOnline] = useState(true);
  const [synced, setSynced] = useState(false);
  useEffect(() => {
    const upd = () => setOnline(navigator.onLine);
    upd();
    window.addEventListener("online", upd);
    window.addEventListener("offline", upd);
    return () => { window.removeEventListener("online", upd); window.removeEventListener("offline", upd); };
  }, []);

  const winnerName = winner === aId ? aName : winner === bId ? bName : "";

  // сериализуем овертайм/пенальти в скрытое поле details (JSON). Пусто — если не было овертайма.
  const details = useMemo(() => {
    if (!overtime) return "";
    const advantage = penA === penB ? null : penA > penB ? aId : bId;
    return JSON.stringify({ overtime: true, penaltyA: penA, penaltyB: penB, advantage });
  }, [overtime, penA, penB, aId, bId]);

  return (
    <form action={submitResultAction} className="rounded-lg border p-3">
      <input type="hidden" name="matchId" value={matchId} />
      <input type="hidden" name="categoryId" value={categoryId} />
      {/* clientMutationId делает повтор отправки идемпотентным — можно безопасно ретраить после потери сети */}
      <input type="hidden" name="clientMutationId" value={cmid} />
      <input type="hidden" name="details" value={details} />
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
      </div>

      <div className="mt-2 rounded border border-dashed p-2">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={overtime} onChange={(e) => { setOvertime(e.target.checked); setConfirming(false); }} />
          <span>Овертайм / пенальти</span>
        </label>
        {overtime && (
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
            <label className="flex items-center gap-1">
              <span className="text-gray-500">пенальти {aName}</span>
              <input type="number" min={0} value={penA} onChange={(e) => setPenA(Math.max(0, Number(e.target.value)))} className="w-16 border rounded px-2 py-1" aria-label={`пенальти ${aName}`} />
            </label>
            <label className="flex items-center gap-1">
              <span className="text-gray-500">пенальти {bName}</span>
              <input type="number" min={0} value={penB} onChange={(e) => setPenB(Math.max(0, Number(e.target.value)))} className="w-16 border rounded px-2 py-1" aria-label={`пенальти ${bName}`} />
            </label>
            <span className="text-xs text-gray-500">
              {penA === penB ? "преимущество не определено" : `преимущество: ${penA > penB ? aName : bName}`}
            </span>
          </div>
        )}
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        {!confirming ? (
          <button
            type="button"
            onClick={() => { if (winner) { setSynced(false); setConfirming(true); } }}
            className="rounded bg-green-600 px-4 py-2 text-white text-sm disabled:opacity-50"
            disabled={!winner}
          >
            Записать результат
          </button>
        ) : (
          <>
            <span className="text-sm font-semibold">Победил {winnerName}?</span>
            <ConfirmButton online={online} onSynced={() => { setSynced(true); setConfirming(false); }} />
            <button type="button" onClick={() => setConfirming(false)} className="rounded border px-3 py-2 text-sm">Отмена</button>
          </>
        )}
        {!online && (
          <span className="text-sm text-red-600">⚠ нет сети — результат не отправлен, повторите</span>
        )}
        {online && synced && (
          <span className="text-sm text-green-700">✓ синхронизировано</span>
        )}
      </div>
    </form>
  );
}
