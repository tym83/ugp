"use client";
import { useEffect, useState } from "react";

/** Обратный отсчёт до закрытия регистрации. target — ISO-строка. */
export default function Countdown({ target, label = "до закрытия регистрации" }: { target: string; label?: string }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const diff = new Date(target).getTime() - now;
  if (Number.isNaN(diff)) return null;
  if (diff <= 0) return <span className="text-sm text-red-600">регистрация закрыта</span>;

  const d = Math.floor(diff / 86400000);
  const h = Math.floor((diff % 86400000) / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  const s = Math.floor((diff % 60000) / 1000);

  return (
    <span className="text-sm font-mono">
      {label}: {d > 0 ? `${d}д ` : ""}{String(h).padStart(2, "0")}:{String(m).padStart(2, "0")}:{String(s).padStart(2, "0")}
    </span>
  );
}
