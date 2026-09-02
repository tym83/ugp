// Сценарии S001–S055 — чистая доменная логика (без авторизации/БД):
// eligibility (вес/возраст/пол/дисциплина/уровень/play-up), pricing (тиры/разделы/абсолютка/комиссия),
// merge (совместимость), статусные переходы события, teamscore, bracket.
import { describe, it, expect } from "vitest";
import { weightFits, ageEligible, eligibleCategories, nativeCategory, allowedCategories, suggestedCategories, athleteIsKid, type Cat, type SelectableCat } from "@/lib/domain/eligibility";
import { selectTier, priceEntry, coachTransferTotal, type Tier } from "@/lib/domain/pricing";
import { canMerge, ageBand, needsMerge, suggestMergeTarget, type MergeCat } from "@/lib/domain/merge";
import { canTransition, nextStatuses } from "@/lib/data/preset";
import { computeTeamScores, type Placement } from "@/lib/domain/teamscore";
import { nextPow2, seedPositions, generateSingleElim, generateRoundRobin, type Participant } from "@/lib/domain/bracket";

// helpers
const cat = (o: Partial<Cat> = {}): Cat => ({
  id: o.id ?? "c", sex: o.sex ?? "M", discipline: o.discipline ?? "nogi",
  birthYearFrom: o.birthYearFrom ?? 1980, birthYearTo: o.birthYearTo ?? 2008,
  weightMin: o.weightMin ?? null, weightMax: o.weightMax ?? null,
  isOpenTop: o.isOpenTop ?? false, isAbsolute: o.isAbsolute ?? false, level: o.level,
});
const tier = (o: Partial<Tier> = {}): Tier => ({
  name: o.name ?? "T", startsAt: o.startsAt ?? new Date("2026-09-01"),
  priceFirstCategory: o.priceFirstCategory ?? 2000,
  priceExtraCategory: o.priceExtraCategory !== undefined ? o.priceExtraCategory : 1500,
});
const mcat = (o: Partial<MergeCat> = {}): MergeCat => ({
  id: o.id ?? "m", sex: o.sex ?? "M", discipline: o.discipline ?? "nogi", ageGroupCode: o.ageGroupCode ?? "adults",
  weightMax: o.weightMax ?? 77, isOpenTop: o.isOpenTop ?? false, isAbsolute: o.isAbsolute ?? false,
  count: o.count ?? 1, minParticipants: o.minParticipants ?? 3,
});

