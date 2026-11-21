"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { markRefund } from "@/app/organizer-actions";
import { REFUND_LABEL, type RefundStatus } from "@/lib/domain/dropoutRefund";

export default function RefundSelect({ eventId, entryId, status }: { eventId: string; entryId: string; status: RefundStatus }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const router = useRouter();
  return (
    <div>
      <select aria-label="Статус возврата" className="rounded border px-2 py-1" value={status} disabled={pending} onChange={(event) => {
        const next = event.target.value as RefundStatus;
        setError("");
        startTransition(async () => {
          try {
            const result = await markRefund(eventId, entryId, next);
            if (!result.ok) setError(result.msg);
            else router.refresh();
          } catch {
            setError("Не удалось сохранить статус возврата");
          }
        });
      }}>
        {Object.entries(REFUND_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select>
      {pending && <span className="ml-2 text-xs" role="status">Сохранение…</span>}
      {error && <p role="alert" className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
