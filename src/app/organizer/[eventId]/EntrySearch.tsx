"use client";
import { useState } from "react";

const norm = (s: string) => s.toLowerCase().replace(/ё/g, "е");

// Фильтр таблицы заявок по ФИО: каждое слово запроса должно встретиться в имени, порядок любой.
// Строки помечены data-entry-name на сервере — прячем их прямо в DOM, без перерисовки таблицы.
export default function EntrySearch({ tableId }: { tableId: string }) {
  const [q, setQ] = useState("");
  const [shown, setShown] = useState<number | null>(null);

  const filter = (value: string) => {
    setQ(value);
    const words = norm(value).split(/\s+/).filter(Boolean);
    const rows = document.querySelectorAll<HTMLElement>(`#${tableId} [data-entry-name]`);
    let n = 0;
    rows.forEach((row) => {
      const match = words.every((w) => norm(row.dataset.entryName ?? "").includes(w));
      row.hidden = !match;
      if (match) n++;
    });
    setShown(words.length ? n : null);
  };

  return (
    <div className="mb-2 flex items-center gap-2">
      <input
        type="search"
        value={q}
        onChange={(e) => filter(e.target.value)}
        placeholder="Поиск по ФИО"
        className="w-full max-w-xs rounded border px-2 py-1 text-sm"
      />
      {shown !== null && <span className="text-xs text-gray-500">найдено {shown}</span>}
    </div>
  );
}
