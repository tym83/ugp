"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { searchEventParticipants } from "@/app/athlete-actions";

type Row = Awaited<ReturnType<typeof searchEventParticipants>>[number];

export default function EventSearch({ eventId }: { eventId: string }) {
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [searched, setSearched] = useState(false);
  const [pending, start] = useTransition();

  const run = () =>
    start(async () => {
      const r = await searchEventParticipants(eventId, q);
      setRows(r);
      setSearched(true);
    });

  return (
    <div>
      <form onSubmit={(e) => { e.preventDefault(); run(); }} className="flex gap-2">
        <input value={q} onChange={(e) => setQ(e.target.value)}
          placeholder="Участник или клуб" className="flex-1 border rounded px-3 py-2 text-sm" />
        <button disabled={pending || q.trim().length < 2} className="rounded bg-gray-800 px-3 py-2 text-white text-sm disabled:opacity-50">
          {pending ? "…" : "Найти"}
        </button>
      </form>
      {searched && rows.length === 0 && <p className="mt-2 text-sm text-gray-500">Ничего не найдено.</p>}
      {rows.length > 0 && (
        <ul className="mt-2 space-y-1 text-sm">
          {rows.map((r, i) => (
            <li key={i}>
              <Link href={`/category/${r.categoryId}`} className="text-blue-600">{r.athlete}</Link>
              <span className="text-gray-400"> · {r.club ?? "—"} · {r.category}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
