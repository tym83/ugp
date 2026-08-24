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
};

/** Категории (не-абсолютные), в которые атлет может заявиться в конкретной дисциплине. */
export function eligibleCategories(
  a: AthleteInfo,
  discipline: "gi" | "nogi",
  cats: Cat[],
  opts: { allowPlayUp?: boolean } = {}
): Cat[] {
  const playUp = opts.allowPlayUp ?? false;
  return cats.filter(
    (c) =>
      !c.isAbsolute &&
      c.discipline === discipline &&
      c.sex === a.sex &&
      ageEligible(a.birthYear, c, playUp) &&
      weightFits(a.weight, c)
  );
}

/** «Родная» категория (своя возрастная группа + подходящий вес) — приоритетно одна. */
export function nativeCategory(a: AthleteInfo, discipline: "gi" | "nogi", cats: Cat[]): Cat | null {
  const own = eligibleCategories(a, discipline, cats, { allowPlayUp: false });
  // если несколько по весу (не должно) — берём с минимальным подходящим weightMax
  return own.sort((x, y) => (x.weightMax ?? 1e9) - (y.weightMax ?? 1e9))[0] ?? null;
}
