"use client";

import { useMemo, useState } from "react";
import type { ViewProps } from "./PlannerApp";
import DayTimeline, { type Block } from "./DayTimeline";
import { Icon } from "./Icon";
import { QuadrantDot } from "./ui";
import { schedule, MIN } from "@/lib/scheduler";
import { minutesToPlan, isCarriedOver, plannedDay } from "@/lib/derive";
import { trackedMinutes } from "@/lib/learning";
import { at, dateKey, dayRange, fmtMinutes, fmtTime } from "@/lib/time";
import type { Interval, Task } from "@/lib/types";
import { useNow } from "@/hooks/useNow";

export default function PlanView({ data, day, cal, byTask, history, settings, setTab }: ViewProps) {
  const now = useNow(30_000);
  const today = dateKey(now);
  const isPast = day < today;
  const [skipped, setSkipped] = useState<Set<string>>(new Set());
  const [accepting, setAccepting] = useState(false);

  const sourceColor = useMemo(() => new Map(data.sources.map((s) => [s.id, s.color])), [data.sources]);
  const taskById = useMemo(() => new Map(data.tasks.map((t) => [t.id, t])), [data.tasks]);

  // ── Planning window ───────────────────────────────────────────────────────
  const dayStart = at(day, settings.day_start);
  const dayEnd = at(day, settings.day_end);
  const nowSnapped = Math.ceil(now / (5 * MIN)) * 5 * MIN;
  const windowStart = day === today ? Math.max(dayStart, nowSnapped) : dayStart;

  // ── What's already on the day ─────────────────────────────────────────────
  const timedEvents = cal.events.filter((e) => !e.allDay);
  const allDay = cal.events.filter((e) => e.allDay);
  const plannedHere = data.tasks.filter((t) => t.planned_start && plannedDay(t) === day);

  const busy: Interval[] = [
    ...timedEvents.filter((e) => e.busy).map((e) => ({ start: Date.parse(e.start), end: Date.parse(e.end) })),
    ...plannedHere.filter((t) => t.status === "todo").map((t) => ({ start: Date.parse(t.planned_start!), end: Date.parse(t.planned_end!) })),
  ];
  // A timer running on an unplanned task keeps you busy until its expected end.
  const runningTask = data.running ? taskById.get(data.running.task_id) : undefined;
  if (day === today && runningTask && plannedDay(runningTask) !== today) {
    const left = minutesToPlan(runningTask, history, settings.use_learning, trackedMinutes(byTask.get(runningTask.id) ?? [], now)).minutes;
    busy.push({ start: now, end: now + left * MIN });
  }

  // ── Suggestions ──────────────────────────────────────────────────────────
  const candidates = data.tasks.filter(
    (t) =>
      t.status === "todo" &&
      t.quadrant != null &&
      (!t.planned_start || isCarriedOver(t, today)) &&
      !skipped.has(t.id) &&
      !(day === today && data.running?.task_id === t.id), // already being worked on right now
  );
  const planInfo = useMemo(() => {
    const m = new Map<string, ReturnType<typeof minutesToPlan>>();
    for (const t of data.tasks) {
      if (t.status === "todo") m.set(t.id, minutesToPlan(t, history, settings.use_learning, trackedMinutes(byTask.get(t.id) ?? [])));
    }
    return m;
  }, [data.tasks, history, settings.use_learning, byTask]);

  const result = useMemo(() => {
    if (isPast || windowStart >= dayEnd) return { placements: [], unplaced: candidates.map((t) => ({ taskId: t.id, reason: isPast ? "Day is over" : "No time left today" })) };
    return schedule({
      window: { start: windowStart, end: dayEnd },
      busy,
      bufferMinutes: settings.buffer_minutes,
      includeQ4: settings.include_q4,
      tasks: candidates.map((t) => ({ id: t.id, quadrant: t.quadrant, minutes: planInfo.get(t.id)?.minutes ?? t.estimate_minutes, dueDate: t.due_date, createdAt: t.created_at })),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(busy), candidates.map((t) => t.id).join(), planInfo, windowStart, dayEnd, settings.buffer_minutes, settings.include_q4, isPast]);

  const unsortedCount = data.tasks.filter((t) => t.status === "todo" && t.quadrant == null && !t.planned_start).length;
  const q4Hidden = !settings.include_q4 ? candidates.filter((t) => t.quadrant === 4).length : 0;

  // ── Timeline data ────────────────────────────────────────────────────────
  const blocks: Block[] = [
    ...timedEvents.map((e) => ({
      id: e.id, title: e.title, start: Date.parse(e.start), end: Date.parse(e.end), kind: "event" as const,
      color: sourceColor.get(e.sourceId) ?? "#64748b", sub: e.busy ? e.location : "free",
    })),
    ...plannedHere.map((t) => ({
      id: t.id, title: t.title, start: Date.parse(t.planned_start!), end: Date.parse(t.planned_end!),
      kind: t.status === "done" ? ("done" as const) : ("task" as const), quadrant: t.quadrant,
    })),
    ...result.placements.map((p) => ({
      id: `s:${p.taskId}`, title: taskById.get(p.taskId)?.title ?? "", start: p.start, end: p.end, kind: "suggestion" as const,
      quadrant: taskById.get(p.taskId)?.quadrant,
    })),
  ];

  const { start: d0, end: d1 } = dayRange(day);
  const actual = data.entries
    .filter((e) => Date.parse(e.started_at) < d1 && (e.ended_at ? Date.parse(e.ended_at) : now) > d0)
    .map((e) => {
      const t = taskById.get(e.task_id);
      return { start: Date.parse(e.started_at), end: e.ended_at ? Date.parse(e.ended_at) : now, quadrant: t?.quadrant ?? null, title: t?.title ?? "" };
    });

  const times = [dayStart, dayEnd, ...blocks.flatMap((b) => [b.start, b.end]), ...actual.flatMap((a) => [a.start, a.end])].filter((t) => t >= d0 && t <= d1);
  const fromHour = Math.max(0, Math.floor((Math.min(...times) - d0) / 3_600_000));
  const toHour = Math.min(24, Math.ceil((Math.max(...times) - d0) / 3_600_000));

  async function acceptAll() {
    setAccepting(true);
    await data.planMany(result.placements);
    setAccepting(false);
  }

  const accept = (taskId: string) => {
    const p = result.placements.find((x) => x.taskId === taskId);
    if (p) data.planTask(p.taskId, p.start, p.end);
  };

  const conflicts = (t: Task) => {
    const s = Date.parse(t.planned_start!);
    const e = Date.parse(t.planned_end!);
    return timedEvents.some((ev) => ev.busy && Date.parse(ev.start) < e && Date.parse(ev.end) > s);
  };

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_400px]">
      <section className="card order-2 p-3 lg:order-1">
        <div className="mb-2 flex items-center justify-between px-1">
          <p className="eyebrow">
            Day view {cal.loading && <span className="normal-case tracking-normal">· loading calendars…</span>}
          </p>
          <div className="flex items-center gap-3 text-[11px] text-muted">
            <span className="hidden items-center gap-1 sm:flex"><span className="h-3 w-3 rounded border-2 border-dashed border-muted" /> suggested</span>
            <span className="flex items-center gap-1"><span className="h-3 w-1.5 rounded-sm bg-ink" /> actual</span>
            <button className="btn-ghost px-1.5 py-1" onClick={cal.refresh} aria-label="Refresh calendars" title="Refresh calendars"><Icon name="refresh" size={14} /></button>
          </div>
        </div>
        {allDay.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-1.5 pl-12">
            {allDay.map((e) => (
              <span key={e.id} className="rounded-md border border-line bg-paper px-2 py-0.5 text-xs" style={{ borderLeft: `3px solid ${sourceColor.get(e.sourceId)}` }}>{e.title}</span>
            ))}
          </div>
        )}
        <DayTimeline
          day={day}
          fromHour={fromHour}
          toHour={Math.max(fromHour + 1, toHour)}
          blocks={blocks}
          actual={actual}
          now={now}
          windowStart={dayStart}
          windowEnd={dayEnd}
          onBlockClick={(b) => {
            if (b.kind === "suggestion") accept(b.id.slice(2));
            else if (b.kind === "task") setTab("now");
          }}
        />
      </section>

      <aside className="order-1 space-y-4 lg:order-2">
        {cal.errors.length > 0 && (
          <div className="rounded-xl bg-q3/10 px-3 py-2 text-sm">
            {cal.errors.map((e) => <p key={e.sourceId + e.message}><b>{e.name}:</b> {e.message}</p>)}
          </div>
        )}
        {data.sources.length === 0 && (
          <div className="rounded-xl border border-dashed border-line px-3 py-2.5 text-sm text-muted">
            No calendars connected — suggestions won&apos;t avoid your lectures yet.{" "}
            <button className="font-medium text-ink underline" onClick={() => setTab("settings")}>Connect Google / Outlook</button>
          </div>
        )}

        {!isPast && (
          <div className="card p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="eyebrow">Suggested slots</p>
                <p className="mt-1 text-sm text-muted">Most important first, {settings.buffer_minutes} min buffer around everything.</p>
              </div>
              {result.placements.length > 0 && (
                <button className="btn-accent shrink-0" onClick={acceptAll} disabled={accepting}>
                  <Icon name="check" size={16} /> Accept {result.placements.length > 1 ? "all" : ""}
                </button>
              )}
            </div>

            <ul className="mt-3 space-y-1.5">
              {[...result.placements].sort((a, b) => a.start - b.start).map((p) => {
                const t = taskById.get(p.taskId)!;
                const info = planInfo.get(p.taskId);
                const tracked = trackedMinutes(byTask.get(p.taskId) ?? []);
                return (
                  <li key={p.taskId} className="flex items-center gap-2 rounded-xl bg-paper px-2.5 py-2">
                    <span className="w-[86px] shrink-0 font-mono text-xs text-muted">{fmtTime(p.start)}–{fmtTime(p.end)}</span>
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-1.5 truncate text-sm font-medium"><QuadrantDot q={t.quadrant} />{t.title}</p>
                      {(info?.suggestion && info.suggestion.minutes !== t.estimate_minutes) || tracked >= 1 ? (
                        <p className="flex items-center gap-1 text-[11px] text-accent">
                          <Icon name="sparkle" size={11} />
                          {tracked >= 1 ? `${fmtMinutes(tracked)} done, ${fmtMinutes(info?.minutes ?? 0)} left` : `You said ${fmtMinutes(t.estimate_minutes)}; similar tasks took ${info!.suggestion!.ratio}×`}
                        </p>
                      ) : null}
                      {isCarriedOver(t, today) && <p className="text-[11px] text-q3">Carried over from an earlier day</p>}
                    </div>
                    <button className="btn-ghost px-2 py-1 text-muted" title="Not today" onClick={() => setSkipped(new Set(skipped).add(p.taskId))}><Icon name="x" size={15} /></button>
                    <button className="btn-outline px-2 py-1" title="Accept" onClick={() => accept(p.taskId)}><Icon name="check" size={15} /></button>
                  </li>
                );
              })}
            </ul>

            {result.placements.length === 0 && (
              <p className="mt-3 text-sm text-muted">
                {candidates.length === 0 ? "Nothing waiting to be planned." : "No free slots for the remaining tasks."}
              </p>
            )}

            {result.unplaced.filter((u) => taskById.get(u.taskId)?.quadrant !== 4 || settings.include_q4).length > 0 && (
              <div className="mt-4">
                <p className="eyebrow mb-1.5">Doesn&apos;t fit</p>
                <ul className="space-y-1.5">
                  {result.unplaced.filter((u) => taskById.get(u.taskId)?.quadrant !== 4 || settings.include_q4).map((u) => {
                    const t = taskById.get(u.taskId)!;
                    return (
                      <li key={u.taskId} className="flex items-center gap-2 rounded-xl border border-line px-2.5 py-2 text-sm">
                        <div className="min-w-0 flex-1">
                          <p className="flex items-center gap-1.5 truncate font-medium"><QuadrantDot q={t.quadrant} />{t.title}</p>
                          <p className="text-[11px] text-muted">{u.reason}</p>
                        </div>
                        <label className="text-[11px] text-muted">
                          at
                          <input
                            type="time"
                            className="input ml-1 inline-block w-[112px] px-2 py-1 text-xs"
                            onChange={(e) => {
                              if (!e.target.value) return;
                              const s = at(day, e.target.value);
                              data.planTask(t.id, s, s + (planInfo.get(t.id)?.minutes ?? t.estimate_minutes) * MIN);
                            }}
                          />
                        </label>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

            {(unsortedCount > 0 || q4Hidden > 0) && (
              <p className="mt-3 text-xs text-muted">
                {unsortedCount > 0 && <>{unsortedCount} task{unsortedCount > 1 ? "s aren't" : " isn't"} sorted yet — <button className="underline" onClick={() => setTab("sort")}>sort them</button> to include. </>}
                {q4Hidden > 0 && <>{q4Hidden} Q4 task{q4Hidden > 1 ? "s" : ""} left out.</>}
              </p>
            )}
          </div>
        )}

        <div className="card p-4">
          <p className="eyebrow">Planned {day === today ? "today" : "for this day"}</p>
          {plannedHere.length === 0 ? (
            <p className="mt-2 text-sm text-muted">Nothing planned yet.</p>
          ) : (
            <ul className="mt-2 space-y-1.5">
              {plannedHere
                .sort((a, b) => (a.planned_start! < b.planned_start! ? -1 : 1))
                .map((t) => {
                  const dur = (Date.parse(t.planned_end!) - Date.parse(t.planned_start!)) / MIN;
                  return (
                    <li key={t.id} className={`flex items-center gap-2 rounded-xl px-2 py-1.5 ${t.status === "done" ? "opacity-60" : ""}`}>
                      <input
                        type="time"
                        disabled={t.status === "done"}
                        className="input w-[112px] shrink-0 px-2 py-1 font-mono text-xs"
                        value={fmtTime(t.planned_start!)}
                        onChange={(e) => {
                          if (!e.target.value) return;
                          const s = at(day, e.target.value);
                          data.planTask(t.id, s, s + dur * MIN);
                        }}
                        aria-label="Start time"
                      />
                      <div className="min-w-0 flex-1">
                        <p className={`flex items-center gap-1.5 truncate text-sm font-medium ${t.status === "done" ? "line-through" : ""}`}><QuadrantDot q={t.quadrant} />{t.title}</p>
                        <p className="text-[11px] text-muted">
                          {fmtMinutes(dur)}
                          {t.status === "todo" && conflicts(t) && <span className="ml-1 font-medium text-q1">· overlaps an event</span>}
                        </p>
                      </div>
                      {t.status === "todo" && (
                        <>
                          {!isPast && <button className="btn-ghost px-2 py-1 text-accent" title="Start now" onClick={() => { data.startTimer(t.id); setTab("now"); }}><Icon name="play" size={14} /></button>}
                          <button className="btn-ghost px-2 py-1 text-muted" title="Remove from plan" onClick={() => data.unplanTask(t.id)}><Icon name="x" size={15} /></button>
                        </>
                      )}
                    </li>
                  );
                })}
            </ul>
          )}
        </div>
      </aside>
    </div>
  );
}
