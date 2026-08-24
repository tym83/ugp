// Движок цен: тир по дате × число разделов (ги/ноу-ги) + абсолютка. Комиссия клубу отдельно.

export type Tier = {
  name: string;
  startsAt: Date;
  priceOneDivision: number;
  priceBothDivisions: number;
  absoluteSurcharge: number;
};

/** Активный тир на дату регистрации: последний тир, чей startsAt <= at. */
export function selectTier(tiers: Tier[], at: Date): Tier | null {
  const active = tiers
    .filter((t) => t.startsAt.getTime() <= at.getTime())
    .sort((a, b) => b.startsAt.getTime() - a.startsAt.getTime());
  return active[0] ?? tiers.slice().sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())[0] ?? null;
}

export type EntryPricing = {
  disciplines: ("gi" | "nogi")[]; // фактически выбранные разделы (1 или 2)
  absoluteAdded: boolean;
};

/** Цена заявки атлета на событие по активному тиру. */
export function priceEntry(tier: Tier, e: EntryPricing): number {
  const divisions = new Set(e.disciplines).size;
  const base = divisions >= 2 ? tier.priceBothDivisions : divisions === 1 ? tier.priceOneDivision : 0;
  const abs = e.absoluteAdded ? tier.absoluteSurcharge : 0;
  return base + abs;
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
