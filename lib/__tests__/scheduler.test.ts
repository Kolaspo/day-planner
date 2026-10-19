import { describe, expect, it } from "vitest";
import { freeSlots, schedule, type SchedulableTask } from "../scheduler";

const at = (hhmm: string) => Date.parse(`2026-10-19T${hhmm}:00Z`);
const task = (id: string, quadrant: 1 | 2 | 3 | 4 | null, minutes: number, extra: Partial<SchedulableTask> = {}): SchedulableTask => ({
  id, quadrant, minutes, dueDate: null, createdAt: "2026-10-18T00:00:00Z", ...extra,
});
const hhmm = (t: number) => new Date(t).toISOString().slice(11, 16);

describe("freeSlots", () => {
  it("pads events with the buffer and clips to the window", () => {
    const slots = freeSlots({ start: at("08:00"), end: at("18:00") }, [{ start: at("10:00"), end: at("11:30") }], 15);
    expect(slots.map((s) => [hhmm(s.start), hhmm(s.end)])).toEqual([
      ["08:00", "09:45"],
      ["11:45", "18:00"],
    ]);
  });

  it("merges overlapping events", () => {
    const slots = freeSlots(
      { start: at("08:00"), end: at("12:00") },
      [{ start: at("09:00"), end: at("10:00") }, { start: at("09:30"), end: at("10:30") }],
      0,
    );
    expect(slots.map((s) => [hhmm(s.start), hhmm(s.end)])).toEqual([
      ["08:00", "09:00"],
      ["10:30", "12:00"],
    ]);
  });
});

describe("schedule", () => {
  const window = { start: at("08:00"), end: at("18:00") };
  const lecture = { start: at("10:15"), end: at("11:50") };

  it("places the most important tasks first, with buffers, never over events", () => {
    const { placements, unplaced } = schedule({
      window,
      busy: [lecture],
      bufferMinutes: 10,
      includeQ4: false,
      tasks: [task("errand", 3, 30), task("study", 2, 90), task("deadline", 1, 60)],
    });
    const byId = Object.fromEntries(placements.map((p) => [p.taskId, [hhmm(p.start), hhmm(p.end)]]));
    expect(byId.deadline).toEqual(["08:00", "09:00"]);
    // 90 min doesn't fit 09:10–10:05, so it goes after the lecture + buffer.
    expect(byId.study).toEqual(["12:00", "13:30"]);
    // The errand fits in the morning gap after the deadline task.
    expect(byId.errand).toEqual(["09:10", "09:40"]);
    expect(unplaced).toEqual([]);
  });

  it("skips unsorted tasks and Q4 unless asked", () => {
    const tasks = [task("a", null, 30), task("b", 4, 30)];
    expect(schedule({ window, busy: [], bufferMinutes: 10, includeQ4: false, tasks }).placements).toHaveLength(0);
    expect(schedule({ window, busy: [], bufferMinutes: 10, includeQ4: true, tasks }).placements).toHaveLength(1);
  });

  it("orders by due date inside a quadrant", () => {
    const { placements } = schedule({
      window, busy: [], bufferMinutes: 0, includeQ4: false,
      tasks: [task("later", 2, 30, { dueDate: "2026-10-30" }), task("sooner", 2, 30, { dueDate: "2026-10-20" })],
    });
    expect(placements[0].taskId).toBe("sooner");
  });

  it("reports tasks that cannot fit", () => {
    const { unplaced } = schedule({
      window: { start: at("08:00"), end: at("09:00") }, busy: [], bufferMinutes: 10, includeQ4: false,
      tasks: [task("big", 1, 120)],
    });
    expect(unplaced[0].reason).toMatch(/largest free gap is 60 min/);
  });

  it("snaps start times to 5 minutes", () => {
    const { placements } = schedule({
      window: { start: at("08:03"), end: at("12:00") }, busy: [], bufferMinutes: 0, includeQ4: false,
      tasks: [task("x", 1, 30)],
    });
    expect(hhmm(placements[0].start)).toBe("08:05");
  });
});
