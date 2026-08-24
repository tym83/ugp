// Объединение малых категорий (<3) с hard-constraints.
// Нельзя: смешивать пол, дисциплину, возрастные «полосы» (дети/юниоры/взрослые/ветераны).

export type AgeBand = "kids" | "juniors" | "adults" | "veterans";

export function ageBand(code: string): AgeBand {
  if (code.startsWith("kids")) return "kids";
  if (code.startsWith("juniors")) return "juniors";
  if (code.startsWith("veterans")) return "veterans";
  return "adults";
}

export type MergeCat = {
  id: string;
  sex: "M" | "F";
  discipline: "gi" | "nogi";
  ageGroupCode: string;
  weightMax: number | null; // «до N»; null = открытая сверху
  isOpenTop: boolean;
  isAbsolute: boolean;
  count: number; // сколько допущенных участников
  minParticipants: number;
};

/** Жёсткая проверка: можно ли объединять a → b. */
export function canMerge(a: MergeCat, b: MergeCat): boolean {
  if (a.id === b.id) return false;
  if (a.isAbsolute || b.isAbsolute) return false;
  if (a.sex !== b.sex) return false;
  if (a.discipline !== b.discipline) return false;
  if (ageBand(a.ageGroupCode) !== ageBand(b.ageGroupCode)) return false; // дети не с взрослыми
  return true;
}

/** Категории, которым нужно объединение (мало участников, ещё не пустые). */
export function needsMerge(cats: MergeCat[]): MergeCat[] {
  return cats.filter((c) => !c.isAbsolute && c.count > 0 && c.count < c.minParticipants);
}

/** Предложить цель объединения: ближайшая СТАРШАЯ по весу совместимая категория. */
export function suggestMergeTarget(a: MergeCat, all: MergeCat[]): MergeCat | null {
  const candidates = all
    .filter((b) => canMerge(a, b))
    .filter((b) => {
      // «более высокая»: открытая сверху всегда выше; иначе больший weightMax
      if (b.isOpenTop) return true;
      if (a.weightMax == null) return false;
      return (b.weightMax ?? 1e9) > a.weightMax;
    })
    .sort((x, y) => {
      const wx = x.isOpenTop ? 1e9 : x.weightMax ?? 1e9;
      const wy = y.isOpenTop ? 1e9 : y.weightMax ?? 1e9;
      return wx - wy; // ближайшая сверху
    });
  return candidates[0] ?? null;
}
