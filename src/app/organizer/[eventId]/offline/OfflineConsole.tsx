"use client";

import RoundRobinStandings from "@/components/RoundRobinStandings";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { correctResultAction } from "@/app/actions";
import {
  applyResult,
  canUndo,
  isPlayable,
  placesOf,
  rebase,
  type Conflict,
  type OutboxItem,
  type SnapCategory,
  type SnapMatch,
  type Snapshot,
} from "@/lib/domain/offlineBracket";

const WIN_TYPES: { v: string; ru: string }[] = [
  { v: "SUBMISSION", ru: "Сдача" },
  { v: "POINTS", ru: "По очкам" },
  { v: "DECISION", ru: "Решением" },
  { v: "DQ", ru: "Дисквалификация" },
  { v: "NO_SHOW", ru: "Неявка" },
  { v: "INJURY", ru: "Травма" },
];
const SYNC_EVERY_MS = 15_000;
const CACHE = "ugp-offline-v1";

type Stored = { snapshot: Snapshot | null; outbox: OutboxItem[]; sent: string[]; conflicts: Conflict[] };

const storageKey = (eventId: string) => `ugp-offline-v1:${eventId}`;

function load(eventId: string): Stored {
  try {
    const raw = localStorage.getItem(storageKey(eventId));
    if (raw) return { sent: [], conflicts: [], outbox: [], snapshot: null, ...JSON.parse(raw) };
  } catch {
    /* storage unavailable — start empty */
  }
  return { snapshot: null, outbox: [], sent: [], conflicts: [] };
}

function save(eventId: string, s: Stored) {
  try {
    localStorage.setItem(storageKey(eventId), JSON.stringify(s));
  } catch {
    /* quota or private mode — the in-memory state still works */
  }
}

const time = (iso: string | null) =>
  iso ? new Date(iso).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "—";

/** Keep this page and its scripts in the browser cache so a reload works without internet. */
function cacheThisPage() {
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
  if (!("caches" in window)) return;
  const own = (u: string) => {
    try {
      const url = new URL(u, location.href);
      return url.origin === location.origin && url.pathname.startsWith("/_next/static/");
    } catch {
      return false;
    }
  };
  const assets = performance.getEntriesByType("resource").map((e) => e.name).filter(own);
  caches
    .open(CACHE)
    .then((c) => Promise.all([location.pathname, ...assets].map((u) => c.add(u).catch(() => {}))))
    .catch(() => {});
}

