// restaurants.price_symbol used to be imported/stored independently of price_level (see
// seeds/restaurants.ts and ER-DIAGRAM.md history) — two columns for one fact, with no
// sync between them, so a row could end up with a price_level that didn't match its
// price_symbol. price_symbol is fully derivable from price_level (the Google Places
// 1-4 scale), so this is now the single source of truth: callers should run every
// restaurant response through withDerivedPriceSymbol() rather than trusting a stored
// price_symbol value.
const PRICE_SYMBOLS: Record<number, string> = {
  1: '$',
  2: '$$',
  3: '$$$',
  4: '$$$$',
};

export function priceLevelToSymbol(priceLevel: unknown): string | undefined {
  if (typeof priceLevel !== 'number' || !Number.isInteger(priceLevel)) {
    return undefined;
  }
  return PRICE_SYMBOLS[priceLevel];
}

// Overrides price_symbol on a restaurant record with the value derived from price_level,
// so API responses are never stale even if the stored sheet value drifted or a row
// predates this derivation. Leaves price_symbol untouched (undefined) when price_level
// is blank/unknown, matching the existing "blank when unknown" convention.
export function withDerivedPriceSymbol<T extends Record<string, unknown>>(restaurant: T): T {
  const symbol = priceLevelToSymbol(restaurant.price_level);
  if (symbol === undefined) {
    return restaurant;
  }
  return { ...restaurant, price_symbol: symbol };
}
