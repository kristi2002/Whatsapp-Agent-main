/**
 * Minimal, dependency-free timezone helpers built on the Intl API.
 * All appointment math converts between local wall-clock time in the salon's
 * timezone (Europe/Rome) and absolute UTC instants.
 */

/**
 * Offset (ms) such that: wallClockInterpretedAsUTC - actualUTC.
 * Used to convert a wall-clock time in `timeZone` to a real UTC instant.
 */
function tzOffsetMs(date: Date, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = dtf.formatToParts(date);
  const map: Record<string, string> = {};
  for (const p of parts) map[p.type] = p.value;
  // "24" can appear for midnight in some environments — normalise to 0.
  const hour = map.hour === "24" ? "00" : map.hour;
  const asUTC = Date.UTC(
    Number(map.year),
    Number(map.month) - 1,
    Number(map.day),
    Number(hour),
    Number(map.minute),
    Number(map.second)
  );
  return asUTC - date.getTime();
}

/**
 * Convert a wall-clock date/time in `timeZone` to the corresponding UTC Date.
 * Two correction passes handle DST boundaries safely.
 */
export function zonedWallTimeToUtc(
  year: number,
  month: number, // 1-12
  day: number,
  hour: number,
  minute: number,
  timeZone: string
): Date {
  const guess = Date.UTC(year, month - 1, day, hour, minute, 0);
  let offset = tzOffsetMs(new Date(guess), timeZone);
  let result = new Date(guess - offset);
  // Refine once more against the corrected instant.
  offset = tzOffsetMs(result, timeZone);
  result = new Date(guess - offset);
  return result;
}

/** Parts of an instant as seen in a timezone. weekday: 0=Sun..6=Sat. */
export function getZonedParts(
  date: Date,
  timeZone: string
): { year: number; month: number; day: number; hour: number; minute: number; weekday: number } {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
  const map: Record<string, string> = {};
  for (const p of dtf.formatToParts(date)) map[p.type] = p.value;
  const weekdays: Record<string, number> = {
    Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
  };
  const hour = map.hour === "24" ? 0 : Number(map.hour);
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour,
    minute: Number(map.minute),
    weekday: weekdays[map.weekday],
  };
}

/** "HH:MM:SS" or "HH:MM" -> minutes since midnight. */
export function timeToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

/** Format an instant in the salon timezone, e.g. "gio 10 lug, 14:30". */
export function formatZoned(date: Date, timeZone: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    timeZone,
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

/** Format only the time part, e.g. "14:30". */
export function formatTime(date: Date, timeZone: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}
