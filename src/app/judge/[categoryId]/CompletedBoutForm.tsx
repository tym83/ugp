"use client";

import { useState, useTransition } from "react";
import { correctResultAction, undoResultAction } from "@/app/actions";

type Props = {
  matchId: string;
  aId: string;
  bId: string;
  aName: string;
  bName: string;
  winnerAthleteId: string;
  winType: string;
  scoreA: number;
  scoreB: number;
  winTypes: { v: string; ru: string }[];
};

export default function CompletedBoutForm(props: Props) {
  const [confirmUndo, setConfirmUndo] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; msg: string } | null>(null);
  const [pending, startTransition] = useTransition();

  function run(action: typeof correctResultAction, data: FormData) {
    setMessage(null);
    startTransition(async () => {
      try {
        const result = await action(data);
        setMessage(result);
        if (result.ok) setConfirmUndo(false);
      } catch {
        setMessage({ ok: false, msg: "Не удалось выполнить действие. Проверьте подключение и права доступа." });
      }
    });
  }

  return (
    <div className="mt-1 space-y-2">
      <form onSubmit={(event) => {
        event.preventDefault();
        run(correctResultAction, new FormData(event.currentTarget));
      }}>
        <fieldset disabled={pending || confirmUndo} className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="matchId" value={props.matchId} />
          <input type="hidden" name="scoreA" value={props.scoreA} />
          <input type="hidden" name="scoreB" value={props.scoreB} />
          <span className="text-xs text-gray-500">гл. судья:</span>
          <select aria-label="Победитель" name="winnerAthleteId" className="border rounded px-1 py-0.5 text-xs" defaultValue={props.winnerAthleteId}>
            <option value={props.aId}>{props.aName}</option>
            <option value={props.bId}>{props.bName}</option>
          </select>
          <select aria-label="Тип победы" name="winType" className="border rounded px-1 py-0.5 text-xs" defaultValue={props.winType}>
            {props.winTypes.map((w) => <option key={w.v} value={w.v}>{w.ru}</option>)}
          </select>
          <input aria-label="Причина исправления" name="reason" placeholder="причина" className="border rounded px-1 py-0.5 text-xs w-28" />
          <button className="rounded border border-amber-500 text-amber-700 px-2 py-0.5 text-xs">Исправить</button>
        </fieldset>
      </form>
      {confirmUndo ? (
        <form onSubmit={(event) => {
          event.preventDefault();
          run(undoResultAction, new FormData(event.currentTarget));
        }}>
          <fieldset disabled={pending} className="flex flex-wrap items-center gap-2">
            <input type="hidden" name="matchId" value={props.matchId} />
            <span>Отменить результат? Схватка снова станет несыгранной.</span>
            <input aria-label="Причина отмены" name="reason" placeholder="причина" className="border rounded px-1 py-0.5 text-xs w-28" />
            <button className="rounded border border-red-500 px-2 py-0.5 text-xs">Да</button>
            <button type="button" onClick={() => setConfirmUndo(false)} className="rounded border px-2 py-0.5 text-xs">Нет</button>
          </fieldset>
        </form>
      ) : (
        <button type="button" disabled={pending} onClick={() => { setMessage(null); setConfirmUndo(true); }} className="rounded border border-red-500 text-red-700 px-2 py-0.5 text-xs">
          Отменить результат
        </button>
      )}
      {pending && <p role="status">Сохранение…</p>}
      {message && <p role={message.ok ? "status" : "alert"} className={message.ok ? "text-green-700" : "text-red-700"}>{message.msg}</p>}
    </div>
  );
}
