export type RoundRobinMatch = {
  a: string | null;
  b: string | null;
  winner: string | null;
  status: string;
  winType?: string | null;
};

export function bracketTypeForEntrants(count: number): "ROUND_ROBIN" | "SINGLE_ELIM" {
  return count === 3 ? "ROUND_ROBIN" : "SINGLE_ELIM";
}

export function parsePlacesOverride(value?: string | null): string[] | null {
  if (!value) return null;
  try {
    const ids: unknown = JSON.parse(value);
    return Array.isArray(ids) && ids.every((id) => typeof id === "string") ? ids : null;
  } catch {
    return null;
  }
}

export function roundRobinStats(matches: RoundRobinMatch[]) {
  const stats = new Map<string, { wins: number; submissions: number }>();
  for (const m of matches) for (const id of [m.a, m.b]) {
    if (id && !stats.has(id)) stats.set(id, { wins: 0, submissions: 0 });
  }
  for (const m of matches) {
    const row = m.winner ? stats.get(m.winner) : undefined;
    if (m.status === "COMPLETED" && row) {
      row.wins++;
      if (m.winType === "SUBMISSION") row.submissions++;
    }
  }
  return stats;
}

/** Unresolved groups occupy their ranking positions but receive no medals. */
export function rankRoundRobin(matches: RoundRobinMatch[], override?: string[] | null): {
  order: string[]; decided: boolean; tiedGroups: string[][];
} {
  const stats = roundRobinStats(matches);
  if (override && override.length === stats.size && new Set(override).size === stats.size && override.every((id) => stats.has(id))) {
    return { order: [...override], decided: true, tiedGroups: [] };
  }
  const order = [...stats.keys()].sort((a, b) => stats.get(b)!.wins - stats.get(a)!.wins || stats.get(b)!.submissions - stats.get(a)!.submissions || a.localeCompare(b));
  const groups: string[][] = [];
  for (const id of order) {
    const last = groups.at(-1);
    const prev = last && stats.get(last[0])!;
    const row = stats.get(id)!;
    if (prev && prev.wins === row.wins && prev.submissions === row.submissions) last!.push(id);
    else groups.push([id]);
  }
  const tiedGroups = groups.filter((g) => g.length > 1);
  return { order, decided: matches.length > 0 && matches.every((m) => m.status === "COMPLETED") && tiedGroups.length === 0, tiedGroups };
}
