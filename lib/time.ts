/** Browser-side date helpers. Dates are "YYYY-MM-DD" keys in the device's local time zone. */

export const pad = (n: number) => String(n).padStart(2, "0");

export function dateKey(d: Date | number = new Date()): string {
  const x = new Date(d);
  return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`;
}

export function addDays(key: string, n: number): string {
  const d = new Date(`${key}T12:00:00`);
  d.setDate(d.getDate() + n);
  return dateKey(d);
}

/** Local epoch for a "HH:MM[:SS]" on a given day. */
export function at(key: string, hhmm: string): number {
  const [h, m] = hhmm.split(":");
  return new Date(`${key}T${pad(Number(h))}:${pad(Number(m))}:00`).getTime();
}

export function dayRange(key: string) {
  const start = new Date(`${key}T00:00:00`).getTime();
  const end = new Date(`${addDays(key, 1)}T00:00:00`).getTime();
  return { start, end };
}

export function fmtTime(t: number | string): string {
  const d = new Date(t);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function fmtMinutes(min: number): string {
  const m = Math.round(min);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h} h ${r} min` : `${h} h`;
}

export function fmtClock(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h ? `${h}:${pad(m)}:${pad(s % 60)}` : `${pad(m)}:${pad(s % 60)}`;
}

export function fmtDayLabel(key: string, today = dateKey()): string {
  if (key === today) return "Today";
  if (key === addDays(today, 1)) return "Tomorrow";
  if (key === addDays(today, -1)) return "Yesterday";
  return new Date(`${key}T12:00:00`).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
}

export function localTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

export const minutesBetween = (a: number | string, b: number | string) =>
  (new Date(b).getTime() - new Date(a).getTime()) / 60_000;
