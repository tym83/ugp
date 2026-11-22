"use client";
import { useState, useTransition } from "react";
import { restoreRegistration } from "@/app/organizer-actions";

/** Вернуть снятую регистрацию обратно в заявку («не взвешен») — из любого места, где она видна. */
export default function RestoreRegistrationButton({ registrationId }: { registrationId: string }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <span className="inline-flex items-center gap-1">
      <button
        type="button"
        disabled={pending}
        onClick={() => start(async () => {
          const r = await restoreRegistration(registrationId);
          setMsg(r.ok ? "✓" : r.msg);
        })}
        className="text-blue-600 disabled:opacity-50"
      >
        {pending ? "…" : "вернуть"}
      </button>
      {msg && <span className="text-gray-500">{msg}</span>}
    </span>
  );
}
