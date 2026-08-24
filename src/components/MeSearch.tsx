"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { findMyEntries } from "@/app/athlete-actions";

type Row = Awaited<ReturnType<typeof findMyEntries>>[number];

export default function MeSearch() {
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [searched, setSearched] = useState(false);
  const [pending, start] = useTransition();

  const run = () =>
    start(async () => {
      const r = await findMyEntries(q);
      setRows(r);
      setSearched(true);
    });

  return (
    <div>
      <form
        onSubmit={(e) => { e.preventDefault(); run(); }}
        className="flex gap-2"
      >
        <input value={q} onChange={(e) => setQ(e.target.value)}
          placeholder="Иванов Иван" className="flex-1 border rounded px-3 py-2" />
        <button disabled={pending || q.trim().length < 2} className="rounded bg-blue-600 px-4 py-2 text-white disabled:opacity-50">
          {pending ? "…" : "Найти"}
        </button>
      </form>

      {searched && rows.length === 0 && <p className="mt-4 text-sm text-gray-500">Ничего не найдено.</p>}

      <ul className="mt-4 space-y-3">
        {rows.map((a) => (
          <li key={a.id} className="rounded border p-3">
            <div className="font-semibold">{a.fullName}</div>
            {a.club && <div className="text-xs text-gray-500">{a.club}</div>}
            <div className="mt-2 flex flex-wrap gap-2 text-xs">
              <Link href={`/me?athleteId=${a.id}`} className="text-blue-600">мои схватки →</Link>
              {a.categories.map((c) => (
                <Link key={c.id} href={`/category/${c.id}`} className="rounded bg-gray-100 px-2 py-0.5 text-gray-700">
                  {c.label}
                </Link>
              ))}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
