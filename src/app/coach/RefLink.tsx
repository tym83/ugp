"use client";
import { useState } from "react";

/** Персональная реф-ссылка тренера на событие. Кто зарегистрируется по ней —
 *  идёт тренеру в зачёт и получает скидку. */
export default function RefLink({ eventId, coachId }: { eventId: string; coachId: string }) {
  const path = `/register/${eventId}?ref=${coachId}`;
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    const url = typeof window !== "undefined" ? `${window.location.origin}${path}` : path;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard недоступен — тренер скопирует ссылку из поля вручную */
    }
  };

  return (
    <div className="rounded border bg-blue-50 p-3">
      <p className="text-sm font-semibold text-blue-900">Ваша ссылка-приглашение</p>
      <p className="text-xs text-blue-800 mb-2">
        Отправьте её ученикам: кто зарегистрируется по ней — попадёт в вашу команду и получит цену со скидкой.
      </p>
      <div className="flex gap-2">
        <input readOnly value={path} onFocus={(e) => e.currentTarget.select()} className="flex-1 rounded border px-2 py-1 text-sm bg-white" />
        <button type="button" onClick={copy} className="rounded bg-blue-600 px-3 py-1 text-sm text-white">
          {copied ? "Скопировано" : "Копировать"}
        </button>
      </div>
      <p className="mt-1 text-xs text-blue-700">Кнопка «Копировать» скопирует полную ссылку с адресом сайта.</p>
    </div>
  );
}
