import { suggestDuration, trackedMinutes, type DurationSuggestion, type HistoryItem } from "./learning";
import type { Task, TimeEntry } from "./types";
import { dateKey } from "./time";

export function entriesByTask(entries: TimeEntry[]): Map<string, TimeEntry[]> {
  const m = new Map<string, TimeEntry[]>();
  for (const e of entries) {
    const list = m.get(e.task_id);
    if (list) list.push(e);
    else m.set(e.task_id, [e]);
  }
  return m;
}

export function buildHistory(tasks: Task[], byTask: Map<string, TimeEntry[]>): HistoryItem[] {
  return tasks
    .filter((t) => t.status === "done" && t.completed_at)
    .map((t) => ({
      title: t.title,
      category: t.category,
      estimateMinutes: t.estimate_minutes,
      actualMinutes: trackedMinutes(byTask.get(t.id) ?? []),
      completedAt: t.completed_at!,
    }));
}

export function suggestionFor(
  task: Pick<Task, "title" | "category" | "estimate_minutes">,
  history: HistoryItem[],
): DurationSuggestion | null {
  return suggestDuration({ title: task.title, category: task.category, estimateMinutes: task.estimate_minutes }, history);
}

/** How many minutes to block for a task: learned duration (if on) minus what's already tracked. */
export function minutesToPlan(
  task: Task,
  history: HistoryItem[],
  useLearning: boolean,
  tracked: number,
): { minutes: number; suggestion: DurationSuggestion | null } {
  const suggestion = useLearning ? suggestionFor(task, history) : null;
  const base = suggestion?.minutes ?? task.estimate_minutes;
  const left = tracked > 0 ? Math.max(10, Math.round((base - tracked) / 5) * 5) : base;
  return { minutes: left, suggestion };
}

export const plannedDay = (t: Task) => (t.planned_start ? dateKey(new Date(t.planned_start)) : null);

/** Planned on an earlier day but never finished → treat as unplanned again. */
export const isCarriedOver = (t: Task, today: string) => {
  const d = plannedDay(t);
  return t.status === "todo" && d !== null && d < today;
};
