// Единая подпись уровня категории (новички/опытные). "all" — без подписи (дети/юниоры/абсолютка).
export function levelLabel(level?: string | null): string {
  if (level === "novice") return "новички";
  if (level === "experienced") return "опытные";
  return "";
}
