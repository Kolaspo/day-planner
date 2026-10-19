"use client";

import { useState } from "react";
import type { ViewProps } from "./PlannerApp";
import { Icon } from "./Icon";
import { Empty, QuadrantDot, Q_BG } from "./ui";
import { useNow } from "@/hooks/useNow";
import { trackedMinutes } from "@/lib/learning";
import { minutesToPlan, plannedDay } from "@/lib/derive";
import { dateKey, dayRange, fmtClock, fmtMinutes, fmtTime } from "@/lib/time";
import type { Task } from "@/lib/types";

export default function NowView({ data, byTask, history, settings, setTab }: ViewProps) {
  const now = useNow(1000);
  const today = dateKey(now);
  const [showAll, setShowAll] = useState(false);

  const running = data.running;
  const current = running ? data.tasks.find((t) => t.id === running.task_id) ?? null : null;

  // Most recently paused, unfinished task (so you can resume after a break).
  const lastPaused = !current
    ? data.entries
        .filter((e) => e.ended_at && Date.parse(e.ended_at) > now - 12 * 3_600_000)
        .sort((a, b) => (a.ended_at! < b.ended_at! ? 1 : -1))
        .map((e) => data.tasks.find((t) => t.id === e.task_id && t.status === "todo"))
        .find(Boolean) ?? null
    : null;

  const focus = current ?? lastPaused;
  const focusEntries = focus ? byTask.get(focus.id) ?? [] : [];
  const focusTracked = trackedMinutes(focusEntries, now);
  const focusTarget = focus
    ? focus.planned_start
      ? (Date.parse(focus.planned_end!) - Date.parse(focus.planned_start)) / 60_000 + trackedBefore(focus)
      : minutesToPlan(focus, history, settings.use_learning, 0).minutes
    : 0;

  function trackedBefore(t: Task) {
    // Planned blocks for partly-done tasks hold only the remaining time; add earlier work back.
    if (!t.planned_start) return 0;
    const ps = Date.parse(t.planned_start);
    return trackedMinutes((byTask.get(t.id) ?? []).filter((e) => e.ended_at && Date.parse(e.ended_at) <= ps));
  }

  const upNext = data.tasks
    .filter((t) => t.status === "todo" && plannedDay(t) === today && t.id !== focus?.id)
    .sort((a, b) => (a.planned_start! < b.planned_start! ? -1 : 1));
  const others = data.tasks.filter((t) => t.status === "todo" && plannedDay(t) !== today && t.id !== focus?.id);

  const { start: d0, end: d1 } = dayRange(today);
  const todaysEntries = data.entries
    .filter((e) => Date.parse(e.started_at) >= d0 && Date.parse(e.started_at) < d1)
    .sort((a, b) => (a.started_at < b.started_at ? 1 : -1));
  const focusedToday = trackedMinutes(todaysEntries, now);

  const sessionMs = running ? now - Date.parse(running.started_at) : 0;
  const pct = focusTarget > 0 ? Math.min(100, (focusTracked / focusTarget) * 100) : 0;
  const over = focusTracked > focusTarget && focusTarget > 0;

  return (
    <div className="mx-auto grid max-w-4xl grid-cols-1 gap-6 md:grid-cols-[minmax(0,1fr)_320px]">
      <section className="space-y-4">
        {focus ? (
          <div className="card overflow-hidden">
            <div className={`h-1.5 ${focus.quadrant ? Q_BG[focus.quadrant] : "bg-ink"}`} />
            <div className="p-5">
              <p className="eyebrow">{current ? "Working on" : "Paused"}</p>
              <h2 className="mt-1 text-2xl font-semibold leading-tight tracking-tight">{focus.title}</h2>
              {focus.notes && <p className="mt-1 whitespace-pre-line text-sm text-muted">{focus.notes}</p>}

              <p className={`mt-6 font-mono text-6xl font-medium tracking-tight tabular-nums ${current ? "" : "text-muted"}`}>
                {fmtClock(current ? sessionMs : 0)}
              </p>
              <p className="mt-1 text-xs text-muted">{current ? `this session · started ${fmtTime(running!.started_at)}` : "timer paused"}</p>

              <div className="mt-5">
                <div className="mb-1 flex justify-between text-xs">
                  <span className="font-medium">{fmtMinutes(focusTracked)} total</span>
                  <span className={over ? "font-medium text-q1" : "text-muted"}>
                    {over ? `${fmtMinutes(focusTracked - focusTarget)} over plan` : `of ${fmtMinutes(focusTarget)} planned`}
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-ink/10">
                  <div className={`h-full rounded-full transition-all ${over ? "bg-q1" : "bg-accent"}`} style={{ width: `${pct}%` }} />
                </div>
              </div>

              <div className="mt-6 grid grid-cols-2 gap-2">
                {current ? (
                  <button className="btn-outline py-3 text-base" onClick={data.pauseTimer}><Icon name="pause" size={16} /> Pause</button>
                ) : (
                  <button className="btn-outline py-3 text-base" onClick={() => data.startTimer(focus.id)}><Icon name="play" size={16} /> Resume</button>
                )}
                <button className="btn-accent py-3 text-base" onClick={() => data.finishTask(focus.id)}><Icon name="check" size={18} /> Finish</button>
              </div>
            </div>
          </div>
        ) : (
          <Empty title="No timer running">Start a task below. Pause when you take a break and press Finish when it&apos;s done — the planner learns from the real time.</Empty>
        )}

        <div>
          <p className="eyebrow mb-2">Up next today</p>
          {upNext.length === 0 ? (
            <p className="card px-4 py-3 text-sm text-muted">
              Nothing else planned. <button className="underline" onClick={() => setTab("plan")}>Plan your day</button>
            </p>
          ) : (
            <ul className="card divide-y divide-line overflow-hidden">
              {upNext.map((t) => (
                <StartRow key={t.id} task={t} label={`${fmtTime(t.planned_start!)}–${fmtTime(t.planned_end!)}`} late={Date.parse(t.planned_start!) < now} tracked={trackedMinutes(byTask.get(t.id) ?? [], now)} onStart={() => data.startTimer(t.id)} />
              ))}
            </ul>
          )}
        </div>

        {others.length > 0 && (
          <div>
            <button className="eyebrow mb-2" onClick={() => setShowAll((v) => !v)}>{showAll ? "Hide" : "Show"} unplanned tasks ({others.length})</button>
            {showAll && (
              <ul className="card divide-y divide-line overflow-hidden">
                {others.map((t) => (
                  <StartRow key={t.id} task={t} label={fmtMinutes(t.estimate_minutes)} tracked={trackedMinutes(byTask.get(t.id) ?? [], now)} onStart={() => data.startTimer(t.id)} />
                ))}
              </ul>
            )}
          </div>
        )}
      </section>

      <aside className="space-y-3">
        <div className="card px-4 py-3">
          <p className="eyebrow">Focused today</p>
          <p className="mt-1 text-3xl font-semibold tracking-tight">{fmtMinutes(focusedToday)}</p>
        </div>
        <div className="card p-4">
          <p className="eyebrow mb-2">Today&apos;s sessions</p>
          {todaysEntries.length === 0 ? (
            <p className="text-sm text-muted">No sessions yet.</p>
          ) : (
            <ul className="space-y-1.5 text-sm">
              {todaysEntries.map((e) => {
                const t = data.tasks.find((x) => x.id === e.task_id);
                const mins = trackedMinutes([e], now);
                return (
                  <li key={e.id} className="flex items-center gap-2">
                    <QuadrantDot q={t?.quadrant ?? null} />
                    <span className="min-w-0 flex-1 truncate">{t?.title ?? "Deleted task"}</span>
                    <span className="shrink-0 font-mono text-[11px] text-muted">{fmtTime(e.started_at)}–{e.ended_at ? fmtTime(e.ended_at) : "now"}</span>
                    <span className="w-12 shrink-0 text-right text-xs">{Math.round(mins)}m</span>
                  </li>
                );
              })}
            </ul>
          )}
          <p className="mt-3 text-[11px] text-muted">Forgot to pause? Fix session times in Review.</p>
        </div>
      </aside>
    </div>
  );
}

function StartRow({ task, label, late, tracked, onStart }: { task: Task; label: string; late?: boolean; tracked: number; onStart: () => void }) {
  return (
    <li className="flex items-center gap-3 px-4 py-2.5">
      <QuadrantDot q={task.quadrant} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{task.title}</p>
        <p className="text-[11px] text-muted">
          <span className={`font-mono ${late ? "text-q3" : ""}`}>{label}</span>
          {tracked >= 1 && ` · ${fmtMinutes(tracked)} done`}
        </p>
      </div>
      <button className="btn-outline px-3 py-1.5" onClick={onStart}><Icon name="play" size={13} /> Start</button>
    </li>
  );
}
