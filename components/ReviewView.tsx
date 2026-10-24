"use client";

import { useMemo, useState } from "react";
import type { ViewProps } from "./PlannerApp";
import { Empty, QuadrantDot, Stat } from "./ui";
import { Icon } from "./Icon";
import SessionEditor from "./SessionEditor";
import { trackedMinutes } from "@/lib/learning";
import { plannedDay } from "@/lib/derive";
import { dayRange, fmtDateTime, fmtMinutes, SUSPICIOUS_SESSION_MIN } from "@/lib/time";
import { useNow } from "@/hooks/useNow";
import type { Task } from "@/lib/types";

const MIN = 60_000;

export default function ReviewView({ data, day, byTask }: ViewProps) {
  const now = useNow(30_000);
  const [open, setOpen] = useState<string | null>(null); // task id open in "Planned vs real"
  const [openCat, setOpenCat] = useState<string | null>(null);
  const [openLearned, setOpenLearned] = useState<string | null>(null); // task id open in "learned"
  const [openSusp, setOpenSusp] = useState<string | null>(null);
  const { start: d0, end: d1 } = dayRange(day);
  const taskById = useMemo(() => new Map(data.tasks.map((t) => [t.id, t])), [data.tasks]);

  // ── Sessions that look like a forgotten timer (any day) ───────────────────
  const suspicious = data.entries
    .filter((e) => trackedMinutes([e], now) > SUSPICIOUS_SESSION_MIN && taskById.has(e.task_id))
    .sort((a, b) => (a.started_at < b.started_at ? 1 : -1));

  // ── Planned vs real for the selected day ──────────────────────────────────
  const dayEntries = data.entries.filter((e) => Date.parse(e.started_at) >= d0 && Date.parse(e.started_at) < d1);
  const ids = new Set([...data.tasks.filter((t) => plannedDay(t) === day).map((t) => t.id), ...dayEntries.map((e) => e.task_id)]);
  const rows = data.tasks
    .filter((t) => ids.has(t.id))
    .map((t) => {
      const entries = dayEntries.filter((e) => e.task_id === t.id);
      const planned = plannedDay(t) === day ? (Date.parse(t.planned_end!) - Date.parse(t.planned_start!)) / MIN : 0;
      return { t, planned, actual: trackedMinutes(entries, now), total: trackedMinutes(byTask.get(t.id) ?? [], now) };
    })
    .sort((a, b) => ((a.t.planned_start ?? "z") < (b.t.planned_start ?? "z") ? -1 : 1));

  const plannedSum = rows.reduce((s, r) => s + r.planned, 0);
  const actualSum = rows.reduce((s, r) => s + r.actual, 0);
  const doneRows = rows.filter((r) => r.t.status === "done" && r.t.completed_at && Date.parse(r.t.completed_at) >= d0 && Date.parse(r.t.completed_at) < d1);
  const estSum = doneRows.reduce((s, r) => s + r.t.estimate_minutes, 0);
  const doneActual = doneRows.reduce((s, r) => s + r.total, 0);

  // ── What the planner has learned (same data the learning uses) ────────────
  const categories = useMemo(() => {
    const m = new Map<string, { tasks: { t: Task; act: number }[]; est: number; act: number }>();
    for (const t of data.tasks) {
      if (t.status !== "done" || !t.completed_at) continue;
      const act = trackedMinutes(byTask.get(t.id) ?? []);
      if (act < 3) continue;
      const key = t.category?.trim() || "No category";
      const c = m.get(key) ?? { tasks: [], est: 0, act: 0 };
      c.tasks.push({ t, act });
      c.est += t.estimate_minutes;
      c.act += act;
      m.set(key, c);
    }
    const isOff = ({ t, act }: { t: Task; act: number }) =>
      act / t.estimate_minutes > 4 || (byTask.get(t.id) ?? []).some((e) => trackedMinutes([e]) > SUSPICIOUS_SESSION_MIN);
    return Array.from(m.entries())
      .map(([name, c]) => ({
        name,
        ...c,
        n: c.tasks.length,
        ratio: c.act / c.est,
        flagged: c.tasks.some(isOff),
        // Suspicious ones first, then newest
        tasks: c.tasks.sort((a, b) => Number(isOff(b)) - Number(isOff(a)) || (a.t.completed_at! < b.t.completed_at! ? 1 : -1)),
      }))
      .sort((a, b) => b.n - a.n);
  }, [data.tasks, byTask]);
  const maxRatio = Math.max(2, ...categories.map((c) => Math.min(c.ratio, 4)));

  return (
    <div className="space-y-6">
      {suspicious.length > 0 && (
        <section className="card overflow-hidden border-q1/40">
          <div className="flex items-start gap-3 bg-q1/10 px-4 py-3">
            <span className="mt-0.5 text-lg leading-none">⚠</span>
            <div className="flex-1">
              <p className="font-semibold">{suspicious.length === 1 ? "1 session looks wrong" : `${suspicious.length} sessions look wrong`}</p>
              <p className="text-xs text-muted">Longer than {SUSPICIOUS_SESSION_MIN / 60} hours, so probably a timer that wasn&apos;t stopped. Until you fix these, they skew your stats and the planner&apos;s learned durations.</p>
            </div>
          </div>
          <ul className="divide-y divide-line">
            {suspicious.map((e) => {
              const t = taskById.get(e.task_id)!;
              return (
                <li key={e.id}>
                  <div className="flex flex-wrap items-center gap-2 px-4 py-2.5">
                    <div className="min-w-0 flex-1 basis-full sm:basis-0">
                      <p className="flex items-center gap-1.5 truncate font-medium"><QuadrantDot q={t.quadrant} />{t.title}</p>
                      <p className="text-xs text-muted">
                        started {fmtDateTime(e.started_at)} · <b className="text-q1">{fmtMinutes(trackedMinutes([e], now))}</b>
                        {e.ended_at ? "" : " and still running"}
                      </p>
                    </div>
                    <button className="btn-accent px-2.5 py-1.5 text-xs"
                      onClick={() => data.updateEntry(e.id, { ended_at: new Date(Date.parse(e.started_at) + t.estimate_minutes * MIN).toISOString() })}>
                      Cut to estimate ({fmtMinutes(t.estimate_minutes)})
                    </button>
                    <button className="btn-outline px-2.5 py-1.5 text-xs" onClick={() => setOpenSusp(openSusp === e.id ? null : e.id)}>
                      <Icon name="edit" size={13} /> Set exact time
                    </button>
                  </div>
                  {openSusp === e.id && <SessionEditor task={t} entries={byTask.get(t.id) ?? []} data={data} now={now} />}
                </li>
              );
            })}
          </ul>
        </section>
      )}

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
                  {open === r.t.id && <SessionEditor task={r.t} entries={byTask.get(r.t.id) ?? []} data={data} now={now} />}
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <section>
        <p className="eyebrow mb-1">What the planner has learned</p>
        <p className="mb-3 text-sm text-muted">
          Real time ÷ your estimate, per category (finished tasks, last 6 months). Above 1× means you underestimate.
          Tap a category to see and correct the tasks behind it.
        </p>
        {categories.length === 0 ? (
          <Empty title="Nothing learned yet">Time a few tasks with Start → Finish and give them a category.</Empty>
        ) : (
          <ul className="card divide-y divide-line overflow-hidden">
            {categories.map((c) => (
              <li key={c.name}>
                <button
                  onClick={() => setOpenCat(openCat === c.name ? null : c.name)}
                  className="grid w-full grid-cols-[120px_1fr_64px_16px] items-center gap-3 px-4 py-2.5 text-left text-sm md:grid-cols-[180px_1fr_80px_150px_16px]"
                >
                  <span className="flex min-w-0 items-center gap-1 truncate font-medium">
                    {c.flagged && <span className="text-q1" title="Contains a suspicious time">⚠</span>}
                    <span className="truncate">{c.name}</span>
                  </span>
                  <span className="relative h-2 rounded-full bg-ink/10">
                    <span className="absolute top-[-3px] h-[14px] w-px bg-ink/40" style={{ left: `${(1 / maxRatio) * 100}%` }} />
                    <span className={`absolute left-0 top-0 h-2 rounded-full ${c.ratio > 1.1 ? "bg-q1" : c.ratio < 0.9 ? "bg-q2" : "bg-accent"}`} style={{ width: `${Math.min(100, (c.ratio / maxRatio) * 100)}%` }} />
                  </span>
                  <span className="text-right font-mono text-xs">{c.ratio.toFixed(2)}×</span>
                  <span className="hidden text-right text-xs text-muted md:block">{c.n} task{c.n > 1 ? "s" : ""}, avg {fmtMinutes(c.act / c.n)}</span>
                  <Icon name="chevron-right" size={14} className={`text-muted transition ${openCat === c.name ? "rotate-90" : ""}`} />
                </button>

                {openCat === c.name && (
                  <ul className="divide-y divide-line border-t border-line bg-paper/60">
                    {c.tasks.map(({ t, act }) => {
                      const r = act / t.estimate_minutes;
                      const off = r > 4 || (byTask.get(t.id) ?? []).some((e) => trackedMinutes([e]) > SUSPICIOUS_SESSION_MIN);
                      return (
                        <li key={t.id}>
                          <div className="flex items-center gap-3 py-2 pl-6 pr-4 text-sm">
                            <div className="min-w-0 flex-1">
                              <p className="truncate">{t.title}</p>
                              <p className="text-[11px] text-muted">
                                estimate {fmtMinutes(t.estimate_minutes)} · real <b className={off ? "text-q1" : "text-ink"}>{fmtMinutes(act)}</b> · {r.toFixed(2)}×{off && " ⚠"}
                              </p>
                            </div>
                            <button className={`${off ? "btn-accent" : "btn-outline"} px-2.5 py-1 text-xs`} onClick={() => setOpenLearned(openLearned === t.id ? null : t.id)}>
                              <Icon name="edit" size={13} /> {openLearned === t.id ? "Close" : "Fix time"}
                            </button>
                          </div>
                          {openLearned === t.id && <SessionEditor task={t} entries={byTask.get(t.id) ?? []} data={data} now={now} />}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
