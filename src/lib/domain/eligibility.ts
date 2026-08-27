// Допуск атлета к категории: пол, дисциплина, возрастная группа (+ play-up вверх), вес.

export type Cat = {
  id: string;
  sex: "M" | "F";
  discipline: "gi" | "nogi";
  birthYearFrom: number; // младший год (напр. 2019)
  birthYearTo: number; // старший год (напр. 2020) — та же группа
  weightMin: number | null; // нижняя граница (исключительно); null = нет
  weightMax: number | null; // «до N кг» (включительно); null = открытая сверху
  isOpenTop: boolean;
  isAbsolute: boolean;
  level?: string;
};

export function weightFits(weight: number, cat: Cat): boolean {
  if (cat.isAbsolute) return true;
  if (cat.isOpenTop) return cat.weightMin == null ? true : weight > cat.weightMin;
  if (cat.weightMax == null) return false;
  const lowOk = cat.weightMin == null || weight > cat.weightMin;
  return lowOk && weight <= cat.weightMax;
}

/** Возрастная группа: своя, если год рождения в [from,to].
 * play-up: младший (более поздний г.р.) может выступать в СТАРШЕЙ группе (год < своего from). */
export function ageEligible(birthYear: number, cat: Cat, allowPlayUp: boolean): boolean {
  const own = birthYear >= cat.birthYearFrom && birthYear <= cat.birthYearTo;
  if (own) return true;
  if (allowPlayUp) {
    // старшая группа = более ранние годы → её birthYearTo < наш birthYear
    return cat.birthYearTo < birthYear; // мы младше верхней границы группы → играем вверх
  }
  return false;
}

export type AthleteInfo = {
  sex: "M" | "F";
  birthYear: number;
  weight: number;
  level?: string | null; // пояс/уровень (gi belt или novice/…); null → только категории «all»
};

/** Категория подходит по уровню: без уровня/«all», либо совпадает с уровнем атлета. */
function levelFits(cat: Cat, level: string | null | undefined): boolean {
  if (!cat.level || cat.level === "all") return true;
  return cat.level === level;
}

/** Категории (не-абсолютные), в которые атлет может заявиться в конкретной дисциплине.
 *  Своя возрастная группа приоритетна; play-up — только в БЛИЖАЙШУЮ старшую группу,
 *  не «в любую старшую» (иначе ребёнок 2016 попал бы во взрослых). */
export function eligibleCategories(
  a: AthleteInfo,
  discipline: "gi" | "nogi",
  cats: Cat[],
  opts: { allowPlayUp?: boolean } = {}
): Cat[] {
  const playUp = opts.allowPlayUp ?? false;
  const pool = cats.filter(
    (c) => !c.isAbsolute && c.discipline === discipline && c.sex === a.sex && weightFits(a.weight, c) && levelFits(c, a.level)
  );
  const own = pool.filter((c) => ageEligible(a.birthYear, c, false));
  if (own.length || !playUp) return own;
  // play-up: только ближайшая старшая группа (максимальный birthYearTo среди тех, что старше нас)
  const older = pool.filter((c) => c.birthYearTo < a.birthYear);
  if (!older.length) return [];
  const nearestTo = Math.max(...older.map((c) => c.birthYearTo));
  return older.filter((c) => c.birthYearTo === nearestTo);
}

/** «Родная» категория (своя возрастная группа + подходящий вес) — приоритетно одна.
 *  При allowPlayUp и отсутствии своей — ближайшая старшая (для перевесов у юниоров без openTop). */
export function nativeCategory(
  a: AthleteInfo,
  discipline: "gi" | "nogi",
  cats: Cat[],
  opts: { allowPlayUp?: boolean } = {}
): Cat | null {
  const el = eligibleCategories(a, discipline, cats, opts);
  // если несколько по весу — берём с минимальным подходящим weightMax
  return el.sort((x, y) => (x.weightMax ?? 1e9) - (y.weightMax ?? 1e9))[0] ?? null;
}
