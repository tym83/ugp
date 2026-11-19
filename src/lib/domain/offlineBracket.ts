// Offline bracket state: a snapshot of the event's brackets taken from the server, plus an
// outbox of results entered on this device. The local view is always "server snapshot + outbox
// replayed in order", so it converges with the server once the outbox is flushed.
// Advancement mirrors persistBracket.advanceWinner exactly.

export type SnapMatch = {
  id: string;
  round: number;
  pos: number;
  bronze: boolean;
  rr: boolean;
  mat: number | null;
  status: string;
  a: string | null;
  b: string | null;
  aFrom: string | null;
  bFrom: string | null;
  aWinner: boolean;
  bWinner: boolean;
  winner: string | null;
  loser: string | null;
  winType: string | null;
};

export type SnapCategory = {
  id: string;
  label: string;
  bracketType: string;
  athletes: Record<string, { name: string; club: string | null }>;
  matches: SnapMatch[];
};

export type Snapshot = {
  eventId: string;
  eventName: string;
  takenAt: string;
  categories: SnapCategory[];
};

export type OutboxItem = {
  cmid: string;
  categoryId: string;
  matchId: string;
  winnerAthleteId: string;
  winType: string;
  at: string;
};

export type Conflict = OutboxItem & { reason: string; serverWinner: string | null };

/** Whether a match can take a result: both slots filled and not finished. */
export function isPlayable(m: SnapMatch): boolean {
  return !!m.a && !!m.b && m.status !== "COMPLETED";
}

/** Apply one result to a category's matches (pure). Throws on an invalid result. */
export function applyResult(matches: SnapMatch[], matchId: string, winnerId: string, winType: string): SnapMatch[] {
  const m = matches.find((x) => x.id === matchId);
  if (!m) throw new Error("Матч не найден");
  if (m.status === "COMPLETED") throw new Error("Матч уже завершён");
  if (winnerId !== m.a && winnerId !== m.b) throw new Error("Победитель не участник этого матча");
  const loser = winnerId === m.a ? m.b : m.a;
  return matches.map((x) => {
    if (x.id === matchId) return { ...x, status: "COMPLETED", winner: winnerId, loser, winType };
    let next = x;
    if (x.aFrom === matchId) {
      const who = x.aWinner ? winnerId : loser;
      if (who) next = { ...next, a: who };
    }
    if (x.bFrom === matchId) {
      const who = x.bWinner ? winnerId : loser;
      if (who) next = { ...next, b: who };
    }
    return next;
  });
}

/** A local result can be undone while nothing downstream has been played. */
export function canUndo(matches: SnapMatch[], matchId: string): boolean {
  return !matches.some((d) => (d.aFrom === matchId || d.bFrom === matchId) && d.status === "COMPLETED");
}

/** Replay the outbox on top of a server snapshot.
 *  - result already on the server with the same winner → synced, dropped from the outbox;
 *  - already on the server with another winner, or no longer applicable → conflict. */
export function rebase(
  snapshot: Snapshot,
  outbox: OutboxItem[],
): { view: Snapshot; outbox: OutboxItem[]; conflicts: Conflict[] } {
  const cats = new Map(snapshot.categories.map((c) => [c.id, c]));
  const pending: OutboxItem[] = [];
  const conflicts: Conflict[] = [];
  for (const item of outbox) {
    const cat = cats.get(item.categoryId);
    const m = cat?.matches.find((x) => x.id === item.matchId);
    if (!cat || !m) {
      conflicts.push({ ...item, reason: "Сетку на сайте пересобрали — этого матча больше нет", serverWinner: null });
      continue;
    }
    if (m.status === "COMPLETED") {
      if (m.winner !== item.winnerAthleteId) {
        conflicts.push({ ...item, reason: "На сайте уже записан другой победитель", serverWinner: m.winner });
      }
      continue;
    }
    try {
      cats.set(cat.id, { ...cat, matches: applyResult(cat.matches, item.matchId, item.winnerAthleteId, item.winType) });
      pending.push(item);
    } catch (e) {
      conflicts.push({ ...item, reason: (e as Error).message, serverWinner: m.winner });
    }
  }
  return {
    view: { ...snapshot, categories: snapshot.categories.map((c) => cats.get(c.id)!) },
    outbox: pending,
    conflicts,
  };
}

/** Medal places of a category from its (local) matches. */
export function placesOf(cat: SnapCategory): { first: string | null; second: string | null; third: string[] } {
  if (cat.bracketType === "ROUND_ROBIN") {
    const wins = new Map<string, number>();
    for (const m of cat.matches) {
      for (const id of [m.a, m.b]) if (id && !wins.has(id)) wins.set(id, 0);
      if (m.status === "COMPLETED" && m.winner) wins.set(m.winner, (wins.get(m.winner) ?? 0) + 1);
    }
    const done = cat.matches.length > 0 && cat.matches.every((m) => m.status === "COMPLETED");
    if (!done) return { first: null, second: null, third: [] };
    const ranked = [...wins.entries()].sort((x, y) => y[1] - x[1]).map(([id]) => id);
    return { first: ranked[0] ?? null, second: ranked[1] ?? null, third: ranked[2] ? [ranked[2]] : [] };
  }
  const main = cat.matches.filter((m) => !m.bronze);
  if (!main.length) return { first: null, second: null, third: [] };
  const lastRound = Math.max(...main.map((m) => m.round));
  const final = main.find((m) => m.round === lastRound);
  const bronze = cat.matches.find((m) => m.bronze && m.status === "COMPLETED");
  return {
    first: final?.status === "COMPLETED" ? final.winner : null,
    second: final?.status === "COMPLETED" ? final.loser : null,
    third: bronze?.winner ? [bronze.winner] : [],
  };
}