describe("Eligibility — вес/возраст/пол/дисциплина/уровень/play-up (S001–S022)", () => {
  it("S001 вес в диапазоне (min<w<=max) допускается", () => {
    expect(weightFits(76, cat({ weightMin: 70, weightMax: 77 }))).toBe(true);
  });
  it("S002 вес ровно на верхней границе (=max) допускается", () => {
    expect(weightFits(77, cat({ weightMin: 70, weightMax: 77 }))).toBe(true);
  });
  it("S003 вес выше max не допускается", () => {
    expect(weightFits(77.5, cat({ weightMin: 70, weightMax: 77 }))).toBe(false);
  });
  it("S004 вес ровно на нижней границе (=min) НЕ допускается (min исключительно)", () => {
    expect(weightFits(70, cat({ weightMin: 70, weightMax: 77 }))).toBe(false);
  });
  it("S005 open-top: вес выше min допускается", () => {
    expect(weightFits(120, cat({ isOpenTop: true, weightMin: 94, weightMax: null }))).toBe(true);
  });
  it("S006 open-top без min допускает любой вес", () => {
    expect(weightFits(60, cat({ isOpenTop: true, weightMin: null }))).toBe(true);
  });
  it("S007 обычная категория без weightMax никого не допускает (защита от кривой настройки)", () => {
    expect(weightFits(80, cat({ weightMin: 70, weightMax: null, isOpenTop: false }))).toBe(false);
  });
  it("S008 абсолютка допускает любой вес", () => {
    expect(weightFits(150, cat({ isAbsolute: true }))).toBe(true);
  });
  it("S009 возраст: свой год рождения в группе — допуск", () => {
    expect(ageEligible(2000, cat({ birthYearFrom: 1980, birthYearTo: 2008 }), false)).toBe(true);
  });
  it("S010 возраст: год вне группы без play-up — отказ", () => {
    expect(ageEligible(2015, cat({ birthYearFrom: 1980, birthYearTo: 2008 }), false)).toBe(false);
  });
  it("S011 play-up: младший может выступать в старшей группе", () => {
    expect(ageEligible(2010, cat({ birthYearFrom: 2005, birthYearTo: 2008 }), true)).toBe(true);
  });
  it("S012 play-up НЕ даёт старшему играть в младшей группе", () => {
    // старший (2000) в детской группе 2015-2016 — birthYearTo(2016) НЕ < 2000 → отказ
    expect(ageEligible(2000, cat({ birthYearFrom: 2015, birthYearTo: 2016 }), true)).toBe(false);
  });
  it("S013 eligibleCategories: приоритет своей возрастной группы над play-up", () => {
    const cats = [cat({ id: "own", birthYearFrom: 2005, birthYearTo: 2008, weightMax: 60 }),
                  cat({ id: "older", birthYearFrom: 1990, birthYearTo: 2004, weightMax: 60 })];
    const r = eligibleCategories({ sex: "M", birthYear: 2006, weight: 55 }, "nogi", cats, { allowPlayUp: true });
    expect(r.map((c) => c.id)).toEqual(["own"]);
  });
  it("S014 eligibleCategories: play-up только в ближайшую старшую, не в любую", () => {
    const cats = [cat({ id: "near", birthYearFrom: 2009, birthYearTo: 2012, weightMax: 60 }),
                  cat({ id: "far", birthYearFrom: 1990, birthYearTo: 2004, weightMax: 60 })];
    const r = eligibleCategories({ sex: "M", birthYear: 2014, weight: 55 }, "nogi", cats, { allowPlayUp: true });
    expect(r.map((c) => c.id)).toEqual(["near"]);
  });
  it("S015 eligibleCategories фильтрует по полу", () => {
    const cats = [cat({ id: "f", sex: "F", weightMax: 60 }), cat({ id: "m", sex: "M", weightMax: 60 })];
    const r = eligibleCategories({ sex: "F", birthYear: 2000, weight: 55 }, "nogi", cats);
    expect(r.map((c) => c.id)).toEqual(["f"]);
  });
  it("S016 eligibleCategories фильтрует по дисциплине", () => {
    const cats = [cat({ id: "gi", discipline: "gi", weightMax: 60 }), cat({ id: "nogi", discipline: "nogi", weightMax: 60 })];
    const r = eligibleCategories({ sex: "M", birthYear: 2000, weight: 55 }, "gi", cats);
    expect(r.map((c) => c.id)).toEqual(["gi"]);
  });
  it("S017 уровень: категория 'all' подходит атлету без уровня", () => {
    const r = eligibleCategories({ sex: "M", birthYear: 2000, weight: 55, level: null }, "nogi", [cat({ id: "a", level: "all", weightMax: 60 })]);
    expect(r).toHaveLength(1);
  });
  it("S018 уровень: категория с уровнем не подходит атлету другого уровня", () => {
    const r = eligibleCategories({ sex: "M", birthYear: 2000, weight: 55, level: "novice" }, "nogi", [cat({ id: "a", level: "pro", weightMax: 60 })]);
    expect(r).toHaveLength(0);
  });
  it("S019 nativeCategory берёт наименьший подходящий weightMax", () => {
    const cats = [cat({ id: "heavy", weightMin: 0, weightMax: 90 }), cat({ id: "light", weightMin: 0, weightMax: 70 })];
    const nc = nativeCategory({ sex: "M", birthYear: 2000, weight: 60 }, "nogi", cats);
    expect(nc?.id).toBe("light");
  });
  it("S020 nativeCategory возвращает null, если нет подходящей", () => {
    const nc = nativeCategory({ sex: "M", birthYear: 2000, weight: 200 }, "nogi", [cat({ weightMax: 77 })]);
    expect(nc).toBeNull();
  });
  it("S021 nativeCategory с play-up находит старшую при отсутствии своей", () => {
    const cats = [cat({ id: "adult", birthYearFrom: 1990, birthYearTo: 2008, weightMax: 60 })];
    const nc = nativeCategory({ sex: "M", birthYear: 2012, weight: 55 }, "nogi", cats, { allowPlayUp: true });
    expect(nc?.id).toBe("adult");
  });
  it("S022 перевес относительно своей категории → nativeCategory без play-up = null", () => {
    const nc = nativeCategory({ sex: "M", birthYear: 2000, weight: 80 }, "nogi", [cat({ weightMin: 0, weightMax: 77 })]);
    expect(nc).toBeNull();
  });
});

