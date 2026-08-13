// Defuses Google Sheets formula injection: a cell value starting with =, +, -, or @ is
// evaluated as a formula by Sheets rather than displayed as text. Prefixing with an
// apostrophe forces text interpretation without changing the visible value.
const FORMULA_PREFIXES = ['=', '+', '-', '@'];

export function sanitizeCell(value: string): string {
  return FORMULA_PREFIXES.includes(value[0]) ? `'${value}` : value;
}
