// Транслитерация RU→lat и построение человекочитаемых слагов для URL.
const MAP: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh", з: "z", и: "i",
  й: "y", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r", с: "s", т: "t",
  у: "u", ф: "f", х: "h", ц: "c", ч: "ch", ш: "sh", щ: "sch", ъ: "", ы: "y", ь: "",
  э: "e", ю: "yu", я: "ya",
};

export function translit(s: string): string {
  return s.toLowerCase().split("").map((ch) => (ch in MAP ? MAP[ch] : ch)).join("");
}

/** Человекочитаемый слаг: транслит, только [a-z0-9-], без повторных дефисов. */
export function slugify(s: string): string {
  return translit(s)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

/** Слаг категории: событие + возраст + уровень + пол + дисциплина + вес (глобально уникален). */
export function categorySlug(
  eventSlug: string,
  c: { ageGroupCode: string; level?: string | null; sex: string; discipline: string; weightMin: number | null; weightMax: number | null; isOpenTop: boolean; isAbsolute?: boolean }
): string {
  const lvl = c.level && c.level !== "all" ? c.level : "";
  const w = c.isAbsolute ? "abs" : c.isOpenTop ? `svyshe${c.weightMin ?? ""}` : `do${c.weightMax ?? ""}`;
  return slugify([eventSlug, c.ageGroupCode, lvl, c.sex, c.discipline, w].filter(Boolean).join("-"));
}
