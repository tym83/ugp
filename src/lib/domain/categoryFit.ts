// Fit check between a category and an athlete: sex, birth year band, weight.
// Pure function; messages are Russian (shown to organizers in the UI).

export type FitCategory = {
  sex: string;
  birthYearFrom: number;
  birthYearTo: number;
  weightMin: number | null; // exclusive lower bound; null = none
  weightMax: number | null; // inclusive "up to N kg"; null = open top
  isOpenTop: boolean;
  isAbsolute: boolean;
};

export type FitAthlete = {
  sex: string;
  birthYear: number;
  weight: number | null; // null = unknown, weight check skipped
};

/** Russian mismatch reasons; empty array means the athlete fits the category. */
export function categoryMismatches(cat: FitCategory, athlete: FitAthlete): string[] {
  const reasons: string[] = [];
  if (athlete.sex !== cat.sex) {
    const catSex = cat.sex === "M" ? "мужчины" : "женщины";
    const who = athlete.sex === "M" ? "участник — мужчина" : "участница — женщина";
    reasons.push(`пол: в категории ${catSex}, ${who}`);
  }
  if (athlete.birthYear < cat.birthYearFrom || athlete.birthYear > cat.birthYearTo) {
    reasons.push(`год рождения ${athlete.birthYear} вне ${cat.birthYearFrom}–${cat.birthYearTo}`);
  }
  if (athlete.weight != null && !cat.isAbsolute) {
    const w = athlete.weight;
    const lowOk = cat.weightMin == null || w > cat.weightMin;
    const highOk = cat.isOpenTop || cat.weightMax == null || w <= cat.weightMax;
    if (!lowOk) {
      reasons.push(`вес ${w} кг не больше ${cat.weightMin} кг (категория свыше ${cat.weightMin})`);
    } else if (!highOk && cat.weightMax != null) {
      reasons.push(`вес ${w} кг больше ${cat.weightMax} кг`);
    }
  }
  return reasons;
}
