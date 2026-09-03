// Движок цен: тир по дате × число разделов (ги/ноу-ги) + абсолютка. Комиссия клубу отдельно.

export type Tier = {
  name: string;
  startsAt: Date;
  priceFirstCategory: number;
  priceExtraCategory: number | null; // null → каждая доп. категория = priceFirstCategory
};

/** Активный тир на дату регистрации: последний тир, чей startsAt <= at. */
export function selectTier(tiers: Tier[], at: Date): Tier | null {
  const active = tiers
    .filter((t) => t.startsAt.getTime() <= at.getTime())
    .sort((a, b) => b.startsAt.getTime() - a.startsAt.getTime());
  return active[0] ?? tiers.slice().sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())[0] ?? null;
}

export type EntryPricing = {
  categoryCount: number; // число выбранных категорий (весовые + абсолютка) — каждая = отдельный старт
  discountPerCategory?: number; // скидка ₽ с каждой категории (по ссылке/списку тренера); по умолчанию 0
};

/** Цена заявки атлета: первая категория по базовой цене, каждая следующая — по priceExtraCategory
 *  (по умолчанию = базовой). Абсолютка считается обычной доп. категорией.
 *  Тренерская скидка (discountPerCategory) вычитается с каждой выбранной категории. */
export function priceEntry(tier: Tier, e: EntryPricing): number {
  const n = Math.max(0, Math.trunc(e.categoryCount));
  if (n === 0) return 0;
  const extra = tier.priceExtraCategory ?? tier.priceFirstCategory;
  const gross = tier.priceFirstCategory + extra * (n - 1);
  const discount = Math.max(0, Math.trunc(e.discountPerCategory ?? 0)) * n;
  return Math.max(0, gross - discount);
}

/** Итог тренеру «к переводу»: сумма цен по атлетам минус комиссия за каждого. */
export function coachTransferTotal(entryPrices: number[], commissionPerEntry: number): {
  gross: number;
  commission: number;
  net: number;
  count: number;
} {
  const gross = entryPrices.reduce((s, x) => s + x, 0);
  const count = entryPrices.length;
  const commission = commissionPerEntry * count;
  return { gross, commission, net: gross - commission, count };
}
