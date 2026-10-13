// Пресет категорий события «Андеграунд Грэпплинг Танкоград» (из положения v2).
// Разворачивается в категории для обеих дисциплин (gi/nogi). weightMin считается от предыдущего класса.

type Group = {
  code: string;
  label: string;
  from: number; // birthYearFrom (ранний год)
  to: number; // birthYearTo (поздний год)
  rule: "AGP" | "SUBMISSION_ONLY";
  m: number[]; // веса мальчиков/мужчин («до N»)
  f: number[]; // веса девочек/женщин («до N»)
  mOpenTop?: boolean; // добавить «свыше <последний вес>»
  fOpenTop?: boolean;
  // split: у взрослых/ветеранов весовые дублируются на «новичков» и «опытных».
  split?: boolean;
};

// Флаг openTop добавляет после списка категорию «свыше <последний вес>».
const GROUPS: Group[] = [
  { code: "kids-2019-2020", label: "Дети 2019–2020", from: 2019, to: 2020, rule: "AGP",
    m: [18, 20, 23, 26, 30, 34, 38, 46], f: [17, 19, 22, 25, 29, 33, 37, 44] },
  { code: "kids-2017-2018", label: "Дети 2017–2018", from: 2017, to: 2018, rule: "AGP",
    m: [21, 24, 27, 30, 34, 38, 42, 50], f: [20, 22, 25, 28, 32, 36, 40, 48] },
  { code: "kids-2015-2016", label: "Дети 2015–2016", from: 2015, to: 2016, rule: "AGP",
    m: [24, 27, 30, 34, 38, 42, 46, 50, 62], f: [22, 25, 28, 32, 36, 40, 44, 48, 60] },
  { code: "kids-2013-2014", label: "Дети 2013–2014", from: 2013, to: 2014, rule: "AGP",
    m: [34, 37, 41, 45, 50, 55, 60, 66, 78], f: [32, 36, 40, 44, 48, 57, 63, 75] },
  { code: "juniors-2011-2012", label: "Юниоры 2011–2012", from: 2011, to: 2012, rule: "AGP",
    m: [38, 42, 46, 50, 56, 62, 67, 72, 84], f: [36, 40, 44, 48, 52, 57, 63, 68, 80] },
  { code: "juniors-2009-2010", label: "Юниоры 2009–2010", from: 2009, to: 2010, rule: "AGP",
    m: [46, 50, 55, 60, 66, 73, 81], f: [40, 44, 48, 52, 57, 63, 79, 82] },
  { code: "adults-2008", label: "Взрослые 2008 и ст.", from: 1930, to: 2008, rule: "SUBMISSION_ONLY",
    m: [66, 77, 88, 99], f: [60, 70], mOpenTop: true, fOpenTop: true, split: true },
  { code: "veterans-1991", label: "Ветераны 1991 и ст.", from: 1930, to: 1991, rule: "SUBMISSION_ONLY",
    m: [66, 77, 88], f: [], mOpenTop: true, split: true },
];

export type CategoryLevel = "all" | "novice" | "experienced";

export type CategorySpec = {
  ageGroupCode: string;
  ageGroupLabel: string;
  birthYearFrom: number;
  birthYearTo: number;
  sex: "M" | "F";
  discipline: "gi" | "nogi";
  weightMin: number | null;
  weightMax: number | null;
  isOpenTop: boolean;
  ruleFormat: "AGP" | "SUBMISSION_ONLY";
  level: CategoryLevel;
  boutSeconds: number;
  order: number;
};

function expandWeights(
  g: Group,
  sex: "M" | "F",
  weights: number[],
  openTop: boolean,
  discipline: "gi" | "nogi",
  level: CategoryLevel,
  startOrder: number
): CategorySpec[] {
  const base = {
    ageGroupCode: g.code,
    ageGroupLabel: g.label,
    birthYearFrom: g.from,
    birthYearTo: g.to,
    sex,
    discipline,
    ruleFormat: g.rule,
    level,
    boutSeconds: g.rule === "SUBMISSION_ONLY" ? 300 : 240,
  };
  const out: CategorySpec[] = weights.map((w, i) => ({
    ...base,
    weightMin: i > 0 ? weights[i - 1] : null,
    weightMax: w,
    isOpenTop: false,
    order: startOrder + i,
  }));
  if (openTop) {
    out.push({
      ...base,
      weightMin: weights[weights.length - 1] ?? null,
      weightMax: null,
      isOpenTop: true,
      order: startOrder + weights.length,
    });
  }
  return out;
}

/** Число категорий, которое expandWeights создаёт для пола. */
const countFor = (weights: number[], openTop?: boolean) => weights.length + (openTop ? 1 : 0);

/** Все категории пресета для обеих дисциплин.
 *  У split-групп (взрослые/ветераны) весовые дублируются на новичков и опытных. */
export function tankogradCategories(): CategorySpec[] {
  const out: CategorySpec[] = [];
  let order = 0;
  for (const g of GROUPS) {
    const levels: CategoryLevel[] = g.split ? ["novice", "experienced"] : ["all"];
    for (const level of levels) {
      for (const disc of ["gi", "nogi"] as const) {
        if (g.m.length) out.push(...expandWeights(g, "M", g.m, !!g.mOpenTop, disc, level, order)), (order += countFor(g.m, g.mOpenTop));
        if (g.f.length) out.push(...expandWeights(g, "F", g.f, !!g.fOpenTop, disc, level, order)), (order += countFor(g.f, g.fOpenTop));
      }
    }
  }
  return out;
}

export const TANKOGRAD_EVENT = {
  name: "Андеграунд Грэпплинг Танкоград",
  series: "Танкоград",
  city: "Челябинск",
  venue: 'СК «Метар-Спорт»',
  address: "ул. Черкасская, 1",
  date: new Date("2026-11-22T09:00:00+05:00"),
  disciplines: "gi,nogi",
  matsCount: 3,
  timings: JSON.stringify([
    { t: "09:00", what: "Совещание представителей и судей, контрольное взвешивание, мандатная комиссия" },
    { t: "10:00", what: "Семинар по правилам" },
    { t: "10:15", what: "Начало соревнований" },
    { t: "18:00", what: "Окончание, награждение" },
  ]),
};

export const TANKOGRAD_TIERS = [
  { name: "Ранняя", startsAt: new Date("2026-09-01"), priceFirstCategory: 2000, priceExtraCategory: 1500, order: 0 },
  { name: "Поздняя", startsAt: new Date("2026-11-01"), priceFirstCategory: 3000, priceExtraCategory: 2000, order: 1 },
];
