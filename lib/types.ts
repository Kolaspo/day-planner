export type Quadrant = 1 | 2 | 3 | 4;

export interface Task {
  id: string;
  user_id: string;
  title: string;
  category: string | null;
  notes: string | null;
  estimate_minutes: number;
  quadrant: Quadrant | null;
  due_date: string | null; // YYYY-MM-DD
  planned_start: string | null; // ISO
  planned_end: string | null; // ISO
  status: "todo" | "done";
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface TimeEntry {
  id: string;
  user_id: string;
  task_id: string;
  started_at: string;
  ended_at: string | null;
}

export interface Settings {
  user_id: string;
  day_start: string; // "HH:MM:SS"
  day_end: string;
  buffer_minutes: number;
  use_learning: boolean;
  include_q4: boolean;
}

export interface CalendarSource {
  id: string;
  name: string;
  provider: "google" | "outlook" | "other";
  color: string;
  created_at: string;
}

export interface CalendarEvent {
  id: string;
  sourceId: string;
  title: string;
  start: string; // ISO
  end: string; // ISO
  allDay: boolean;
  busy: boolean;
  location?: string;
}

export interface Interval {
  start: number; // epoch ms
  end: number;
}

export const QUADRANTS: Record<Quadrant, { label: string; short: string; hint: string }> = {
  1: { label: "Urgent & important", short: "Do now", hint: "Deadlines, exams, crises" },
  2: { label: "Important, not urgent", short: "Schedule", hint: "Study, projects, health" },
  3: { label: "Urgent, not important", short: "Squeeze in", hint: "Errands, most messages" },
  4: { label: "Neither", short: "Drop or later", hint: "Nice-to-haves" },
};
