"use client";

import { useMemo, useState } from "react";
import type { ViewProps } from "./PlannerApp";
import { Empty, QuadrantDot, Stat } from "./ui";
import { Icon } from "./Icon";
import { trackedMinutes } from "@/lib/learning";
import { plannedDay } from "@/lib/derive";
import { at, dayRange, fmtMinutes, fmtTime } from "@/lib/time";
import type { Task, TimeEntry } from "@/lib/types";

export default function ReviewView({ data, day, byTask, history }: ViewProps) {
  const [open, setOpen] = useState<string | null>(null);
  const { start: d0, end: d1 } = dayRange(day);

  const dayEntries = data.entries.filter((e) => Date.parse(e.started_at) >= d0 && Date.parse(e.started_at) < d1);
  const ids = new Set([...data.tasks.filter((t) => plannedDay(t) === day).map((t) => t.id), ...dayEntries.map((e) => e.task_id)]);
  const rows = data.tasks
    .filter((t) => ids.has(t.id))
    .map((t) => {
      const entries = dayEntries.filter((e) => e.task_id === t.id);
      const planned = plannedDay(t) === day ? (Date.parse(t.planned_end!) - Date.parse(t.planned_start!)) / 60_000 : 0;
      return { t, entries, planned, actual: trackedMinutes(entries), total: trackedMinutes(byTask.get(t.id) ?? []) };
    })
    .sort((a, b) => (a.t.planned_start ?? "z") < (b.t.planned_start ?? "z") ? -1 : 1);

  const plannedSum = rows.reduce((s, r) => s + r.planned, 0);
  const actualSum = rows.reduce((s, r) => s + r.actual, 0);
  const doneRows = rows.filter((r) => r.t.status === "done" && r.t.completed_at && Date.parse(r.t.completed_at) >= d0 && Date.parse(r.t.completed_at) < d1);
  const estSum = doneRows.reduce((s, r) => s + r.t.estimate_minutes, 0);
  const doneActual = doneRows.reduce((s, r) => s + r.total, 0);

  const categories = useMemo(() => {
    const m = new Map<string, { n: number; est: number; act: number }>();
    for (const h of history) {
      if (h.actualMinutes < 3) continue;
      const key = h.category?.trim() || "No category";
      const c = m.get(key) ?? { n: 0, est: 0, act: 0 };
      c.n++;
      c.est += h.estimateMinutes;
      c.act += h.actualMinutes;
      m.set(key, c);
    }
    return Array.from(m.entries()).map(([name, c]) => ({ name, ...c, ratio: c.act / c.est })).sort((a, b) => b.n - a.n);
  }, [history]);
  const maxRatio = Math.max(2, ...categories.map((c) => c.ratio));

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Planned" value={fmtMinutes(plannedSum)} />
        <Stat label="Actually worked" value={fmtMinutes(actualSum)} sub={plannedSum ? `${Math.round((actualSum / plannedSum) * 100)}% of plan` : undefined} />
        <Stat label="Finished" value={String(doneRows.length)} sub={`of ${rows.length} touched`} />
        <Stat label="Estimate accuracy" value={estSum ? `${(doneActual / estSum).toFixed(2)}×` : "—"} sub={estSum ? (doneActual > estSum ? "took longer than estimated" : "faster than estimated") : "finish tasks to see"} />
      </div>

      <section>
        <p className="eyebrow mb-2">Planned vs real</p>
        {rows.length === 0 ? (
          <Empty title="Nothing tracked on this day" />
        ) : (
          <div className="card overflow-hidden">
            <div className="hidden grid-cols-[1fr_80px_80px_80px_36px] gap-2 border-b border-line px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted md:grid">
              <span>Task</span><span className="text-right">Estimate</span><span className="text-right">Planned</span><span className="text-right">Real</span><span />
            </div>
            <ul className="divide-y divide-line">
              {rows.map((r) => (
                <li key={r.t.id}>
                  <button onClick={() => setOpen(open === r.t.id ? null : r.t.id)} className="grid w-full grid-cols-[1fr_auto] items-center gap-2 px-4 py-3 text-left md:grid-cols-[1fr_80px_80px_80px_36px]">
                    <span className="flex min-w-0 items-center gap-2">
                      <QuadrantDot q={r.t.quadrant} />
                      <span className="truncate font-medium">{r.t.title}</span>
                      {r.t.status === "done" && <Icon name="check" size={14} className="shrink-0 text-accent" />}
                    </span>
                    <span className="text-right text-sm md:hidden">
                      <span className={r.actual > Math.max(r.planned, r.t.estimate_minutes) ? "font-medium text-q1" : ""}>{fmtMinutes(r.actual)}</span>
                      <span className="text-muted"> / {fmtMinutes(r.planned || r.t.estimate_minutes)}</span>
                    </span>
                    <span className="hidden text-right text-sm text-muted md:block">{fmtMinutes(r.t.estimate_minutes)}</span>
                    <span className="hidden text-right text-sm text-muted md:block">{r.planned ? fmtMinutes(r.planned) : "—"}</span>
                    <span className={`hidden text-right text-sm font-medium md:block ${r.actual > Math.max(r.planned, r.t.estimate_minutes) ? "text-q1" : ""}`}>{fmtMinutes(r.actual)}</span>
                    <span className="hidden justify-end text-muted md:flex"><Icon name="edit" size={14} /></span>
                  </button>
                  {open === r.t.id && <Sessions task={r.t} entries={r.entries} day={day} data={data} />}
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <section>
        <p className="eyebrow mb-1">What the planner has learned</p>
        <p className="mb-3 text-sm text-muted">Real time ÷ your estimate, per category (finished tasks, last 6 months). Above 1× means you underestimate.</p>
        {categories.length === 0 ? (
          <Empty title="Nothing learned yet">Time a few tasks with Start → Finish and give them a category.</Empty>
        ) : (
          <ul className="card divide-y divide-line">
            {categories.map((c) => (
              <li key={c.name} className="grid grid-cols-[120px_1fr_64px] items-center gap-3 px-4 py-2.5 text-sm md:grid-cols-[180px_1fr_80px_120px]">
                <span className="truncate font-medium">{c.name}</span>
                <span className="relative h-2 rounded-full bg-ink/10">
                  <span className="absolute top-[-3px] h-[14px] w-px bg-ink/40" style={{ left: `${(1 / maxRatio) * 100}%` }} />
                  <span className={`absolute left-0 top-0 h-2 rounded-full ${c.ratio > 1.1 ? "bg-q1" : c.ratio < 0.9 ? "bg-q2" : "bg-accent"}`} style={{ width: `${Math.min(100, (c.ratio / maxRatio) * 100)}%` }} />
                </span>
                <span className="text-right font-mono text-xs">{c.ratio.toFixed(2)}×</span>
                <span className="hidden text-right text-xs text-muted md:block">{c.n} task{c.n > 1 ? "s" : ""}, avg {fmtMinutes(c.act / c.n)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Sessions({ task, entries, day, data }: { task: Task; entries: TimeEntry[]; day: string; data: ViewProps["data"] }) {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  return (
    <div className="space-y-2 bg-paper px-4 py-3">
      <p className="eyebrow">Sessions</p>
      {entries.length === 0 && <p className="text-sm text-muted">No sessions on this day.</p>}
      {entries.map((e) => (
        <div key={e.id} className="flex items-center gap-2 text-sm">
          <input type="time" className="input w-[112px] px-2 py-1 font-mono text-xs" defaultValue={fmtTime(e.started_at)}
            onBlur={(ev) => ev.target.value && data.updateEntry(e.id, { started_at: new Date(at(day, ev.target.value)).toISOString() })} />
          <span className="text-muted">→</span>
          {e.ended_at ? (
            <input type="time" className="input w-[112px] px-2 py-1 font-mono text-xs" defaultValue={fmtTime(e.ended_at)}
              onBlur={(ev) => ev.target.value && data.updateEntry(e.id, { ended_at: new Date(at(day, ev.target.value)).toISOString() })} />
          ) : (
            <span className="w-[112px] text-xs text-accent">running</span>
          )}
          <span className="flex-1 text-xs text-muted">{Math.round(trackedMinutes([e]))} min</span>
          <button className="btn-ghost px-2 py-1 text-muted" onClick={() => confirm("Delete this session?") && data.deleteEntry(e.id)} aria-label="Delete session"><Icon name="trash" size={14} /></button>
        </div>
      ))}
      <form
        className="flex flex-wrap items-center gap-2 pt-1"
        onSubmit={(ev) => {
          ev.preventDefault();
          const s = at(day, from);
          const en = at(day, to);
          if (en > s) {
            data.addEntry(task.id, s, en);
            setFrom("");
            setTo("");
          }
        }}
      >
        <span className="text-xs text-muted">Add a session you forgot to time:</span>
        <input type="time" required className="input w-[112px] px-2 py-1 font-mono text-xs" value={from} onChange={(e) => setFrom(e.target.value)} />
        <span className="text-muted">→</span>
        <input type="time" required className="input w-[112px] px-2 py-1 font-mono text-xs" value={to} onChange={(e) => setTo(e.target.value)} />
        <button className="btn-outline px-2.5 py-1 text-xs"><Icon name="plus" size={13} /> Add</button>
      </form>
      <div className="flex gap-2 pt-1">
        {task.status === "done"
          ? <button className="btn-ghost px-2 py-1 text-xs" onClick={() => data.reopenTask(task.id)}><Icon name="undo" size={13} /> Reopen task</button>
          : <button className="btn-ghost px-2 py-1 text-xs" onClick={() => data.finishTask(task.id)}><Icon name="check" size={13} /> Mark finished</button>}
      </div>
    </div>
  );
}
