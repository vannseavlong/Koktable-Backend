import { string, ColumnBuilder } from 'longcelot-sheet-db';

// Secondary display locales, alongside each table's own base (English) column.
// Flat columns, not a JSON blob or translations table: atomic, no extra round-trip
// against a joinless adapter, still sortable/filterable per locale.
export const SECONDARY_LOCALES = ['zh', 'km', 'ko'] as const;
export type SecondaryLocale = (typeof SECONDARY_LOCALES)[number];

// `{ <field>_zh, <field>_km, <field>_ko }` — optional, un-enforced.
export function localeColumns(field: string): Record<string, ColumnBuilder> {
  const columns: Record<string, ColumnBuilder> = {};
  for (const locale of SECONDARY_LOCALES) {
    columns[`${field}_${locale}`] = string();
  }
  return columns;
}
