"use client";
import { useEffect, useRef, useState } from "react";

type ApiMatch = {
  id: string;
  round: number;
  pos: number;
  bronze: boolean;
  status: string;
  a: { id: string; name?: string } | null;
  b: { id: string; name?: string } | null;
  winner: { id: string; name?: string } | null;
};

const statusRu: Record<string, string> = {
  PENDING: "ожидает",
  READY: "готов",
  LIVE: "идёт",
  COMPLETED: "завершён",
  DONE: "завершён",
};

export default function LiveMatches({ categoryId }: { categoryId: string }) {
  const [matches, setMatches] = useState<ApiMatch[] | null>(null);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const [ago, setAgo] = useState(0);
  const [error, setError] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const res = await fetch(`/api/matches?categoryId=${categoryId}`, { cache: "no-store" });
        if (!res.ok) throw new Error();
        const data: ApiMatch[] = await res.json();
        if (!alive) return;
        setMatches(data);
        setUpdatedAt(Date.now());
        setError(false);
      } catch {
        if (alive) setError(true);
      }
    };
    load();
    const poll = setInterval(load, 7000);
    return () => { alive = false; clearInterval(poll); };
  }, [categoryId]);

  useEffect(() => {
    timer.current = setInterval(() => {
      if (updatedAt) setAgo(Math.round((Date.now() - updatedAt) / 1000));
    }, 1000);
    return () => { if (timer.current) clearInterval(timer.current); };
  }, [updatedAt]);

  const live = (matches ?? []).filter((m) => m.status !== "COMPLETED" && m.status !== "DONE" && m.a && m.b);

  return (
    <div className="rounded border p-3 text-sm">
      <div className="flex items-center justify-between mb-2">
        <span className="font-semibold">Живой статус</span>
        <span className="text-xs text-gray-400">
          {error ? "нет связи" : updatedAt ? `обновлено ${ago} c назад` : "загрузка…"}
        </span>
      </div>
      {matches && live.length === 0 && <p className="text-gray-500">Активных схваток нет.</p>}
      <ul className="space-y-1">
        {live.map((m) => (
          <li key={m.id} className="flex justify-between">
            <span>{m.a?.name ?? "?"} — {m.b?.name ?? "?"}</span>
            <span className="text-xs text-gray-500">{statusRu[m.status] ?? m.status}{m.bronze ? " · бронза" : ` · круг ${m.round}`}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