describe("Pricing — цена по числу категорий (S023–S034)", () => {
  const t1 = tier({ name: "Ранняя", startsAt: new Date("2026-09-01"), priceFirstCategory: 2000, priceExtraCategory: 1500 });
  const t2 = tier({ name: "Поздняя", startsAt: new Date("2026-11-01"), priceFirstCategory: 3000, priceExtraCategory: 2000 });
  it("S023 selectTier: активен последний тир, чей startsAt<=дата", () => {
    expect(selectTier([t1, t2], new Date("2026-11-05"))?.name).toBe("Поздняя");
  });
  it("S024 selectTier: до второго тира активен первый", () => {
    expect(selectTier([t1, t2], new Date("2026-09-15"))?.name).toBe("Ранняя");
  });
  it("S025 selectTier: до старта продаж возвращает самый ранний тир (не null)", () => {
    expect(selectTier([t1, t2], new Date("2026-08-01"))?.name).toBe("Ранняя");
  });
  it("S026 selectTier пустой список → null", () => {
    expect(selectTier([], new Date())).toBeNull();
  });
  it("S027 priceEntry: одна категория → базовая цена", () => {
    expect(priceEntry(t1, { categoryCount: 1 })).toBe(2000);
  });
  it("S028 priceEntry: две категории → база + доп", () => {
    expect(priceEntry(t1, { categoryCount: 2 })).toBe(3500);
  });
  it("S029 priceEntry: три категории → база + доп×2", () => {
    expect(priceEntry(t1, { categoryCount: 3 })).toBe(5000);
  });
  it("S030 priceEntry: доп.цена = null → доп. считаются по базовой", () => {
    const t = tier({ priceFirstCategory: 2000, priceExtraCategory: null });
    expect(priceEntry(t, { categoryCount: 3 })).toBe(6000);
  });
  it("S031 priceEntry: доп. дороже базовой (организатор задал больше)", () => {
    const t = tier({ priceFirstCategory: 2000, priceExtraCategory: 2500 });
    expect(priceEntry(t, { categoryCount: 2 })).toBe(4500);
  });
  it("S032 priceEntry: 0 категорий → 0", () => {
    expect(priceEntry(t1, { categoryCount: 0 })).toBe(0);
  });
  it("S033 coachTransferTotal: комиссия за каждого атлета", () => {
    const r = coachTransferTotal([3000, 2000, 4000], 200);
    expect(r).toMatchObject({ gross: 9000, commission: 600, net: 8400, count: 3 });
  });
  it("S034 coachTransferTotal пустой список → нули", () => {
    expect(coachTransferTotal([], 200)).toMatchObject({ gross: 0, commission: 0, net: 0, count: 0 });
  });
});

