"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { reopenBye, setSlot, walkover, type SlotAthlete, type SlotEditRow } from "@/app/roster-actions";

type Props = { athletes: SlotAthlete[]; names: Record<string, string>; rows: SlotEditRow[] };

const WIN_TYPE_RU: Record<string, string> = {
  SUBMISSION: "сдача",
  POINTS: "очки",
  DECISION: "решение",
  DQ: "дисквалификация",
  NO_SHOW: "неявка",
  INJURY: "травма",
  WALKOVER: "проход",
};

/** «Правка сетки по схваткам»: слоты ожидающих схваток, постановка соперника в проход, зачёт прохода. */
export default function SlotEditor({ athletes, names, rows }: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [byePick, setByePick] = useState<Record<string, string>>({});
  const [confirmKey, setConfirmKey] = useState<string | null>(null);

  const run = (p: () => Promise<{ ok: boolean; msg: string }>, after?: () => void) =>
    start(async () => {
      try {
        const r = await p();
        setMsg({ ok: r.ok, text: r.msg });
        if (r.ok) {
          after?.();
          setConfirmKey(null);
          router.refresh();
        }
      } catch (e) {
        setMsg({ ok: false, text: (e as Error).message });
      }
    });

  const nameOf = (id: string | null) => (id ? names[id] ?? "не в категории" : "— пусто —");

  const slotSelect = (row: SlotEditRow, side: "A" | "B") => {
    const slot = side === "A" ? row.slotA : row.slotB;
    if (!slot.editable) {
      return slot.feederPending ? (
        <span className="text-xs text-gray-400">Это место заполнит победитель схватки №{slot.feederNum}</span>
      ) : (
        <span className="text-sm text-gray-500">{nameOf(slot.athleteId)}</span>
      );
    }
    const value = slot.athleteId ?? "";
    const known = athletes.some((a) => a.athleteId === value);
    return (
      <select
        value={value}
        disabled={pending}
        onChange={(e) => run(() => setSlot(row.id, side, e.target.value || null))}
        className="rounded border px-2 py-1 text-sm"
      >
        <option value="">— пусто —</option>
        {value && !known && <option value={value}>{nameOf(value)}</option>}
        {athletes.map((a) => (
          <option key={a.athleteId} value={a.athleteId}>{a.fullName}</option>
        ))}
      </select>
    );
  };

  return (
    <div className="space-y-3 rounded border p-3">
      {rows.length === 0 && <p className="text-sm text-gray-500">Схваток нет.</p>}
      {rows.map((r) => (
        <div key={r.id} className="space-y-1 border-b pb-2 last:border-b-0 last:pb-0">
          <div className="text-xs font-semibold text-gray-500">№{r.num} · {r.roundLabel}</div>
          {r.hasResult ? (
            <div className="text-sm">
              {nameOf(r.slotA.athleteId)} — {nameOf(r.slotB.athleteId)} → победитель: <b>{nameOf(r.winnerAthleteId)}</b>
              {r.winType ? <span className="text-gray-500"> ({WIN_TYPE_RU[r.winType] ?? r.winType})</span> : null}
            </div>
          ) : r.isBye ? (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span>Проход: <b>{nameOf(r.winnerAthleteId)}</b></span>
              {r.canReopenBye ? (
                <>
                  <select
                    value={byePick[r.id] ?? ""}
                    disabled={pending}
                    onChange={(e) => setByePick((s) => ({ ...s, [r.id]: e.target.value }))}
                    className="rounded border px-2 py-1 text-sm"
                  >
                    <option value="">— выберите соперника —</option>
                    {athletes.filter((a) => a.athleteId !== r.winnerAthleteId).map((a) => (
                      <option key={a.athleteId} value={a.athleteId}>{a.fullName}</option>
                    ))}
                  </select>
                  {confirmKey === `bye:${r.id}` ? (
                    <>
                      <button
                        disabled={pending}
                        onClick={() => run(() => reopenBye(r.id, byePick[r.id]))}
                        className="rounded bg-amber-600 px-2 py-0.5 text-xs font-semibold text-white disabled:opacity-50"
                      >
                        Подтвердить
                      </button>
                      <button type="button" disabled={pending} onClick={() => setConfirmKey(null)} className="rounded border px-2 py-0.5 text-xs">
                        Отмена
                      </button>
                    </>
                  ) : (
                    <button
                      disabled={pending || !byePick[r.id]}
                      onClick={() => setConfirmKey(`bye:${r.id}`)}
                      className="rounded bg-blue-600 px-2 py-0.5 text-xs text-white disabled:opacity-50"
                    >
                      Поставить соперника
                    </button>
                  )}
                </>
              ) : (
                <span className="text-xs text-gray-400">Следующая схватка сыграна — менять нельзя.</span>
              )}
            </div>
          ) : r.status === "PENDING" ? (
            <div className="flex flex-wrap items-center gap-2">
              {slotSelect(r, "A")}
              <span className="text-xs text-gray-400">vs</span>
              {slotSelect(r, "B")}
              {r.canWalkover &&
                (confirmKey === `wo:${r.id}` ? (
                  <>
                    <span className="text-xs text-amber-700">
                      Засчитать проход: <b>{nameOf(r.slotA.athleteId ?? r.slotB.athleteId)}</b> выигрывает без боя?
                    </span>
                    <button
                      disabled={pending}
                      onClick={() => run(() => walkover(r.id))}
                      className="rounded bg-amber-600 px-2 py-0.5 text-xs font-semibold text-white disabled:opacity-50"
                    >
                      Засчитать
                    </button>
                    <button type="button" disabled={pending} onClick={() => setConfirmKey(null)} className="rounded border px-2 py-0.5 text-xs">
                      Отмена
                    </button>
                  </>
                ) : (
                  <button
                    disabled={pending}
                    onClick={() => setConfirmKey(`wo:${r.id}`)}
                    className="rounded bg-blue-600 px-2 py-0.5 text-xs text-white disabled:opacity-50"
                  >
                    Проход
                  </button>
                ))}
            </div>
          ) : (
            <div className="text-sm text-gray-500">Завершена без результата.</div>
          )}
        </div>
      ))}
      {msg && <p className={`text-sm ${msg.ok ? "text-green-700" : "text-red-600"}`}>{msg.text}</p>}
    </div>
  );
}
