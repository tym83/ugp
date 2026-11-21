"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveBracket } from "@/app/roster-actions";

/** Build or rebuild a category bracket and report the outcome inline (no error page on refusal). */
export default function RebuildBracketButton({ categoryId, hasBracket, className }: { categoryId: string; hasBracket: boolean; className: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <button
        disabled={pending}
        onClick={() =>
          start(async () => {
            try {
              const r = await saveBracket(categoryId);
              setMsg({ ok: r.ok, text: r.ok ? (hasBracket ? "Сетка пересобрана" : r.msg) : r.msg });
              if (r.ok) router.refresh();
            } catch (e) {
              setMsg({ ok: false, text: (e as Error).message || "Не удалось собрать сетку" });
            }
          })
        }
        className={`${className} disabled:opacity-50`}
      >
        {pending ? "…" : hasBracket ? "Пересобрать сетку" : "Сгенерировать сетку"}
      </button>
      {msg && <span className={`text-xs ${msg.ok ? "text-green-600" : "text-red-600"}`}>{msg.text}</span>}
    </span>
  );
}