describe("Merge — совместимость категорий (S035–S042)", () => {
  it("S035 ageBand маппит коды в полосы", () => {
    expect(ageBand("kids-2015-2016")).toBe("kids");
    expect(ageBand("juniors-2009")).toBe("juniors");
    expect(ageBand("veterans-1980")).toBe("veterans");
    expect(ageBand("adults")).toBe("adults");
  });
  it("S036 canMerge: совместимые (пол/дисц/полоса совпадают)", () => {
    expect(canMerge(mcat({ id: "a", weightMax: 70 }), mcat({ id: "b", weightMax: 77 }))).toBe(true);
  });
  it("S037 canMerge запрещает разный пол", () => {
    expect(canMerge(mcat({ id: "a", sex: "M" }), mcat({ id: "b", sex: "F" }))).toBe(false);
  });
  it("S038 canMerge запрещает разную дисциплину", () => {
    expect(canMerge(mcat({ id: "a", discipline: "gi" }), mcat({ id: "b", discipline: "nogi" }))).toBe(false);
  });
  it("S039 canMerge запрещает разные возрастные полосы (дети↔взрослые)", () => {
    expect(canMerge(mcat({ id: "a", ageGroupCode: "kids-2015-2016" }), mcat({ id: "b", ageGroupCode: "adults" }))).toBe(false);
  });
  it("S040 canMerge запрещает абсолютку", () => {
    expect(canMerge(mcat({ id: "a", isAbsolute: true }), mcat({ id: "b" }))).toBe(false);
  });
  it("S041 needsMerge отбирает категории с 0<count<min", () => {
    const r = needsMerge([mcat({ id: "small", count: 2, minParticipants: 3 }), mcat({ id: "ok", count: 5 }), mcat({ id: "empty", count: 0 })]);
    expect(r.map((c) => c.id)).toEqual(["small"]);
  });
  it("S042 suggestMergeTarget: ближайшая старшая по весу совместимая", () => {
    const a = mcat({ id: "a", weightMax: 66 });
    const all = [a, mcat({ id: "b", weightMax: 77 }), mcat({ id: "c", weightMax: 88 })];
    expect(suggestMergeTarget(a, all)?.id).toBe("b");
  });
});

describe("Event status — машина переходов (S043–S050)", () => {
  it("S043 DRAFT→REG_OPEN разрешён", () => expect(canTransition("DRAFT", "REG_OPEN")).toBe(true));
  it("S044 REG_OPEN→REG_CLOSED разрешён", () => expect(canTransition("REG_OPEN", "REG_CLOSED")).toBe(true));
  it("S045 REG_CLOSED→LIVE разрешён", () => expect(canTransition("REG_CLOSED", "LIVE")).toBe(true));
  it("S046 REG_CLOSED→REG_OPEN (переоткрытие) разрешён", () => expect(canTransition("REG_CLOSED", "REG_OPEN")).toBe(true));
  it("S047 LIVE→REG_OPEN (назад) запрещён", () => expect(canTransition("LIVE", "REG_OPEN")).toBe(false));
  it("S048 DRAFT→LIVE (перепрыгивание) запрещён", () => expect(canTransition("DRAFT", "LIVE")).toBe(false));
  it("S049 ARCHIVED терминальный — из него никуда", () => {
    expect(nextStatuses("ARCHIVED")).toEqual([]);
    expect(canTransition("ARCHIVED", "DRAFT")).toBe(false);
  });
  it("S050 ARCHIVED достижим из любого нетерминального", () => {
    for (const s of ["DRAFT", "REG_OPEN", "REG_CLOSED", "LIVE", "COMPLETED"]) {
      expect(canTransition(s, "ARCHIVED")).toBe(true);
    }
  });
});

describe("Team score + bracket base (S051–S055)", () => {
  it("S051 computeTeamScores: очки 9/3/1 суммируются по клубам и ранжируются", () => {
    const p: Placement[] = [
      { clubId: "A", clubName: "A", place: 1 }, { clubId: "A", clubName: "A", place: 3 },
      { clubId: "B", clubName: "B", place: 2 },
    ];
    const r = computeTeamScores(p);
    expect(r[0]).toMatchObject({ clubId: "A", points: 10, place: 1 });
    expect(r[1]).toMatchObject({ clubId: "B", points: 3, place: 2 });
  });
  it("S052 computeTeamScores: бонус за сабмишены учитывается", () => {
    const r = computeTeamScores([{ clubId: "A", clubName: "A", place: 1, submissions: 2 }], { placePoints: { first: 9, second: 3, third: 1 }, submissionBonus: 2, absoluteMultiplier: 1 });
    expect(r[0].points).toBe(13);
  });
  it("S053 nextPow2 округляет вверх до степени двойки", () => {
    expect([nextPow2(3), nextPow2(5), nextPow2(8), nextPow2(9)]).toEqual([4, 8, 8, 16]);
  });
  it("S054 seedPositions разводит топ-сеяных по разным половинам", () => {
    const pos = seedPositions(4);
    expect(pos).toHaveLength(4);
    expect(new Set(pos).size).toBe(4);
  });
  it("S055 generateRoundRobin: n участников → n*(n-1)/2 матчей", () => {
    const parts: Participant[] = [1, 2, 3, 4].map((i) => ({ id: `a${i}` }));
    const b = generateRoundRobin(parts);
    expect(b.matches.length).toBe(6);
    const se = generateSingleElim([1, 2, 3, 4, 5].map((i) => ({ id: `x${i}` })));
    expect(se.matches.length).toBeGreaterThan(0);
  });
});

