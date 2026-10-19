/** Time-zone helpers built on Intl, so they work the same on a UTC server and in the browser. */

const dtfCache = new Map<string, Intl.DateTimeFormat>();

function dtf(tz: string) {
  let f = dtfCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    dtfCache.set(tz, f);
  }
  return f;
}

export function isValidTimeZone(tz: string | null | undefined): tz is string {
  if (!tz) return false;
  try {
    dtf(tz);
    return true;
  } catch {
    return false;
  }
}

/** Offset of `tz` from UTC at instant `epoch`, in ms (Riga in summer → +3h). */
export function tzOffset(epoch: number, tz: string): number {
  const parts = dtf(tz).formatToParts(new Date(epoch));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asUTC = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return asUTC - Math.floor(epoch / 1000) * 1000;
}

/** Epoch ms for a wall-clock time in `tz` (e.g. 2026-10-19 10:00 in Europe/Riga). */
export function wallTimeToEpoch(
  y: number, mo: number, d: number, h = 0, mi = 0, s = 0, tz: string,
): number {
  const guess = Date.UTC(y, mo - 1, d, h, mi, s);
  let epoch = guess - tzOffset(guess, tz);
  // Re-check once around DST changes.
  const off2 = tzOffset(epoch, tz);
  epoch = guess - off2;
  return epoch;
}

/**
 * Outlook feeds sometimes use Windows zone names without a matching VTIMEZONE block.
 * Map the common European ones (and a few others) to IANA names.
 */
export const WINDOWS_TZ: Record<string, string> = {
  "FLE Standard Time": "Europe/Riga",
  "E. Europe Standard Time": "Europe/Chisinau",
  "GTB Standard Time": "Europe/Bucharest",
  "W. Europe Standard Time": "Europe/Berlin",
  "Central Europe Standard Time": "Europe/Budapest",
  "Central European Standard Time": "Europe/Warsaw",
  "Romance Standard Time": "Europe/Paris",
  "GMT Standard Time": "Europe/London",
  "Russian Standard Time": "Europe/Moscow",
  "UTC": "UTC",
  "Eastern Standard Time": "America/New_York",
  "Central Standard Time": "America/Chicago",
  "Pacific Standard Time": "America/Los_Angeles",
};

export function resolveTimeZone(tzid: string | null | undefined, fallback: string): string {
  if (!tzid) return fallback;
  const cleaned = tzid.replace(/^\/+/, "").replace(/^"|"$/g, "");
  if (isValidTimeZone(cleaned)) return cleaned;
  const mapped = WINDOWS_TZ[cleaned];
  return mapped && isValidTimeZone(mapped) ? mapped : fallback;
}

/** "YYYY-MM-DD" for an instant, as seen in `tz`. */
export function dateKeyInTz(epoch: number, tz: string): string {
  const parts = dtf(tz).formatToParts(new Date(epoch));
  const get = (t: string) => parts.find((p) => p.type === t)?.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}
