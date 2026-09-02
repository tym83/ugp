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

// ─────────────────────────────────────────────────────────────────────────────
// Само-выбор категорий (self-select). Модель: атлет сам выбирает категории из списка.
// Вес/пояс НЕ определяют категорию автоматически. Пояс в логике не участвует вовсе
// (он лишь в названии категории). Жёсткие границы: пол и дети↔взрослые.
// ─────────────────────────────────────────────────────────────────────────────

/** Категория для листинга при регистрации (нужен ageGroupCode для границы дети/взрослые). */
export type SelectableCat = Cat & { ageGroupCode: string };

function isKidsCode(code: string): boolean {
  return code.startsWith("kids");
}

/** Атлет считается ребёнком, если его год рождения попадает в диапазон какой-либо ДЕТСКОЙ категории события. */
export function athleteIsKid(birthYear: number, cats: SelectableCat[]): boolean {
  return cats.some((c) => isKidsCode(c.ageGroupCode) && birthYear >= c.birthYearFrom && birthYear <= c.birthYearTo);
}

/** Полный список категорий, доступных атлету по ЖЁСТКИМ правилам (для серверной проверки и режима «Показать все»):
 *  совпадает пол; ребёнку — только его детские группы; взрослому/юниору — любые НЕ детские. Вес и пояс не ограничивают. */
export function allowedCategories(a: { sex: "M" | "F"; birthYear: number }, cats: SelectableCat[]): SelectableCat[] {
  const kid = athleteIsKid(a.birthYear, cats);
  return cats.filter((c) => {
    if (c.sex !== a.sex) return false;
    const catKids = isKidsCode(c.ageGroupCode);
    if (kid) return catKids && a.birthYear >= c.birthYearFrom && a.birthYear <= c.birthYearTo;
    return !catKids;
  });
}

/** Суженный список по умолчанию: из allowed, весовые — окном ±2 шага вокруг веса атлета
 *  (внутри группы age+discipline). Абсолютки/open-top показываем всегда. Без веса — не сужаем. */
export function suggestedCategories(
  a: { sex: "M" | "F"; birthYear: number; weight?: number | null },
  cats: SelectableCat[]
): SelectableCat[] {
  const allowed = allowedCategories(a, cats);
  const w = a.weight;
  if (w == null || !Number.isFinite(w)) return allowed;

  const groups = new Map<string, SelectableCat[]>();
  for (const c of allowed) {
    if (c.isAbsolute || c.isOpenTop) continue;
    const key = `${c.ageGroupCode}|${c.discipline}`;
    const arr = groups.get(key) ?? [];
    arr.push(c);
    groups.set(key, arr);
  }
  const keep = new Set<string>();
  for (const list of groups.values()) {
    const sorted = list.slice().sort((x, y) => (x.weightMax ?? 1e9) - (y.weightMax ?? 1e9));
    let idx = sorted.findIndex((c) => weightFits(w, c));
    if (idx < 0) idx = sorted.findIndex((c) => (c.weightMax ?? 1e9) >= w);
    if (idx < 0) idx = sorted.length - 1;
    for (let i = Math.max(0, idx - 2); i <= Math.min(sorted.length - 1, idx + 2); i++) keep.add(sorted[i].id);
  }
  return allowed.filter((c) => c.isAbsolute || c.isOpenTop || keep.has(c.id));
}
