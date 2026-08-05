// restaurants.hours (free-text summary) and restaurants.opening_hours (structured
// per-day list) are two intentionally different granularities of the same fact, not a
// straight duplicate — opening_hours suits a detail view, hours suits a compact one.
// But the two restaurant-creation paths only ever populated one each (merchant-onboarded
// rows only got `hours`; bulk Google-Places-imported rows only got `opening_hours`), so
// any client reading `hours` alone (the old FLUTTER_GUIDE.md mobile contract did; no
// client currently calls this API — the Web app is still on mock data per its own
// AGENTS.md) would see a blank field for every imported restaurant.
// summarizeOpeningHours() lets both creation paths keep both fields populated instead,
// so whichever field a future client reads is correct.
export function summarizeOpeningHours(openingHours: unknown): string | undefined {
  if (!Array.isArray(openingHours) || openingHours.length === 0) {
    return undefined;
  }
  return openingHours.filter((line): line is string => typeof line === 'string' && line.length > 0).join('; ');
}
