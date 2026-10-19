/**
 * Learns how long your tasks really take compared with your estimates.
 *
 * For a new task it looks for finished tasks that are "similar" (same category, or a title that
 * shares enough words) and computes your typical overrun/underrun ratio, weighting recent tasks
 * more. Ratios are averaged in log-space so 2× over and 2× under cancel out fairly.
 */

export interface HistoryItem {
  title: string;
  category: string | null;
  estimateMinutes: number;
  actualMinutes: number;
  completedAt: string; // ISO
}

export interface DurationSuggestion {
  minutes: number; // suggested duration to plan, rounded to 5
  ratio: number; // actual / estimate for similar tasks
  samples: number;
  avgActual: number; // average real minutes for similar tasks
  basis: "category" | "title";
}

const STOP = new Set(["the", "a", "an", "and", "or", "of", "to", "for", "in", "on", "with", "un", "par", "ar", "uz", "no"]);

export function tokens(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "") // strip diacritics so "uzdevums" ≈ "uzdevums"
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length > 2 && !STOP.has(w)),
  );
}

export function jaccard(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  a.forEach((w) => {
    if (b.has(w)) inter++;
  });
  return inter / (a.size + b.size - inter);
}

const norm = (s: string | null) => (s ?? "").trim().toLowerCase();

/** Ignore sessions too short to mean anything (e.g. a timer started by accident). */
const MIN_ACTUAL = 3;
const HALF_LIFE = 8; // the 8th most recent sample counts half as much as the newest

export function suggestDuration(
  task: { title: string; category: string | null; estimateMinutes: number },
  history: HistoryItem[],
): DurationSuggestion | null {
  const usable = history.filter((h) => h.actualMinutes >= MIN_ACTUAL && h.estimateMinutes > 0);

  let basis: DurationSuggestion["basis"] = "category";
  let similar = task.category ? usable.filter((h) => norm(h.category) === norm(task.category)) : [];

  if (similar.length === 0) {
    basis = "title";
    const t = tokens(task.title);
    similar = usable.filter((h) => jaccard(t, tokens(h.title)) >= 0.34);
  }
  if (similar.length === 0) return null;

  similar.sort((a, b) => (a.completedAt < b.completedAt ? 1 : -1)); // newest first

  let wSum = 0;
  let logSum = 0;
  let actualSum = 0;
  similar.slice(0, 30).forEach((h, i) => {
    const w = Math.pow(0.5, i / HALF_LIFE);
    const r = Math.min(4, Math.max(0.25, h.actualMinutes / h.estimateMinutes));
    wSum += w;
    logSum += w * Math.log(r);
    actualSum += w * h.actualMinutes;
  });

  let ratio = Math.exp(logSum / wSum);
  // With little evidence, pull the ratio toward 1 (trust your own estimate more).
  const n = similar.length;
  const confidence = n / (n + 2);
  ratio = Math.exp(Math.log(ratio) * confidence);

  const minutes = Math.max(5, Math.round((task.estimateMinutes * ratio) / 5) * 5);
  return {
    minutes: Math.min(600, minutes),
    ratio: Math.round(ratio * 100) / 100,
    samples: n,
    avgActual: Math.round(actualSum / wSum),
    basis,
  };
}

/** Total tracked minutes for one task's entries (a running entry counts up to `now`). */
export function trackedMinutes(
  entries: { started_at: string; ended_at: string | null }[],
  now = Date.now(),
): number {
  let ms = 0;
  for (const e of entries) {
    const end = e.ended_at ? Date.parse(e.ended_at) : now;
    ms += Math.max(0, end - Date.parse(e.started_at));
  }
  return ms / 60_000;
}