const scat = (o: Partial<SelectableCat> & { ageGroupCode: string }): SelectableCat => ({
  id: o.id ?? "c", sex: o.sex ?? "M", discipline: o.discipline ?? "nogi",
  birthYearFrom: o.birthYearFrom ?? 1980, birthYearTo: o.birthYearTo ?? 2008,
  weightMin: o.weightMin ?? null, weightMax: o.weightMax ?? null,
  isOpenTop: o.isOpenTop ?? false, isAbsolute: o.isAbsolute ?? false, level: o.level, ageGroupCode: o.ageGroupCode,
});

describe("Само-выбор: allowed/suggested/kid (S151–S156)", () => {
  const kidsCat = scat({ id: "kid", ageGroupCode: "kids-2015-2016", birthYearFrom: 2015, birthYearTo: 2016, weightMax: 40 });
  const adultLight = scat({ id: "aL", ageGroupCode: "adults", weightMax: 70 });
  const adultMid = scat({ id: "aM", ageGroupCode: "adults", weightMax: 77 });
  const adultHeavy = scat({ id: "aH", ageGroupCode: "adults", weightMax: 94 });
  const adultF = scat({ id: "aF", ageGroupCode: "adults", sex: "F", weightMax: 64 });
  const absCat = scat({ id: "abs", ageGroupCode: "absolute", isAbsolute: true, weightMax: null });
  const all = [kidsCat, adultLight, adultMid, adultHeavy, adultF, absCat];

  it("S151 allowedCategories: взрослому — только НЕ детские своего пола", () => {
    const r = allowedCategories({ sex: "M", birthYear: 1995 }, all).map((c) => c.id);
    expect(r).toContain("aL"); expect(r).toContain("abs");
    expect(r).not.toContain("kid"); // детская отсечена
    expect(r).not.toContain("aF"); // другой пол
  });
  it("S152 allowedCategories: ребёнку — только его детская группа", () => {
    const r = allowedCategories({ sex: "M", birthYear: 2016 }, all).map((c) => c.id);
    expect(r).toEqual(["kid"]);
  });
  it("S153 allowedCategories фильтрует по полу", () => {
    const r = allowedCategories({ sex: "F", birthYear: 1995 }, all).map((c) => c.id);
    expect(r).toEqual(["aF"]);
  });
  it("S154 athleteIsKid: по попаданию года рождения в детский диапазон", () => {
    expect(athleteIsKid(2016, all)).toBe(true);
    expect(athleteIsKid(1995, all)).toBe(false);
  });
  it("S155 suggestedCategories: весовое окно ±2 вокруг веса + абсолютка всегда", () => {
    const r = suggestedCategories({ sex: "M", birthYear: 1995, weight: 70 }, all).map((c) => c.id);
    expect(r).toContain("aL"); expect(r).toContain("aM"); expect(r).toContain("aH");
    expect(r).toContain("abs"); // абсолютка не зависит от веса
  });
  it("S156 suggestedCategories без веса = allowed (не сужаем)", () => {
    const r = suggestedCategories({ sex: "M", birthYear: 1995, weight: null }, all).map((c) => c.id).sort();
    const a = allowedCategories({ sex: "M", birthYear: 1995 }, all).map((c) => c.id).sort();
    expect(r).toEqual(a);
  });
});