export default function OfflineConsole({ eventId, eventName }: { eventId: string; eventName: string }) {
  const [state, setState] = useState<Stored>({ snapshot: null, outbox: [], sent: [], conflicts: [] });
  const [ready, setReady] = useState(false);
  const [online, setOnline] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [authLost, setAuthLost] = useState(false);
  const [catId, setCatId] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [error, setError] = useState<string | null>(null);
  const stateRef = useRef(state);
  const syncingRef = useRef(false);

  const commit = useCallback(
    (next: Stored) => {
      stateRef.current = next;
      setState(next);
      save(eventId, next);
    },
    [eventId],
  );

  const sync = useCallback(async () => {
    if (syncingRef.current) return;
    syncingRef.current = true;
    setSyncing(true);
    const sent = new Set(stateRef.current.sent);
    try {
      for (const item of stateRef.current.outbox) {
        const res = await fetch("/api/result", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            matchId: item.matchId,
            winnerAthleteId: item.winnerAthleteId,
            winType: item.winType,
            clientMutationId: item.cmid,
          }),
        });
        if (res.status === 401 || res.status === 403) {
          setAuthLost(true);
          return;
        }
        // 409 = the site already has a result for this bout; the snapshot below sorts it out
        sent.add(item.cmid);
      }
      const res = await fetch(`/api/offline/snapshot?eventId=${encodeURIComponent(eventId)}`, { cache: "no-store" });
      if (res.status === 401 || res.status === 403) {
        setAuthLost(true);
        return;
      }
      if (!res.ok) throw new Error(`snapshot ${res.status}`);
      const snapshot: Snapshot = await res.json();
      const cur = stateRef.current;
      // results entered while this sync was running stay in the outbox
      const r = rebase(snapshot, cur.outbox);
      const known = new Set(cur.conflicts.map((c) => c.cmid));
      commit({
        snapshot,
        outbox: r.outbox,
        sent: [...sent].filter((id) => r.outbox.some((o) => o.cmid === id)),
        conflicts: [...cur.conflicts, ...r.conflicts.filter((c) => !known.has(c.cmid))],
      });
      setAuthLost(false);
      setOnline(true);
      setLastSync(new Date().toISOString());
    } catch {
      setOnline(false);
      // remember what already reached the site, so it is not offered for undo
      commit({ ...stateRef.current, sent: [...sent] });
    } finally {
      syncingRef.current = false;
      setSyncing(false);
    }
  }, [commit, eventId]);

  useEffect(() => {
    // localStorage exists only in the browser: read it after mount, then start syncing
    Promise.resolve().then(() => {
      const s = load(eventId);
      stateRef.current = s;
      setState(s);
      setReady(true);
      if (navigator.onLine) cacheThisPage();
      sync();
    });
    const t = setInterval(sync, SYNC_EVERY_MS);
    const on = () => sync();
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      clearInterval(t);
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, [eventId, sync]);

  const view = useMemo(() => (state.snapshot ? rebase(state.snapshot, state.outbox).view : null), [state]);
  const pendingByMatch = useMemo(() => new Map(state.outbox.map((o) => [o.matchId, o])), [state.outbox]);
  const pendingCats = useMemo(() => new Set(state.outbox.map((o) => o.categoryId)), [state.outbox]);

  const categories = view?.categories ?? [];
  const shown = categories.filter((c) => c.label.toLowerCase().includes(filter.trim().toLowerCase()));
  const cat = categories.find((c) => c.id === catId) ?? null;

  const enter = (category: SnapCategory, match: SnapMatch, winnerId: string, winType: string) => {
    try {
      applyResult(category.matches, match.id, winnerId, winType); // validate against the local view
    } catch (e) {
      setError((e as Error).message);
      return;
    }
    setError(null);
    const item: OutboxItem = {
      cmid: crypto.randomUUID(),
      categoryId: category.id,
      matchId: match.id,
      winnerAthleteId: winnerId,
      winType,
      at: new Date().toISOString(),
    };
    commit({ ...stateRef.current, outbox: [...stateRef.current.outbox, item] });
    sync();
  };

  const undo = (matchId: string) => {
    const cur = stateRef.current;
    commit({ ...cur, outbox: cur.outbox.filter((o) => o.matchId !== matchId) });
  };

  const dropConflict = (cmid: string) => {
    const cur = stateRef.current;
    commit({ ...cur, conflicts: cur.conflicts.filter((c) => c.cmid !== cmid) });
  };

  const forceMine = async (c: Conflict) => {
    const fd = new FormData();
    fd.set("matchId", c.matchId);
    fd.set("categoryId", c.categoryId);
    fd.set("winnerAthleteId", c.winnerAthleteId);
    fd.set("winType", c.winType);
    fd.set("reason", "офлайн-пульт организатора");
    try {
      const result = await correctResultAction(fd);
      if (!result.ok) throw new Error(result.msg);
      dropConflict(c.cmid);
      sync();
    } catch (e) {
      setError(`Не удалось перезаписать: ${(e as Error).message}`);
    }
  };

  const nameIn = (category: SnapCategory | null, id: string | null) =>
    id && category ? category.athletes[id]?.name ?? "?" : "—";

  if (!ready) return <p className="p-6 text-sm text-gray-500">Загрузка…</p>;

  return (
    <div className="space-y-4">
      <div className="sticky top-0 z-10 flex flex-wrap items-center gap-3 rounded border bg-white p-3 text-sm shadow-sm">
        <span className={`rounded px-2 py-0.5 font-semibold ${online ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}`}>
          {online ? "в сети" : "нет интернета — работаем локально"}
        </span>
        <span className="text-gray-600">сверено с сайтом: {time(lastSync ?? state.snapshot?.takenAt ?? null)}</span>
        <span className={state.outbox.length ? "font-semibold text-amber-700" : "text-gray-500"}>
          не отправлено: {state.outbox.length}
        </span>
        <button onClick={sync} disabled={syncing} className="rounded border px-3 py-1 disabled:opacity-50">
          {syncing ? "Синхронизация…" : "Синхронизировать"}
        </button>
        <a href={`/api/offline/xlsx?eventId=${encodeURIComponent(eventId)}`} className="rounded border px-3 py-1 text-blue-700">
          Скачать сетки в Excel
        </a>
        {authLost && (
          <a href={`/login?next=${encodeURIComponent(location.pathname)}`} className="font-semibold text-red-700">
            Сессия истекла — войдите снова (введённое не потеряется)
          </a>
        )}
      </div>

      {error && <p className="rounded bg-red-50 p-2 text-sm text-red-700">{error}</p>}

      {state.conflicts.length > 0 && (
        <div className="rounded border border-amber-400 bg-amber-50 p-3 text-sm">
          <p className="mb-2 font-semibold">Расхождения с сайтом ({state.conflicts.length})</p>
          <ul className="space-y-2">
            {state.conflicts.map((c) => {
              const cc = state.snapshot?.categories.find((x) => x.id === c.categoryId) ?? null;
              return (
                <li key={c.cmid} className="flex flex-wrap items-center gap-2">
                  <span>
                    {cc?.label ?? "категория"}: у вас победил <b>{nameIn(cc, c.winnerAthleteId)}</b>
                    {c.serverWinner ? (
                      <>
                        , на сайте — <b>{nameIn(cc, c.serverWinner)}</b>
                      </>
                    ) : null}{" "}
                    <span className="text-gray-500">({c.reason})</span>
                  </span>
                  {c.serverWinner && (
                    <button onClick={() => forceMine(c)} className="rounded bg-amber-600 px-2 py-0.5 text-white">
                      Записать мой
                    </button>
                  )}
                  <button onClick={() => dropConflict(c.cmid)} className="rounded border px-2 py-0.5">
                    Оставить как на сайте
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {!view && (
        <p className="text-sm text-gray-500">
          {online ? "Загружаем сетки с сайта…" : "Снимка сеток на этом устройстве нет — откройте страницу один раз с интернетом."}
        </p>
      )}

      {view && (
        <div className="grid gap-4 md:grid-cols-[18rem_1fr]">
          <aside className="space-y-2">
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="найти категорию"
              className="w-full rounded border px-2 py-1 text-sm"
            />
            {categories.length === 0 && <p className="text-sm text-gray-500">Сеток пока нет — их собирают в пульте организатора.</p>}
            <ul className="max-h-[70vh] space-y-1 overflow-y-auto text-sm">
              {shown.map((c) => {
                const done = c.matches.filter((m) => m.status === "COMPLETED").length;
                return (
                  <li key={c.id}>
                    <button
                      onClick={() => setCatId(c.id)}
                      className={`w-full rounded px-2 py-1 text-left ${c.id === catId ? "bg-blue-600 text-white" : "hover:bg-gray-100"}`}
                    >
                      {c.label}
                      {c.mat ? <span className="ml-1 rounded bg-amber-100 px-1 text-xs font-semibold text-amber-800">ковёр {c.mat}</span> : null}
                      <span className={`ml-1 text-xs ${c.id === catId ? "text-blue-100" : "text-gray-500"}`}>
                        {done}/{c.matches.length}
                        {pendingCats.has(c.id) ? " · не отправлено" : ""}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </aside>
          <section>
            {cat ? (
              <CategoryBracket
                cat={cat}
                pendingByMatch={pendingByMatch}
                sentCmids={new Set(state.sent)}
                onEnter={enter}
                onUndo={undo}
              />
            ) : (
              <p className="text-sm text-gray-500">Выберите категорию слева.</p>
            )}
          </section>
        </div>
      )}
      <p className="text-xs text-gray-400">{eventName}</p>
    </div>
  );
}

function CategoryBracket({
  cat,
  pendingByMatch,
  sentCmids,
  onEnter,
  onUndo,
}: {
  cat: SnapCategory;
  pendingByMatch: Map<string, OutboxItem>;
  sentCmids: Set<string>;
  onEnter: (c: SnapCategory, m: SnapMatch, winnerId: string, winType: string) => void;
  onUndo: (matchId: string) => void;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const main = cat.matches.filter((m) => !m.bronze);
  const rounds = [...new Set(main.map((m) => m.round))].sort((a, b) => a - b);
  const lastRound = rounds[rounds.length - 1] ?? 0;
  const bronze = cat.matches.filter((m) => m.bronze);
  const places = placesOf(cat);
  const who = (id: string | null) => (id ? cat.athletes[id] : null);
  const rr = cat.bracketType === "ROUND_ROBIN";

  const title = (r: number) => {
    if (rr) return `Тур ${r}`;
    const left = lastRound - r;
    return left === 0 ? "Финал" : left === 1 ? "Полуфинал" : left === 2 ? "1/4 финала" : `Круг ${r}`;
  };

  const slot = (m: SnapMatch, side: "a" | "b") => {
    const id = side === "a" ? m.a : m.b;
    const from = side === "a" ? m.aFrom : m.bFrom;
    const winnerSlot = side === "a" ? m.aWinner : m.bWinner;
    const a = who(id);
    const isWinner = !!id && m.winner === id;
    return (
      <div className={`px-2 py-1 ${isWinner ? "font-bold text-green-800" : ""}`}>
        {a ? (
          <>
            {a.name}
            {a.club && <span className="ml-1 text-xs font-normal text-gray-500">{a.club}</span>}
          </>
        ) : from ? (
          <span className="text-gray-400">{winnerSlot ? "ждёт победителя" : "ждёт проигравшего"}</span>
        ) : (
          <span className="text-gray-400">— проход без соперника</span>
        )}
      </div>
    );
  };

  const card = (m: SnapMatch) => {
    const pending = pendingByMatch.get(m.id);
    const playable = isPlayable(m);
    return (
      <div key={m.id} className={`rounded border text-sm ${pending ? "border-amber-400" : ""} ${playable ? "border-blue-300" : ""}`}>
        <div className="border-b">{slot(m, "a")}</div>
        {slot(m, "b")}
        <div className="flex flex-wrap items-center gap-2 border-t px-2 py-1 text-xs text-gray-500">
          {m.status === "COMPLETED" ? "завершена" : playable ? "можно вводить" : "ждёт"}
          {m.mat ? ` · ковёр ${m.mat}` : ""}
          {pending && <span className="font-semibold text-amber-700">{sentCmids.has(pending.cmid) ? "отправлено, ждём сайт" : "не отправлено"}</span>}
          {pending && !sentCmids.has(pending.cmid) && canUndo(cat.matches, m.id) && (
            <button onClick={() => onUndo(m.id)} className="text-red-700 underline">
              отменить
            </button>
          )}
          {playable && (
            <button onClick={() => setOpenId(openId === m.id ? null : m.id)} className="ml-auto rounded bg-blue-600 px-2 py-0.5 text-white">
              {openId === m.id ? "закрыть" : "результат"}
            </button>
          )}
        </div>
        {openId === m.id && playable && (
          <ResultForm
            m={m}
            names={[who(m.a)?.name ?? "A", who(m.b)?.name ?? "B"]}
            onSubmit={(winnerId, winType) => {
              setOpenId(null);
              onEnter(cat, m, winnerId, winType);
            }}
          />
        )}
      </div>
    );
  };

  return (
    <div>
      <h2 className="mb-1 text-lg font-semibold">{cat.label}</h2>
      <p className="mb-3 text-sm">
        🥇 {who(places.first)?.name ?? "—"} · 🥈 {who(places.second)?.name ?? "—"} · 🥉{" "}
        {places.third.map((id) => who(id)?.name).join(", ") || "—"}
      </p>
      {rr ? <>
        <div className="space-y-3">{cat.matches.map((m, i) => <div key={m.id}><h3>Схватка {i + 1}</h3>{card(m)}</div>)}</div>
        <RoundRobinStandings matches={cat.matches} override={cat.placesOverride} names={Object.fromEntries(Object.entries(cat.athletes).map(([id, a]) => [id, a.name]))} />
      </> : <div className="flex gap-4 overflow-x-auto pb-2">
        {rounds.map((r) => (
          <div key={r} className="min-w-[230px] space-y-3">
            <div className="text-xs font-semibold uppercase text-gray-500">{title(r)}</div>
            {main.filter((m) => m.round === r).sort((x, y) => x.pos - y.pos).map(card)}
          </div>
        ))}
        {bronze.length > 0 && (
          <div className="min-w-[230px] space-y-3">
            <div className="text-xs font-semibold uppercase text-amber-700">За 3-е место</div>
            {bronze.map(card)}
          </div>
        )}
      </div>}
    </div>
  );
}

function ResultForm({ m, names, onSubmit }: { m: SnapMatch; names: [string, string]; onSubmit: (winnerId: string, winType: string) => void }) {
  const [winner, setWinner] = useState<string | null>(null);
  const [winType, setWinType] = useState("SUBMISSION");
  return (
    <div className="space-y-2 border-t bg-blue-50 p-2">
      <div className="grid grid-cols-2 gap-2">
        {([m.a!, m.b!] as const).map((id, i) => (
          <button
            key={id}
            onClick={() => setWinner(id)}
            className={`rounded border px-2 py-2 text-left ${winner === id ? "border-green-700 bg-green-100 font-semibold" : "bg-white"}`}
          >
            {names[i]}
          </button>
        ))}
      </div>
      <select value={winType} onChange={(e) => setWinType(e.target.value)} className="w-full rounded border px-2 py-1">
        {WIN_TYPES.map((w) => (
          <option key={w.v} value={w.v}>
            {w.ru}
          </option>
        ))}
      </select>
      <button
        disabled={!winner}
        onClick={() => winner && onSubmit(winner, winType)}
        className="w-full rounded bg-green-700 px-3 py-2 font-semibold text-white disabled:opacity-40"
      >
        {winner ? `Победил: ${names[winner === m.a ? 0 : 1]}` : "Выберите победителя"}
      </button>
    </div>
  );
}
