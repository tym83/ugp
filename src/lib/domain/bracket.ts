// Генерация турнирных сеток: single-elimination (+ матч за 3-е место), round-robin.
// Чистые функции над абстрактными участниками — покрыто юнит-тестами.
// Слой API превращает MatchSpec[] в строки БД (Match), связывая slot*FromMatchId.

export type Participant = { id: string; clubId?: string | null; seed?: number };

export type SlotRef = { round: number; pos: number; winner: boolean }; // winner=false → проигравший (для бронзы)

export type MatchSpec = {
  round: number; // 1 = первый круг плей-офф; для RR — номер тура
  pos: number; // позиция в раунде (0-based)
  aId?: string | null; // участник напрямую (null = BYE)
  bId?: string | null;
  aFrom?: SlotRef; // либо ссылка на исход другого матча
  bFrom?: SlotRef;
  isBronze?: boolean;
  isRoundRobin?: boolean;
};

export type Bracket = {
  type: "SINGLE_ELIM" | "ROUND_ROBIN";
  size: number; // размер сетки (степень двойки для elim)
  matches: MatchSpec[];
  seededOrder: string[]; // порядок посева (id участников), byes = ""
};

/** Ближайшая степень двойки >= n */
export function nextPow2(n: number): number {
  let p = 1;
  while (p < n) p *= 2;
  return p;
}

/** Стандартный порядок посева для позиций сетки: раздвигает топ-сидов по разным половинам.
 * Возвращает массив seed-номеров (1-based) в порядке позиций сетки. */
export function seedPositions(size: number): number[] {
  let rounds = Math.log2(size);
  let pols: number[] = [1, 2];
  for (let r = 1; r < rounds; r++) {
    const next: number[] = [];
    const sum = pols.length * 2 + 1;
    for (const p of pols) {
      next.push(p);
      next.push(sum - p);
    }
    pols = next;
  }
  return pols;
}

/** Развод одноклубников: best-effort перестановка порядка так, чтобы соседние по сетке
 * (играющие в 1 круге) были из разных клубов, где возможно. Не гарантирует при переизбытке клуба. */
export function separateClubs(seeded: (Participant | null)[]): (Participant | null)[] {
  const arr = seeded.slice();
  const size = arr.length;
  // проходим по парам 1 круга (0-1, 2-3, ...) и, если конфликт клуба, ищем своп с дальней парой
  for (let i = 0; i < size; i += 2) {
    const a = arr[i], b = arr[i + 1];
    if (a && b && a.clubId && a.clubId === b.clubId) {
      // ищем кандидата на своп для позиции i+1 из другой пары, где нет конфликта
      for (let j = size - 1; j > i + 1; j--) {
        const cand = arr[j];
        const partnerIdx = j % 2 === 0 ? j + 1 : j - 1;
        const partner = arr[partnerIdx];
        if (!cand) continue;
        const noNewConflictHere = !cand.clubId || cand.clubId !== a.clubId;
        const noNewConflictThere = !partner || !b.clubId || partner.clubId !== b.clubId;
        if (noNewConflictHere && noNewConflictThere) {
          arr[i + 1] = cand;
          arr[j] = b;
          break;
        }
      }
    }
  }
  return arr;
}

