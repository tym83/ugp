import { describe, expect, it } from "vitest";
import { categoryMismatches, type FitAthlete, type FitCategory } from "./categoryFit";

const cat = (over: Partial<FitCategory> = {}): FitCategory => ({
  sex: "M",
  birthYearFrom: 2015,
  birthYearTo: 2016,
  weightMin: null,
  weightMax: 30,
  isOpenTop: false,
  isAbsolute: false,
  ...over,
});

const athlete = (over: Partial<FitAthlete> = {}): FitAthlete => ({ sex: "M", birthYear: 2015, weight: 28, ...over });

describe("categoryMismatches", () => {
  it("returns no reasons when the athlete fits", () => {
    expect(categoryMismatches(cat(), athlete())).toEqual([]);
    expect(categoryMismatches(cat(), athlete({ birthYear: 2016, weight: 30 }))).toEqual([]); // band and max inclusive
  });

  it("flags a sex mismatch", () => {
    expect(categoryMismatches(cat(), athlete({ sex: "F" }))).toEqual(["пол: в категории мужчины, участница — женщина"]);
    expect(categoryMismatches(cat({ sex: "F" }), athlete({ sex: "M" }))).toEqual(["пол: в категории женщины, участник — мужчина"]);
  });

  it("flags a birth year below and above the band", () => {
    expect(categoryMismatches(cat(), athlete({ birthYear: 2014 }))).toEqual(["год рождения 2014 вне 2015–2016"]);
    expect(categoryMismatches(cat(), athlete({ birthYear: 2017 }))).toEqual(["год рождения 2017 вне 2015–2016"]);
  });

  it("flags weight above weightMax", () => {
    expect(categoryMismatches(cat(), athlete({ weight: 34 }))).toEqual(["вес 34 кг больше 30 кг"]);
  });

  it("flags weight not above the open-top floor", () => {
    expect(categoryMismatches(cat({ weightMin: 27, weightMax: null, isOpenTop: true }), athlete({ weight: 25 }))).toEqual([
      "вес 25 кг не больше 27 кг (категория свыше 27)",
    ]);
    expect(categoryMismatches(cat({ weightMin: 27, weightMax: null, isOpenTop: true }), athlete({ weight: 27.5 }))).toEqual([]);
  });

  it("treats weightMin as exclusive and weightMax as inclusive", () => {
    expect(categoryMismatches(cat({ weightMin: 25, weightMax: 30 }), athlete({ weight: 25 }))).toEqual([
      "вес 25 кг не больше 25 кг (категория свыше 25)",
    ]);
    expect(categoryMismatches(cat({ weightMin: 25, weightMax: 30 }), athlete({ weight: 25.1 }))).toEqual([]);
    expect(categoryMismatches(cat({ weightMin: 25, weightMax: 30 }), athlete({ weight: 30 }))).toEqual([]);
  });

  it("skips the weight check when weight is unknown", () => {
    expect(categoryMismatches(cat(), athlete({ weight: null }))).toEqual([]);
    expect(categoryMismatches(cat(), athlete({ weight: null, birthYear: 2010 }))).toEqual(["год рождения 2010 вне 2015–2016"]);
  });

  it("skips the weight check in absolute categories", () => {
    expect(categoryMismatches(cat({ isAbsolute: true, weightMax: null }), athlete({ weight: 120 }))).toEqual([]);
  });

  it("collects several reasons at once", () => {
    const reasons = categoryMismatches(cat(), athlete({ sex: "F", birthYear: 2014, weight: 34 }));
    expect(reasons).toHaveLength(3);
    expect(reasons[0]).toContain("пол");
    expect(reasons[1]).toContain("год рождения 2014");
    expect(reasons[2]).toContain("вес 34 кг");
  });
});
