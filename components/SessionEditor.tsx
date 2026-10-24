"use client";

import { useState } from "react";
import type { ViewProps } from "./PlannerApp";
import { Icon } from "./Icon";
import { trackedMinutes } from "@/lib/learning";
import { dateKey, fmtMinutes, SUSPICIOUS_SESSION_MIN, toLocalInput } from "@/lib/time";
import type { Task, TimeEntry } from "@/lib/types";

const MIN = 60_000;

/**
 * Edit every recorded session of one task (any day): fix start/end, stop a runaway timer,
 * set the real total in one go, add a forgotten session, or delete one.
 */
export default function SessionEditor({
  task, entries, data, now = Date.now(),
}: {
  task: Task;
  entries: TimeEntry[];
  data: ViewProps["data"];
  now?: number;
}) {
  const sorted = [...entries].sort((a, b) => (a.started_at < b.started_at ? -1 : 1));
  const total = trackedMinutes(sorted, now);
  const [err, setErr] = useState<string | null>(null);
  const [realMin, setRealMin] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const saveStart = (e: TimeEntry, v: string) => {
    if (!v) return;
    const s = new Date(v).getTime();
    const end = e.ended_at ? Date.parse(e.ended_at) : now;
    if (s >= end) return setErr("Start must be before the end.");
    setErr(null);
    data.updateEntry(e.id, { started_at: new Date(s).toISOString() });
  };
  const saveEnd = (e: TimeEntry, v: string) => {
    if (!v) return;
    const en = new Date(v).getTime();
    if (en <= Date.parse(e.started_at)) return setErr("End must be after the start.");
    if (en > now + MIN) return setErr("End can't be in the future.");
    setErr(null);
    data.updateEntry(e.id, { ended_at: new Date(en).toISOString() });
  };

  /** Make the task's total equal X minutes by shortening/extending its longest session. */
  const setReal = () => {
    const target = Math.round(Number(realMin.replace(",", ".")));
    if (!Number.isFinite(target) || target < 1) return setErr("Enter the real time in minutes.");
    if (sorted.length === 0) return setErr("No sessions yet — add one below.");
    const dur = (e: TimeEntry) => (e.ended_at ? Date.parse(e.ended_at) : now) - Date.parse(e.started_at);
    const longest = sorted.reduce((a, b) => (dur(b) > dur(a) ? b : a));
    const newDur = dur(longest) + (target - total) * MIN;
    if (newDur < MIN) return setErr("Other sessions already add up to more than that — delete one first.");
    setErr(null);
    setRealMin("");
    data.updateEntry(longest.id, { ended_at: new Date(Date.parse(longest.started_at) + newDur).toISOString() });
  };

  return (
    <div className="space-y-2.5 bg-paper px-4 py-3">
      <div className="flex items-baseline justify-between">
        <p className="eyebrow">Sessions · {fmtMinutes(total)} total</p>
        <p className="text-[11px] text-muted">estimate {fmtMinutes(task.estimate_minutes)}</p>
      </div>

      {sorted.length === 0 && <p className="text-sm text-muted">No sessions recorded.</p>}
      {sorted.map((e) => {
        const mins = trackedMinutes([e], now);
        const bad = mins > SUSPICIOUS_SESSION_MIN;
        return (
          <div key={`${e.id}:${e.started_at}:${e.ended_at}`} className={`flex flex-wrap items-center gap-1.5 rounded-xl p-1.5 text-sm ${bad ? "bg-q1/10" : ""}`}>
            <input type="datetime-local" className="input w-[188px] px-2 py-1 font-mono text-xs" defaultValue={toLocalInput(e.started_at)}
              onBlur={(ev) => saveStart(e, ev.target.value)} aria-label="Session start" />
            <span className="text-muted">→</span>
            {e.ended_at ? (
              <input type="datetime-local" className="input w-[188px] px-2 py-1 font-mono text-xs" defaultValue={toLocalInput(e.ended_at)}
                onBlur={(ev) => saveEnd(e, ev.target.value)} aria-label="Session end" />
            ) : (
              <span className="w-[188px] text-xs font-medium text-accent">still running</span>
            )}
            <span className={`min-w-[64px] flex-1 text-xs ${bad ? "font-semibold text-q1" : "text-muted"}`}>{fmtMinutes(mins)}{bad && " ⚠"}</span>
            {bad && (
              <button className="btn-outline px-2 py-1 text-xs" title="End this session after your estimate"
                onClick={() => data.updateEntry(e.id, { ended_at: new Date(Date.parse(e.started_at) + task.estimate_minutes * MIN).toISOString() })}>
                Cut to {fmtMinutes(task.estimate_minutes)}
              </button>
            )}
            <button className="btn-ghost px-2 py-1 text-muted" onClick={() => confirm("Delete this session?") && data.deleteEntry(e.id)} aria-label="Delete session">
              <Icon name="trash" size={14} />
            </button>
          </div>
        );
      })}

      {sorted.length > 0 && (
        <form className="flex flex-wrap items-center gap-2" onSubmit={(ev) => { ev.preventDefault(); setReal(); }}>
          <span className="text-xs text-muted">It really took</span>
          <input inputMode="numeric" className="input w-20 px-2 py-1 text-xs" placeholder={String(Math.round(total))} value={realMin} onChange={(e) => setRealMin(e.target.value)} aria-label="Real minutes" />
          <span className="text-xs text-muted">min</span>
          <button className="btn-outline px-2.5 py-1 text-xs">Set</button>
        </form>
      )}

      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={(ev) => {
          ev.preventDefault();
          const s = new Date(from).getTime();
          const en = new Date(to).getTime();
          if (!(en > s)) return setErr("The added session must end after it starts.");
          setErr(null);
          data.addEntry(task.id, s, en);
          setFrom("");
          setTo("");
        }}
      >
        <span className="text-xs text-muted">Add a session:</span>
        <input type="datetime-local" required className="input w-[188px] px-2 py-1 font-mono text-xs" value={from}
          onFocus={() => !from && setFrom(`${dateKey(now)}T09:00`)} onChange={(e) => setFrom(e.target.value)} aria-label="New session start" />
        <span className="text-muted">→</span>
        <input type="datetime-local" required className="input w-[188px] px-2 py-1 font-mono text-xs" value={to}
          onFocus={() => !to && from && setTo(from)} onChange={(e) => setTo(e.target.value)} aria-label="New session end" />
        <button className="btn-outline px-2.5 py-1 text-xs"><Icon name="plus" size={13} /> Add</button>
      </form>

      {err && <p className="text-xs font-medium text-q1">{err}</p>}

      <div className="flex gap-2">
        {task.status === "done"
          ? <button className="btn-ghost px-2 py-1 text-xs" onClick={() => data.reopenTask(task.id)}><Icon name="undo" size={13} /> Reopen task</button>
          : <button className="btn-ghost px-2 py-1 text-xs" onClick={() => data.finishTask(task.id)}><Icon name="check" size={13} /> Mark finished</button>}
      </div>
    </div>
  );
}
