"use client";

import { useState } from "react";
import type { ViewProps } from "./PlannerApp";
import { QUADRANTS, type Quadrant, type Task } from "@/lib/types";
import { fmtDayLabel, fmtMinutes } from "@/lib/time";
import { Empty, Q_BG, Q_BORDER, Q_SOFT, Q_TEXT } from "./ui";
import { Icon } from "./Icon";

export default function MatrixView({ data, setTab }: ViewProps) {
  const [selected, setSelected] = useState<string | null>(null);
  const [over, setOver] = useState<Quadrant | "tray" | null>(null);
  const open = data.tasks.filter((t) => t.status === "todo");
  const tray = open.filter((t) => t.quadrant == null);

  const drop = (q: Quadrant | null) => (e: React.DragEvent) => {
    e.preventDefault();
    const id = e.dataTransfer.getData("text/plain");
    if (id) data.setQuadrant(id, q);
    setOver(null);
  };

  const card = (t: Task) => (
    <TaskCard
      key={t.id}
      task={t}
      selected={selected === t.id}
      onSelect={() => setSelected(selected === t.id ? null : t.id)}
      onPick={(q) => {
        data.setQuadrant(t.id, q);
        setSelected(null);
      }}
    />
  );

  if (open.length === 0) {
    return <Empty title="No open tasks">Add tasks first, then sort them here.</Empty>;
  }

  return (
    <div className="space-y-4">
      <div
        onDragOver={(e) => { e.preventDefault(); setOver("tray"); }}
        onDragLeave={() => setOver(null)}
        onDrop={drop(null)}
        className={`card p-3 transition ${over === "tray" ? "ring-2 ring-ink/20" : ""}`}
      >
        <div className="mb-2 flex items-center justify-between">
          <p className="eyebrow">To sort · {tray.length}</p>
          <p className="hidden text-xs text-muted md:block">Drag into a box, or tap a task and pick</p>
          <p className="text-xs text-muted md:hidden">Tap a task, then pick a box</p>
        </div>
        {tray.length ? <div className="flex flex-wrap gap-2">{tray.map(card)}</div> : <p className="py-2 text-sm text-muted">All sorted. 👌</p>}
      </div>

      <div className="grid grid-cols-[auto_1fr_1fr] gap-2 md:gap-3">
        <div />
        <p className="eyebrow pb-1 text-center">Urgent</p>
        <p className="eyebrow pb-1 text-center">Not urgent</p>
        {([[1, 2], [3, 4]] as Quadrant[][]).map((row, i) => (
          <Row key={i} label={i === 0 ? "Important" : "Not important"}>
            {row.map((q) => {
              const items = open.filter((t) => t.quadrant === q);
              const mins = items.reduce((s, t) => s + t.estimate_minutes, 0);
              return (
                <div
                  key={q}
                  onDragOver={(e) => { e.preventDefault(); setOver(q); }}
                  onDragLeave={() => setOver(null)}
                  onDrop={drop(q)}
                  onClick={() => selected && (data.setQuadrant(selected, q), setSelected(null))}
                  className={`min-h-[150px] rounded-2xl border-2 p-2.5 transition md:min-h-[220px] md:p-3 ${Q_SOFT[q]} ${over === q || selected ? Q_BORDER[q] : "border-transparent"} ${selected ? "cursor-pointer" : ""}`}
                >
                  <div className="mb-2 flex items-baseline justify-between gap-2">
                    <p className={`text-sm font-semibold ${Q_TEXT[q]}`}>Q{q} · {QUADRANTS[q].short}</p>
                    {mins > 0 && <p className="text-[11px] text-muted">{fmtMinutes(mins)}</p>}
                  </div>
                  <div className="flex flex-col gap-1.5">{items.length ? items.map(card) : <p className="text-xs text-muted">{QUADRANTS[q].hint}</p>}</div>
                </div>
              );
            })}
          </Row>
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
        <p className="text-sm text-muted">
          The planner fills your free time with Q1 first, then Q2, then Q3.{" "}
          {data.settings?.include_q4 ? "Q4 goes last." : "Q4 is left out (change in settings)."}
        </p>
        <button className="btn-accent" onClick={() => setTab("plan")}>Suggest a plan <Icon name="chevron-right" size={16} /></button>
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      <div className="flex items-center">
        <p className="eyebrow [writing-mode:vertical-rl] rotate-180">{label}</p>
      </div>
      {children}
    </>
  );
}

function TaskCard({ task, selected, onSelect, onPick }: { task: Task; selected: boolean; onSelect: () => void; onPick: (q: Quadrant | null) => void }) {
  return (
    <div
      draggable
      onDragStart={(e) => e.dataTransfer.setData("text/plain", task.id)}
      onClick={(e) => { e.stopPropagation(); onSelect(); }}
      className={`cursor-grab rounded-xl border bg-card px-2.5 py-2 text-sm shadow-sm transition active:cursor-grabbing ${selected ? "border-ink ring-2 ring-ink/15" : "border-line"}`}
    >
      <div className="flex items-start gap-2">
        {task.quadrant && <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${Q_BG[task.quadrant]}`} />}
        <span className="flex-1 font-medium leading-snug">{task.title}</span>
      </div>
      <p className="mt-0.5 text-[11px] text-muted">
        {fmtMinutes(task.estimate_minutes)}
        {task.due_date && ` · due ${fmtDayLabel(task.due_date)}`}
      </p>
      {selected && (
        <div className="mt-2 grid grid-cols-5 gap-1" onClick={(e) => e.stopPropagation()}>
          {([1, 2, 3, 4] as Quadrant[]).map((q) => (
            <button key={q} onClick={() => onPick(q)} className={`rounded-lg py-1.5 text-xs font-semibold text-white ${Q_BG[q]}`}>Q{q}</button>
          ))}
          <button onClick={() => onPick(null)} className="rounded-lg border border-line py-1.5 text-xs" title="Unsort"><Icon name="undo" size={12} className="mx-auto" /></button>
        </div>
      )}
    </div>
  );
}