/** Генерация single-elimination с BYE и (опц.) матчем за 3-е место. */
export function generateSingleElim(
  participants: Participant[],
  opts: { bronzeMode?: "SINGLE_MATCH_3RD" | "TWO_BRONZE" | "NONE"; separateClubs?: boolean } = {}
): Bracket {
  const bronzeMode = opts.bronzeMode ?? "SINGLE_MATCH_3RD";
  const n = participants.length;
  if (n < 2) {
    // вырожденный случай — 0/1 участник: сеток нет (1 → золото без боя обрабатывает вызывающий)
    return { type: "SINGLE_ELIM", size: nextPow2(Math.max(n, 1)), matches: [], seededOrder: participants.map((p) => p.id) };
  }
  const size = nextPow2(n);
  // сортируем по seed (если задан), иначе по исходному порядку
  const ordered = participants
    .map((p, i) => ({ p, seed: p.seed ?? i + 1 }))
    .sort((x, y) => x.seed - y.seed)
    .map((x) => x.p);

  // расставляем по позициям сетки согласно seedPositions
  const posOrder = seedPositions(size); // seed-номер на каждой позиции
  let slots: (Participant | null)[] = posOrder.map((seedNum) => ordered[seedNum - 1] ?? null);

  if (opts.separateClubs !== false) slots = separateClubs(slots);

  const matches: MatchSpec[] = [];
  const rounds = Math.log2(size);

  // Круг 1
  let round = 1;
  for (let pos = 0; pos < size / 2; pos++) {
    const a = slots[pos * 2];
    const b = slots[pos * 2 + 1];
    matches.push({ round, pos, aId: a ? a.id : null, bId: b ? b.id : null });
  }
  // Последующие круги — ссылки на победителей
  let prevRoundMatches = size / 2;
  for (round = 2; round <= rounds; round++) {
    const cnt = prevRoundMatches / 2;
    for (let pos = 0; pos < cnt; pos++) {
      matches.push({
        round,
        pos,
        aFrom: { round: round - 1, pos: pos * 2, winner: true },
        bFrom: { round: round - 1, pos: pos * 2 + 1, winner: true },
      });
    }
    prevRoundMatches = cnt;
  }

  // Матч за 3-е место: проигравшие полуфиналов (предпоследний круг, 2 матча)
  if (bronzeMode === "SINGLE_MATCH_3RD" && rounds >= 2) {
    const semiRound = rounds - 1;
    // полуфиналов должно быть ровно 2
    const semis = matches.filter((m) => m.round === semiRound);
    if (semis.length === 2) {
      matches.push({
        round: rounds, // тот же круг, что финал, но отдельный матч
        pos: 1, // финал pos 0, бронза pos 1
        isBronze: true,
        aFrom: { round: semiRound, pos: 0, winner: false },
        bFrom: { round: semiRound, pos: 1, winner: false },
      });
    }
  }

  return { type: "SINGLE_ELIM", size, matches, seededOrder: slots.map((s) => (s ? s.id : "")) };
}

/** Круговая система (round-robin) — все пары, метод круга по турам. */
export function generateRoundRobin(participants: Participant[]): Bracket {
  const ids = participants.map((p) => p.id);
  const arr = ids.slice();
  const bye = arr.length % 2 !== 0;
  if (bye) arr.push("__BYE__");
  const nn = arr.length;
  const rounds = nn - 1;
  const half = nn / 2;
  const matches: MatchSpec[] = [];
  const rot = arr.slice();
  for (let r = 0; r < rounds; r++) {
    let posInRound = 0;
    for (let i = 0; i < half; i++) {
      const a = rot[i];
      const b = rot[nn - 1 - i];
      if (a !== "__BYE__" && b !== "__BYE__") {
        matches.push({ round: r + 1, pos: posInRound++, aId: a, bId: b, isRoundRobin: true });
      }
    }
    // ротация (первый фиксирован)
    const fixed = rot[0];
    const rest = rot.slice(1);
    rest.unshift(rest.pop() as string);
    rot.splice(0, rot.length, fixed, ...rest);
  }
  return { type: "ROUND_ROBIN", size: ids.length, matches, seededOrder: ids };
}

export function generateBracket(
  participants: Participant[],
  type: "SINGLE_ELIM" | "ROUND_ROBIN",
  opts?: { bronzeMode?: "SINGLE_MATCH_3RD" | "TWO_BRONZE" | "NONE"; separateClubs?: boolean }
): Bracket {
  return type === "ROUND_ROBIN" ? generateRoundRobin(participants) : generateSingleElim(participants, opts);
}
