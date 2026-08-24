// Командный зачёт: очки клубам по местам + бонусы. Таблица очков конфигурируема.

export type PlacePoints = { first: number; second: number; third: number };
export const DEFAULT_PLACE_POINTS: PlacePoints = { first: 9, second: 3, third: 1 };

export type Placement = {
  clubId: string;
  clubName: string;
  place: 1 | 2 | 3;
  isAbsolute?: boolean;
  submissions?: number; // кол-во побед сабмишеном по пути (для бонуса)
};

export type ScoreConfig = {
  placePoints: PlacePoints;
  submissionBonus: number; // очки за каждый сабмишен
  absoluteMultiplier: number; // множитель для абсолютки
};

export const DEFAULT_SCORE_CONFIG: ScoreConfig = {
  placePoints: DEFAULT_PLACE_POINTS,
  submissionBonus: 0,
  absoluteMultiplier: 1,
};

export type ClubScore = { clubId: string; clubName: string; points: number; place: number };

export function computeTeamScores(placements: Placement[], cfg: ScoreConfig = DEFAULT_SCORE_CONFIG): ClubScore[] {
  const map = new Map<string, ClubScore>();
  for (const p of placements) {
    const base =
      p.place === 1 ? cfg.placePoints.first : p.place === 2 ? cfg.placePoints.second : cfg.placePoints.third;
    const mult = p.isAbsolute ? cfg.absoluteMultiplier : 1;
    const bonus = (p.submissions ?? 0) * cfg.submissionBonus;
    const pts = base * mult + bonus;
    const cur = map.get(p.clubId) ?? { clubId: p.clubId, clubName: p.clubName, points: 0, place: 0 };
    cur.points += pts;
    map.set(p.clubId, cur);
  }
  const arr = Array.from(map.values()).sort((a, b) => b.points - a.points);
  // проставляем места (с учётом равенства)
  let place = 0;
  let prev: number | null = null;
  arr.forEach((c, i) => {
    if (prev === null || c.points !== prev) place = i + 1;
    c.place = place;
    prev = c.points;
  });
  return arr;
}
