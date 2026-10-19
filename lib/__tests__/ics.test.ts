import { describe, expect, it } from "vitest";
import { normalizeFeedUrl, parseIcs } from "../ics";

// Outlook-style feed: Windows zone name with a VTIMEZONE block, weekly lecture,
// one week skipped (EXDATE), one week moved (RECURRENCE-ID).
const OUTLOOK = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:Microsoft Exchange Server 2010
BEGIN:VTIMEZONE
TZID:FLE Standard Time
BEGIN:STANDARD
DTSTART:16010101T040000
TZOFFSETFROM:+0300
TZOFFSETTO:+0200
RRULE:FREQ=YEARLY;INTERVAL=1;BYDAY=-1SU;BYMONTH=10
END:STANDARD
BEGIN:DAYLIGHT
DTSTART:16010101T030000
TZOFFSETFROM:+0200
TZOFFSETTO:+0300
RRULE:FREQ=YEARLY;INTERVAL=1;BYDAY=-1SU;BYMONTH=3
END:DAYLIGHT
END:VTIMEZONE
BEGIN:VEVENT
UID:lecture-1
SUMMARY:Financial accounting lecture
DTSTART;TZID=FLE Standard Time:20260907T101500
DTEND;TZID=FLE Standard Time:20260907T115000
RRULE:FREQ=WEEKLY;UNTIL=20261221T235959Z;BYDAY=MO
EXDATE;TZID=FLE Standard Time:20261012T101500
END:VEVENT
BEGIN:VEVENT
UID:lecture-1
RECURRENCE-ID;TZID=FLE Standard Time:20261019T101500
SUMMARY:Financial accounting lecture (room change)
DTSTART;TZID=FLE Standard Time:20261019T140000
DTEND;TZID=FLE Standard Time:20261019T153500
END:VEVENT
BEGIN:VEVENT
UID:holiday
SUMMARY:Reading week
DTSTART;VALUE=DATE:20261019
DTEND;VALUE=DATE:20261020
TRANSP:TRANSPARENT
END:VEVENT
BEGIN:VEVENT
UID:cancelled
SUMMARY:Cancelled seminar
STATUS:CANCELLED
DTSTART;TZID=FLE Standard Time:20261019T090000
DTEND;TZID=FLE Standard Time:20261019T100000
END:VEVENT
BEGIN:VEVENT
UID:no-vtimezone
SUMMARY:Seminar (zone name only)
DTSTART;TZID=GMT Standard Time:20261019T170000
DTEND;TZID=GMT Standard Time:20261019T180000
END:VEVENT
END:VCALENDAR`;

const GOOGLE = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Google Inc//Google Calendar 70.9054//EN
BEGIN:VEVENT
UID:g1@google.com
SUMMARY:Gym
DTSTART:20261019T050000Z
DTEND:20261019T063000Z
END:VEVENT
END:VCALENDAR`;

const tz = "Europe/Riga";
const day = (d: string) => ({
  from: Date.parse(`${d}T00:00:00+03:00`),
  to: Date.parse(`${d}T23:59:59+03:00`),
});

describe("parseIcs", () => {
  it("expands weekly lectures in the feed's own time zone", () => {
    const ev = parseIcs(OUTLOOK, { sourceId: "o", userTz: tz, ...day("2026-10-05") });
    expect(ev).toHaveLength(1);
    expect(ev[0].start).toBe("2026-10-05T07:15:00.000Z"); // 10:15 Riga summer time (+3)
    expect(ev[0].end).toBe("2026-10-05T08:50:00.000Z");
  });

  it("skips EXDATE weeks", () => {
    const ev = parseIcs(OUTLOOK, { sourceId: "o", userTz: tz, ...day("2026-10-12") });
    expect(ev.filter((e) => e.title.startsWith("Financial"))).toHaveLength(0);
  });

  it("uses moved occurrences, drops cancelled ones, marks free/all-day events", () => {
    const ev = parseIcs(OUTLOOK, { sourceId: "o", userTz: tz, ...day("2026-10-19") });
    const titles = ev.map((e) => e.title);
    expect(titles).toContain("Financial accounting lecture (room change)");
    expect(titles).not.toContain("Cancelled seminar");
    const moved = ev.find((e) => e.title.includes("room change"))!;
    expect(moved.start).toBe("2026-10-19T11:00:00.000Z");
    const allDay = ev.find((e) => e.title === "Reading week")!;
    expect(allDay.allDay).toBe(true);
    expect(allDay.busy).toBe(false);
  });

  it("handles winter time after the DST change", () => {
    const ev = parseIcs(OUTLOOK, { sourceId: "o", userTz: tz, from: Date.parse("2026-11-02T00:00:00+02:00"), to: Date.parse("2026-11-02T23:59:59+02:00") });
    expect(ev[0].start).toBe("2026-11-02T08:15:00.000Z"); // 10:15 Riga winter time (+2)
  });

  it("maps Windows zone names that have no VTIMEZONE block", () => {
    const ev = parseIcs(OUTLOOK, { sourceId: "o", userTz: tz, ...day("2026-10-19") });
    const s = ev.find((e) => e.title.startsWith("Seminar"))!;
    expect(s.start).toBe("2026-10-19T16:00:00.000Z"); // 17:00 London summer time (+1)
  });

  it("reads Google UTC events", () => {
    const ev = parseIcs(GOOGLE, { sourceId: "g", userTz: tz, ...day("2026-10-19") });
    expect(ev[0]).toMatchObject({ title: "Gym", start: "2026-10-19T05:00:00.000Z", busy: true });
  });
});

describe("normalizeFeedUrl", () => {
  it("turns webcal into https", () => {
    expect(normalizeFeedUrl("webcal://calendar.google.com/x.ics").href).toBe("https://calendar.google.com/x.ics");
  });
  it("rejects http and private hosts", () => {
    expect(() => normalizeFeedUrl("http://example.com/a.ics")).toThrow();
    expect(() => normalizeFeedUrl("https://localhost/a.ics")).toThrow();
    expect(() => normalizeFeedUrl("https://10.0.0.1/a.ics")).toThrow();
  });
});
