import ICAL from "ical.js";
import type { CalendarEvent } from "./types";
import { resolveTimeZone, wallTimeToEpoch } from "./tz";

const MAX_OCCURRENCES_PER_EVENT = 3000;

type ICALTime = InstanceType<typeof ICAL.Time>;
type ICALEvent = InstanceType<typeof ICAL.Event>;

/** Convert an ical.js time to epoch ms. Floating / unknown zones are read as wall time in `tz`. */
function toEpoch(t: ICALTime, tz: string): number {
  const zone = t.zone;
  const floating = !zone || zone === ICAL.Timezone.localTimezone || zone.tzid === "floating";
  if (t.isDate || floating) {
    return wallTimeToEpoch(t.year, t.month, t.day, t.isDate ? 0 : t.hour, t.isDate ? 0 : t.minute, t.isDate ? 0 : t.second, tz);
  }
  return t.toUnixTime() * 1000;
}

function eventTz(event: ICALEvent, userTz: string): string {
  const prop = event.component.getFirstProperty("dtstart");
  const tzid = prop?.getParameter("tzid");
  return resolveTimeZone(typeof tzid === "string" ? tzid : null, userTz);
}

function isBusy(event: ICALEvent): boolean {
  const transp = String(event.component.getFirstPropertyValue("transp") ?? "").toUpperCase();
  return transp !== "TRANSPARENT";
}

function isCancelled(component: InstanceType<typeof ICAL.Component>): boolean {
  return String(component.getFirstPropertyValue("status") ?? "").toUpperCase() === "CANCELLED";
}

/**
 * Parse an ICS feed and return every event occurrence that overlaps [from, to).
 * Recurring events (weekly lectures etc.), moved/cancelled occurrences and EXDATEs are handled.
 */
export function parseIcs(
  text: string,
  opts: { sourceId: string; from: number; to: number; userTz: string },
): CalendarEvent[] {
  const root = new ICAL.Component(ICAL.parse(text));
  const vevents = root.getAllSubcomponents("vevent");

  // Group by UID so moved occurrences (RECURRENCE-ID) attach to their series.
  const masters = new Map<string, ICALEvent>();
  const exceptions: InstanceType<typeof ICAL.Component>[] = [];
  const standalone: ICALEvent[] = [];

  for (const ve of vevents) {
    const uid = String(ve.getFirstPropertyValue("uid") ?? "");
    if (ve.hasProperty("recurrence-id")) {
      exceptions.push(ve);
    } else if (uid && ve.hasProperty("rrule")) {
      masters.set(uid, new ICAL.Event(ve));
    } else {
      standalone.push(new ICAL.Event(ve));
    }
  }
  for (const ex of exceptions) {
    const master = masters.get(String(ex.getFirstPropertyValue("uid") ?? ""));
    if (master) master.relateException(ex);
    else standalone.push(new ICAL.Event(ex));
  }

  const out: CalendarEvent[] = [];
  const push = (ev: ICALEvent, start: ICALTime, end: ICALTime, key: string, tz: string, item: ICALEvent) => {
    const s = toEpoch(start, tz);
    let e = toEpoch(end, tz);
    if (e <= s) e = start.isDate ? s + 86_400_000 : s; // missing DTEND
    if (e <= opts.from || s >= opts.to) return;
    out.push({
      id: `${opts.sourceId}:${key}`,
      sourceId: opts.sourceId,
      title: item.summary || "(busy)",
      start: new Date(s).toISOString(),
      end: new Date(e).toISOString(),
      allDay: start.isDate,
      busy: isBusy(item),
      location: item.location || undefined,
    });
  };

  for (const ev of standalone) {
    if (isCancelled(ev.component) || !ev.startDate) continue;
    const tz = eventTz(ev, opts.userTz);
    const end = ev.endDate ?? ev.startDate;
    push(ev, ev.startDate, end, `${ev.uid}:${ev.startDate.toString()}`, tz, ev);
  }

  masters.forEach((ev) => {
    if (isCancelled(ev.component)) return;
    const tz = eventTz(ev, opts.userTz);
    const durationMs = (toEpoch(ev.endDate ?? ev.startDate, tz) - toEpoch(ev.startDate, tz));
    const it = ev.iterator();
    let next: ICALTime | null;
    let n = 0;
    while ((next = it.next()) && n++ < MAX_OCCURRENCES_PER_EVENT) {
      const occStart = toEpoch(next, tz);
      if (occStart >= opts.to) break;
      // Cheap skip for old occurrences of long-running series.
      if (occStart + Math.max(durationMs, 86_400_000) < opts.from) continue;
      const d = ev.getOccurrenceDetails(next);
      const item = d.item as ICALEvent;
      if (isCancelled(item.component)) continue;
      push(ev, d.startDate, d.endDate, `${ev.uid}:${d.recurrenceId.toString()}`, eventTz(item, opts.userTz), item);
    }
  });

  return out.sort((a, b) => (a.start < b.start ? -1 : 1));
}

/** Basic guard so the server only fetches public HTTPS calendar feeds. */
export function normalizeFeedUrl(raw: string): URL {
  const trimmed = raw.trim().replace(/^webcals?:\/\//i, "https://");
  const url = new URL(trimmed);
  if (url.protocol !== "https:") throw new Error("Calendar link must start with https:// or webcal://");
  const host = url.hostname.toLowerCase();
  const isPrivate =
    host === "localhost" ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    /^\d{1,3}(\.\d{1,3}){3}$/.test(host) ||
    host.includes(":");
  if (isPrivate) throw new Error("Calendar link must be a public web address");
  return url;
}

export async function fetchIcs(url: URL): Promise<string> {
  const res = await fetch(url, {
    headers: { Accept: "text/calendar, text/plain;q=0.9, */*;q=0.5", "User-Agent": "DayPlanner/1.0" },
    redirect: "follow",
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`Calendar server answered ${res.status}`);
  const text = await res.text();
  if (text.length > 15_000_000) throw new Error("Calendar feed is too large");
  if (!text.includes("BEGIN:VCALENDAR")) throw new Error("That link doesn't return a calendar (ICS) file");
  return text;
}
