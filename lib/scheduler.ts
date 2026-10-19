import type { Interval, Quadrant } from "./types";

export const MIN = 60_000;

export interface SchedulableTask {
  id: string;
  quadrant: Quadrant | null;
  minutes: number; // duration to plan (already adjusted by learning if enabled)
  dueDate: string | null; // YYYY-MM-DD
  createdAt: string;
}

export interface Placement {
  taskId: string;
  start: number;
  end: number;
}

export interface Unplaced {
  taskId: string;
  reason: string;
}

export interface ScheduleInput {
  window: Interval; // the part of the day that may be planned
  busy: Interval[]; // lectures, seminars, already-planned tasks
  tasks: SchedulableTask[];
  bufferMinutes: number;
  includeQ4: boolean;
  /** Round start times up to this many minutes (e.g. 5 → 10:05, never 10:03). */
  snapMinutes?: number;
}

export interface ScheduleResult {
  placements: Placement[];
  unplaced: Unplaced[];
}

/** Merge overlapping or touching intervals. */
export function mergeIntervals(intervals: Interval[]): Interval[] {
  const sorted = intervals
    .filter((i) => i.end > i.start)
    .map((i) => ({ ...i }))
    .sort((a, b) => a.start - b.start);
  const out: Interval[] = [];
  for (const cur of sorted) {
    const last = out[out.length - 1];
    if (last && cur.start <= last.end) last.end = Math.max(last.end, cur.end);
    else out.push(cur);
  }
  return out;
}

/**
 * Free gaps inside `window`, after padding every busy block with `buffer` minutes on each side.
 * The padding is what leaves breathing room between a lecture and a task, and between tasks.
 */
export function freeSlots(window: Interval, busy: Interval[], bufferMinutes: number): Interval[] {
  const pad = bufferMinutes * MIN;
  const blocked = mergeIntervals(busy.map((b) => ({ start: b.start - pad, end: b.end + pad })));
  const slots: Interval[] = [];
  let cursor = window.start;
  for (const b of blocked) {
    if (b.end <= cursor) continue;
    if (b.start >= window.end) break;
    if (b.start > cursor) slots.push({ start: cursor, end: Math.min(b.start, window.end) });
    cursor = Math.max(cursor, b.end);
    if (cursor >= window.end) break;
  }
  if (cursor < window.end) slots.push({ start: cursor, end: window.end });
  return slots.filter((s) => s.end > s.start);
}

const quadrantRank = (q: Quadrant | null) => (q == null ? 5 : q);

/** Most important first: Q1 → Q2 → Q3 → Q4, then earliest due date, then longest, then oldest. */
export function priorityOrder(tasks: SchedulableTask[]): SchedulableTask[] {
  return [...tasks].sort((a, b) => {
    const q = quadrantRank(a.quadrant) - quadrantRank(b.quadrant);
    if (q) return q;
    const ad = a.dueDate ?? "9999-12-31";
    const bd = b.dueDate ?? "9999-12-31";
    if (ad !== bd) return ad < bd ? -1 : 1;
    if (a.minutes !== b.minutes) return b.minutes - a.minutes;
    return a.createdAt < b.createdAt ? -1 : 1;
  });
}

function snapUp(t: number, snapMinutes: number) {
  const step = snapMinutes * MIN;
  return Math.ceil(t / step) * step;
}

/**
 * Greedy first-fit: take tasks in priority order and put each into the earliest free gap that
 * holds it (plus buffers). The most important work lands earliest in the day.
 */
export function schedule(input: ScheduleInput): ScheduleResult {
  const snap = input.snapMinutes ?? 5;
  const busy = [...input.busy];
  const placements: Placement[] = [];
  const unplaced: Unplaced[] = [];

  const candidates = priorityOrder(
    input.tasks.filter((t) => t.quadrant != null && (input.includeQ4 || t.quadrant !== 4)),
  );

  for (const task of candidates) {
    const duration = task.minutes * MIN;
    const slots = freeSlots(input.window, busy, input.bufferMinutes);
    let placed = false;
    for (const slot of slots) {
      const start = snapUp(slot.start, snap);
      if (start + duration <= slot.end) {
        placements.push({ taskId: task.id, start, end: start + duration });
        busy.push({ start, end: start + duration });
        placed = true;
        break;
      }
    }
    if (!placed) {
      const largest = slots.reduce((m, s) => Math.max(m, s.end - snapUp(s.start, snap)), 0);
      unplaced.push({
        taskId: task.id,
        reason:
          largest <= 0
            ? "No free time left today"
            : `Needs ${task.minutes} min, largest free gap is ${Math.floor(largest / MIN)} min`,
      });
    }
  }

  return { placements, unplaced };
}
