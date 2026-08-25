// 152-ФЗ: публичное маскирование ПДн несовершеннолетних участников.
// На публичных страницах имена атлетов < 18 лет показываем как «Имя Ф.».
// Аутентифицированные представления персонала (судья/тренер/оргкомитет/админ)
// используют полные имена — эти функции там не применяются.

export function isMinor(birthDate: Date, asOf: Date = new Date()): boolean {
  let age = asOf.getFullYear() - birthDate.getFullYear();
  const m = asOf.getMonth() - birthDate.getMonth();
  if (m < 0 || (m === 0 && asOf.getDate() < birthDate.getDate())) age--;
  return age < 18;
}

// Для несовершеннолетних: «Имя Ф.» (имя + первая буква фамилии + «.»).
// Для взрослых — полное имя без изменений. Однословные имена — без изменений.
export function maskName(fullName: string, minor: boolean): string {
  if (!minor) return fullName;
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length < 2) return fullName;
  const [first, second] = parts;
  return `${first} ${second[0].toUpperCase()}.`;
}
