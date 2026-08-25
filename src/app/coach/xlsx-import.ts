import * as XLSX from "xlsx";
import type { GroupRow } from "@/app/coach-actions";

// Ожидаемые колонки (RU или EN, регистр не важен):
// ФИО / name · дата рождения (дата) / birthDate · пол / sex (М/Ж/M/F) · вес / weight · ги / gi · ноу-ги / nogi
export const TEMPLATE_HINT = "Колонки: ФИО, дата рождения, пол (М/Ж), вес, ги, ноу-ги";

const norm = (s: string) => s.toLowerCase().replace(/[\s._-]/g, "");

const COLS: Record<keyof GroupRow, string[]> = {
  fullName: ["фио", "имя", "name", "fullname"],
  birthDate: ["датарождения", "дата", "birthdate", "dob"],
  sex: ["пол", "sex", "gender"],
  weight: ["вес", "weight"],
  gi: ["ги", "gi"],
  nogi: ["ноуги", "nogi", "ноги"],
};

const TRUTHY = new Set(["1", "да", "yes", "y", "x", "true", "+", "ги", "gi", "nogi", "ноуги"]);

const toBool = (v: unknown): boolean => {
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v !== 0;
  return TRUTHY.has(norm(String(v ?? "")));
};

const toSex = (v: unknown): "M" | "F" => {
  const s = norm(String(v ?? ""));
  if (s === "ж" || s === "f" || s === "female" || s === "жен") return "F";
  return "M";
};

const toWeight = (v: unknown): number => {
  if (typeof v === "number") return v;
  const n = Number(String(v ?? "").replace(",", ".").replace(/[^\d.]/g, ""));
  return Number.isFinite(n) ? n : 0;
};

const p2 = (n: number) => String(n).padStart(2, "0");

// Excel serial (cellDates → Date) или строка → "YYYY-MM-DD"
const toDate = (v: unknown): string => {
  if (v == null || v === "") return "";
  if (v instanceof Date && !Number.isNaN(v.getTime())) {
    // Excel-даты приходят как UTC-полночь — берём UTC-части, чтобы не сдвигать день
    return `${v.getUTCFullYear()}-${p2(v.getUTCMonth() + 1)}-${p2(v.getUTCDate())}`;
  }
  const s = String(v).trim();
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const dmy = s.match(/^(\d{1,2})[.\/](\d{1,2})[.\/](\d{2,4})$/);
  if (dmy) {
    const [, d, m, y] = dmy;
    const year = y.length === 2 ? `20${y}` : y;
    return `${year}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  const parsed = new Date(s);
  if (!Number.isNaN(parsed.getTime())) {
    return `${parsed.getFullYear()}-${p2(parsed.getMonth() + 1)}-${p2(parsed.getDate())}`;
  }
  return "";
};

// сопоставляем реальные заголовки листа с полями GroupRow
const buildKeyMap = (headers: string[]): Partial<Record<keyof GroupRow, string>> => {
  const map: Partial<Record<keyof GroupRow, string>> = {};
  for (const h of headers) {
    const nh = norm(h);
    for (const field of Object.keys(COLS) as (keyof GroupRow)[]) {
      if (map[field]) continue;
      if (COLS[field].some((alias) => nh === alias || nh.startsWith(alias))) {
        map[field] = h;
        break;
      }
    }
  }
  return map;
};

export function parseXlsx(buf: ArrayBuffer): GroupRow[] {
  const wb = XLSX.read(buf, { type: "array", cellDates: true });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  if (!sheet) return [];
  const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
  if (!json.length) return [];
  const keyMap = buildKeyMap(Object.keys(json[0]));

  return json.map((r): GroupRow => {
    const pick = (f: keyof GroupRow) => (keyMap[f] ? r[keyMap[f] as string] : "");
    return {
      fullName: String(pick("fullName") ?? "").trim(),
      birthDate: toDate(pick("birthDate")),
      sex: toSex(pick("sex")),
      weight: toWeight(pick("weight")),
      gi: toBool(pick("gi")),
      nogi: toBool(pick("nogi")),
    };
  });
}
