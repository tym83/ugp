// In-memory fixed-window rate limiter.
// ВНИМАНИЕ: состояние живёт в памяти процесса — работает только для single-instance
// (норм для VPS reg.ru). Для multi-instance / горизонтального масштабирования
// заменить хранилище на Redis (INCR + EXPIRE или sliding-window через ZSET).

type Window = { count: number; resetAt: number };

const store = new Map<string, Window>();

// Ленивая очистка протухших окон: чтобы Map не рос бесконечно при большом числе
// уникальных ключей. Таймеры не используем — прунимся при обращениях.
function prune(now: number): void {
  for (const [k, w] of store) {
    if (w.resetAt <= now) store.delete(k);
  }
}

let calls = 0;

/**
 * Fixed-window limiter. Возвращает { ok, retryAfterMs }.
 * ok=false → лимит исчерпан, retryAfterMs — сколько ждать до сброса окна.
 * Детерминирован, зависит только от Date.now().
 */
export function rateLimit(
  key: string,
  opts: { limit: number; windowMs: number },
): { ok: boolean; retryAfterMs: number } {
  const now = Date.now();

  // Периодически подметаем протухшие записи (раз в 1000 вызовов).
  if (++calls % 1000 === 0) prune(now);

  const w = store.get(key);
  if (!w || w.resetAt <= now) {
    store.set(key, { count: 1, resetAt: now + opts.windowMs });
    return { ok: true, retryAfterMs: 0 };
  }

  if (w.count >= opts.limit) {
    return { ok: false, retryAfterMs: Math.max(0, w.resetAt - now) };
  }

  w.count += 1;
  return { ok: true, retryAfterMs: 0 };
}
