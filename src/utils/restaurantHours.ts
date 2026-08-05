// Parses Google-Places-style opening-hours lines ("Monday: 11:00 AM – 10:00 PM",
// "Tuesday: Closed", "Wednesday: Open 24 hours", "Thursday: 11:00 AM – 2:00 PM, 4:00 – 11:00 PM")
// into restaurant_hours rows. Used by scripts/migrate-restaurant-hours.ts and seeds/restaurants.ts.
export const DAYS_OF_WEEK = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const;
export type DayOfWeek = (typeof DAYS_OF_WEEK)[number];

export interface HoursPeriod {
  open: string;  // 24h "HH:mm"
  close: string; // 24h "HH:mm"; close < open means the period crosses midnight
}

export interface ParsedDayHours {
  day_of_week: DayOfWeek;
  closed: boolean;
  open_24h: boolean;
  periods: HoursPeriod[];
}

const TIME_RE = /^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i;

function to24h(hour12: number, minute: number, meridiem: 'AM' | 'PM'): string {
  const hour24 = meridiem === 'PM' ? (hour12 % 12) + 12 : hour12 % 12;
  return `${String(hour24).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function parseTimeToken(raw: string): { hour: number; minute: number; meridiem?: 'AM' | 'PM' } | null {
  const m = raw.trim().match(TIME_RE);
  if (!m) return null;
  return { hour: Number(m[1]), minute: Number(m[2]), meridiem: m[3]?.toUpperCase() as 'AM' | 'PM' | undefined };
}

// Start time's AM/PM is sometimes omitted when it matches the end time's ("12:00 – 3:00 PM");
// inherited from the end token rather than guessed.
function parsePeriod(rangeText: string): HoursPeriod | null {
  const parts = rangeText.split(/\s+[–-]\s+/);
  if (parts.length !== 2) return null;

  const endTok = parseTimeToken(parts[1]);
  if (!endTok || !endTok.meridiem) return null;

  const startTok = parseTimeToken(parts[0]);
  if (!startTok) return null;
  const startMeridiem = startTok.meridiem ?? endTok.meridiem;

  return {
    open:  to24h(startTok.hour, startTok.minute, startMeridiem),
    close: to24h(endTok.hour, endTok.minute, endTok.meridiem),
  };
}

export function parseOpeningHoursLine(line: string): ParsedDayHours | null {
  const m = line.match(/^([A-Za-z]+):\s*(.*)$/);
  if (!m) return null;

  const dayRaw = m[1].toLowerCase();
  if (!(DAYS_OF_WEEK as readonly string[]).includes(dayRaw)) return null;
  const day_of_week = dayRaw as DayOfWeek;
  const rest = m[2].trim();

  if (/^closed$/i.test(rest)) {
    return { day_of_week, closed: true, open_24h: false, periods: [] };
  }
  if (/^open 24 hours$/i.test(rest)) {
    return { day_of_week, closed: false, open_24h: true, periods: [] };
  }

  const periods = rest.split(',').map(parsePeriod).filter((p): p is HoursPeriod => p !== null);
  if (periods.length === 0) return null;

  return { day_of_week, closed: false, open_24h: false, periods };
}

export function parseOpeningHoursLines(lines: unknown): ParsedDayHours[] {
  if (!Array.isArray(lines)) return [];
  return lines
    .filter((l): l is string => typeof l === 'string')
    .map(parseOpeningHoursLine)
    .filter((d): d is ParsedDayHours => d !== null);
}
