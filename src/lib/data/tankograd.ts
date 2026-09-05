// Пресет категорий события «Андеграунд Грэпплинг Танкоград» (из положения v2).
// Разворачивается в категории для обеих дисциплин (gi/nogi). weightMin считается от предыдущего класса.

type Group = {
  code: string;
  label: string;
  from: number; // birthYearFrom (ранний год)
  to: number; // birthYearTo (поздний год)
  rule: "AGP" | "SUBMISSION_ONLY";
  m: number[]; // веса мальчиков/мужчин; последний с "+" пометкой ниже
  f: number[]; // веса девочек/женщин
  mOpenTop?: boolean;
  fOpenTop?: boolean;
};

// Значение "N+" (свыше N) задаём как обычное N + флаг openTop на последнем элементе.
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
    m: [66, 77, 88, 99], f: [60, 70, 80], mOpenTop: true, fOpenTop: true },
  { code: "veterans-1991", label: "Ветераны 1991 и ст.", from: 1930, to: 1991, rule: "SUBMISSION_ONLY",
    m: [66, 77, 88, 99], f: [], mOpenTop: true },
];

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
  boutSeconds: number;
  order: number;
};

function expandWeights(
  g: Group,
  sex: "M" | "F",
  weights: number[],
  openTop: boolean,
  discipline: "gi" | "nogi",
  startOrder: number
): CategorySpec[] {
  const out: CategorySpec[] = [];
  let prev: number | null = null;
  weights.forEach((w, i) => {
    const isLast = i === weights.length - 1;
    const open = isLast && openTop;
    out.push({
      ageGroupCode: g.code,
      ageGroupLabel: g.label,
      birthYearFrom: g.from,
      birthYearTo: g.to,
      sex,
      discipline,
      weightMin: prev,
      weightMax: open ? null : w,
      isOpenTop: open,
      ruleFormat: g.rule,
      boutSeconds: g.rule === "SUBMISSION_ONLY" ? 300 : 240,
      order: startOrder + i,
    });
    prev = w;
  });
  return out;
}

/** Все категории пресета для обеих дисциплин. */
export function tankogradCategories(): CategorySpec[] {
  const out: CategorySpec[] = [];
  let order = 0;
  for (const g of GROUPS) {
    for (const disc of ["gi", "nogi"] as const) {
      if (g.m.length) out.push(...expandWeights(g, "M", g.m, !!g.mOpenTop, disc, order)), (order += g.m.length);
      if (g.f.length) out.push(...expandWeights(g, "F", g.f, !!g.fOpenTop, disc, order)), (order += g.f.length);
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
