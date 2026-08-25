"use client";
import { useState, useTransition } from "react";
import {
  addToAbsolute,
  generateAbsoluteBracket,
  absoluteRoster,
  type AbsoluteRosterRow,
  type AbsoluteCandidate,
} from "@/app/organizer-actions";

type Props = {
  categoryId: string;
  label: string;
  roster: AbsoluteRosterRow[];
  candidates: AbsoluteCandidate[];
  hasBracket: boolean;
};

export default function AbsolutePanel({ categoryId, label, roster, candidates, hasBracket }: Props) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [cands, setCands] = useState<AbsoluteCandidate[]>(candidates);

  const refresh = async (q: string) => {
    const { candidates: c } = await absoluteRoster(categoryId, q);
    setCands(c);
  };

  return (
    <div className="rounded border">
      <div className="flex items-center justify-between bg-amber-50 px-3 py-2">
        <span className="font-medium">Абсолютка · {label}</span>
        <button
          disabled={pending}
          onClick={() => start(async () => setMsg((await generateAbsoluteBracket(categoryId)).msg))}
          className="rounded bg-amber-600 px-3 py-1 text-xs text-white disabled:opacity-50"
        >
          {pending ? "…" : hasBracket ? "Пересверстать сетку абсолютки" : "Сверстать сетку абсолютки"}
        </button>
      </div>

      <div className="p-3 space-y-3">
        <div>
          <div className="text-xs font-semibold text-gray-500 mb-1">Ростер ({roster.length})</div>
          {roster.length ? (
            <ul className="text-sm space-y-0.5">
              {roster.map((r) => (
                <li key={r.registrationId}>
                  {r.fullName} <span className="text-gray-400">({r.clubName ?? "—"}) · {r.status}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-gray-400">Пусто</p>
          )}
        </div>

        <div>
          <div className="text-xs font-semibold text-gray-500 mb-1">Добавить атлета события</div>
          <input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              start(async () => refresh(e.target.value));
            }}
            placeholder="поиск по имени…"
            className="mb-1 w-full rounded border px-2 py-1 text-sm"
          />
          <ul className="max-h-48 overflow-y-auto text-sm">
            {cands.map((c) => (
              <li key={c.athleteId} className="flex items-center justify-between border-t py-0.5">
                <span>
                  {c.fullName} <span className="text-gray-400">({c.clubName ?? "—"})</span>
                </span>
                <button
                  disabled={pending}
                  onClick={() =>
                    start(async () => {
                      const r = await addToAbsolute(categoryId, c.athleteId);
                      setMsg(r.msg);
                      if (r.ok) await refresh(query);
                    })
                  }
                  className="rounded bg-blue-600 px-2 py-0.5 text-xs text-white disabled:opacity-50"
                >
                  добавить
                </button>
              </li>
            ))}
            {cands.length === 0 && <li className="py-1 text-gray-400">Нет кандидатов</li>}
          </ul>
        </div>

        {msg && <p className="text-xs text-gray-600">{msg}</p>}
      </div>
    </div>
  );
}
