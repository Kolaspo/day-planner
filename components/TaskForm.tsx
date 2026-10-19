"use client";

import { useMemo, useState } from "react";
import type { HistoryItem } from "@/lib/learning";
import { suggestionFor } from "@/lib/derive";
import type { Quadrant, Task } from "@/lib/types";
import { QUADRANTS } from "@/lib/types";
import { fmtMinutes } from "@/lib/time";
import { Q_BG, Q_BORDER, Q_SOFT } from "./ui";
import type { NewTask } from "@/hooks/usePlannerData";

const QUICK = [15, 30, 45, 60, 90, 120];

export default function TaskForm({
  initial,
  categories,
  history,
  onSubmit,
  onCancel,
  submitLabel = "Add task",
}: {
  initial?: Partial<Task>;
  categories: string[];
  history: HistoryItem[];
  onSubmit: (t: NewTask) => Promise<void> | void;
  onCancel?: () => void;
  submitLabel?: string;
}) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [minutes, setMinutes] = useState<number>(initial?.estimate_minutes ?? 30);
  const [category, setCategory] = useState(initial?.category ?? "");
  const [due, setDue] = useState(initial?.due_date ?? "");
  const [quadrant, setQuadrant] = useState<Quadrant | null>(initial?.quadrant ?? null);
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [more, setMore] = useState(Boolean(initial?.due_date || initial?.notes || initial?.quadrant));
  const [busy, setBusy] = useState(false);

  const hint = useMemo(
    () => (title.trim() || category.trim() ? suggestionFor({ title, category: category.trim() || null, estimate_minutes: minutes }, history) : null),
    [title, category, minutes, history],
  );

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || minutes < 5) return;
    setBusy(true);
    await onSubmit({
      title: title.trim(),
      estimate_minutes: Math.min(600, Math.max(5, Math.round(minutes))),
      category: category.trim() || null,
      due_date: due || null,
      quadrant,
      notes: notes.trim() || null,
    });
    setBusy(false);
    if (!initial) {
      setTitle("");
      setNotes("");
      setDue("");
      setQuadrant(null);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <input className="input text-base" placeholder="What needs doing?" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus={!initial} maxLength={200} />

      <div>
        <span className="label">How long will it take?</span>
        <div className="flex flex-wrap items-center gap-1.5">
          {QUICK.map((m) => (
            <button type="button" key={m} onClick={() => setMinutes(m)} className={`chip ${minutes === m ? "border-ink bg-ink text-paper hover:bg-ink" : ""}`}>
              {m < 60 ? `${m}m` : `${m / 60}h`}
            </button>
          ))}
          <div className="flex items-center gap-1">
            <input type="number" min={5} max={600} step={5} className="input w-20 py-1 text-sm" value={minutes} onChange={(e) => setMinutes(Number(e.target.value))} aria-label="Minutes" />
            <span className="text-xs text-muted">min</span>
          </div>
        </div>
        {hint && (
          <p className="mt-2 rounded-lg bg-accent/10 px-2.5 py-1.5 text-xs text-accent">
            {hint.ratio > 1.05
              ? `Similar ${hint.basis === "category" ? `“${category.trim()}”` : ""} tasks took you ${hint.ratio}× longer than planned`
              : hint.ratio < 0.95
                ? `You usually finish similar tasks faster (${hint.ratio}×)`
                : "Your estimates for similar tasks are spot on"}
            {" "}— the planner will block <b>{fmtMinutes(hint.minutes)}</b>.
            <span className="opacity-70"> Based on {hint.samples} task{hint.samples > 1 ? "s" : ""}.</span>
          </p>
        )}
      </div>

      <div>
        <label className="label" htmlFor="cat">Category <span className="normal-case tracking-normal">(helps the planner learn)</span></label>
        <input id="cat" className="input" list="categories" placeholder="e.g. Accounting, Reading, Gym" value={category} onChange={(e) => setCategory(e.target.value)} maxLength={60} />
        <datalist id="categories">
          {categories.map((c) => <option key={c} value={c} />)}
        </datalist>
      </div>

      {more ? (
        <>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor="due">Due</label>
              <input id="due" type="date" className="input" value={due} onChange={(e) => setDue(e.target.value)} />
            </div>
            <div>
              <span className="label">Priority</span>
              <div className="grid grid-cols-4 gap-1">
                {([1, 2, 3, 4] as Quadrant[]).map((q) => (
                  <button key={q} type="button" title={QUADRANTS[q].label} onClick={() => setQuadrant(quadrant === q ? null : q)} className={`h-[42px] rounded-xl border-2 text-xs font-semibold ${quadrant === q ? `${Q_BORDER[q]} ${Q_SOFT[q]}` : "border-line"}`}>
                    <span className={`mx-auto block h-2.5 w-2.5 rounded-full ${Q_BG[q]}`} />Q{q}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <textarea className="input min-h-[70px]" placeholder="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={2000} />
        </>
      ) : (
        <button type="button" className="text-xs font-medium text-muted underline" onClick={() => setMore(true)}>+ due date, priority, notes</button>
      )}

      <div className="flex gap-2">
        <button className="btn-primary flex-1 py-2.5" disabled={busy || !title.trim()}>{busy ? "Saving…" : submitLabel}</button>
        {onCancel && <button type="button" className="btn-outline" onClick={onCancel}>Cancel</button>}
      </div>
    </form>
  );
}
