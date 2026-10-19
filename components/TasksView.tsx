"use client";

import { useMemo, useState } from "react";
import type { ViewProps } from "./PlannerApp";
import TaskForm from "./TaskForm";
import { Empty, QuadrantDot } from "./ui";
import { Icon } from "./Icon";
import { QUADRANTS, type Quadrant, type Task } from "@/lib/types";
import { dateKey, fmtDayLabel, fmtMinutes, fmtTime } from "@/lib/time";
import { trackedMinutes } from "@/lib/learning";
import { isCarriedOver } from "@/lib/derive";

export default function TasksView({ data, history, byTask, setTab }: ViewProps) {
  const [editing, setEditing] = useState<string | null>(null);
  const [showDone, setShowDone] = useState(false);
  const today = dateKey();

  const categories = useMemo(
    () => Array.from(new Set(data.tasks.map((t) => t.category).filter(Boolean) as string[])).sort(),
    [data.tasks],
  );
  const open = data.tasks.filter((t) => t.status === "todo");
  const done = data.tasks
    .filter((t) => t.status === "done")
    .sort((a, b) => ((a.completed_at ?? "") < (b.completed_at ?? "") ? 1 : -1))
    .slice(0, 30);
  const totalMin = open.reduce((s, t) => s + t.estimate_minutes, 0);
  const unsorted = open.filter((t) => t.quadrant == null).length;

  const groups: { key: string; title: string; items: Task[] }[] = [
    { key: "none", title: "Not sorted yet", items: open.filter((t) => t.quadrant == null) },
    ...([1, 2, 3, 4] as Quadrant[]).map((q) => ({ key: String(q), title: `Q${q} · ${QUADRANTS[q].label}`, items: open.filter((t) => t.quadrant === q) })),
  ].filter((g) => g.items.length);

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[380px_minmax(0,1fr)]">
      <section className="card h-fit p-4 lg:sticky lg:top-24">
        <p className="eyebrow mb-3">New task</p>
        <TaskForm categories={categories} history={history} onSubmit={data.addTask} />
      </section>

      <section className="space-y-5">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-2xl font-semibold tracking-tight">{open.length} open</p>
            <p className="text-sm text-muted">{fmtMinutes(totalMin)} of work estimated</p>
          </div>
          {unsorted > 0 ? (
            <button className="btn-accent" onClick={() => setTab("sort")}>Sort {unsorted} task{unsorted > 1 ? "s" : ""} <Icon name="chevron-right" size={16} /></button>
          ) : open.length > 0 ? (
            <button className="btn-accent" onClick={() => setTab("plan")}>Plan the day <Icon name="chevron-right" size={16} /></button>
          ) : null}
        </div>

        {open.length === 0 && <Empty title="Nothing on the list">Add what you need to do, with a rough time for each. In the morning, sort them and let the planner find the slots.</Empty>}

        {groups.map((g) => (
          <div key={g.key}>
            <p className="eyebrow mb-2">{g.title}</p>
            <ul className="card divide-y divide-line overflow-hidden">
              {g.items.map((t) =>
                editing === t.id ? (
                  <li key={t.id} className="p-4">
                    <TaskForm
                      initial={t}
                      categories={categories}
                      history={history}
                      submitLabel="Save"
                      onCancel={() => setEditing(null)}
                      onSubmit={async (patch) => {
                        await data.updateTask(t.id, patch);
                        setEditing(null);
                      }}
                    />
                  </li>
                ) : (
                  <TaskRow
                    key={t.id}
                    task={t}
                    tracked={trackedMinutes(byTask.get(t.id) ?? [])}
                    carried={isCarriedOver(t, today)}
                    onEdit={() => setEditing(t.id)}
                    onDone={() => data.finishTask(t.id)}
                    onDelete={() => {
                      if (confirm(`Delete “${t.title}”?`)) data.deleteTask(t.id);
                    }}
                  />
                ),
              )}
            </ul>
          </div>
        ))}

        {done.length > 0 && (
          <div>
            <button className="eyebrow mb-2 flex items-center gap-1" onClick={() => setShowDone((v) => !v)}>
              Recently done ({done.length}) <Icon name={showDone ? "chevron-left" : "chevron-right"} size={12} className={showDone ? "-rotate-90" : ""} />
            </button>
            {showDone && (
              <ul className="card divide-y divide-line overflow-hidden">
                {done.map((t) => (
                  <li key={t.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                    <Icon name="check" size={16} className="text-accent" />
                    <span className="flex-1 truncate text-muted line-through">{t.title}</span>
                    <span className="text-xs text-muted">{fmtMinutes(trackedMinutes(byTask.get(t.id) ?? []))}</span>
                    <button className="btn-ghost px-2 py-1 text-xs" onClick={() => data.reopenTask(t.id)} title="Reopen"><Icon name="undo" size={14} /></button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </section>
    </div>
  );
}

function TaskRow({ task, tracked, carried, onEdit, onDone, onDelete }: { task: Task; tracked: number; carried: boolean; onEdit: () => void; onDone: () => void; onDelete: () => void }) {
  const today = dateKey();
  const overdue = task.due_date && task.due_date < today;
  return (
    <li className="group flex items-center gap-3 px-4 py-3">
      <button onClick={onDone} aria-label="Mark done" className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 border-line text-transparent transition hover:border-accent hover:text-accent">
        <Icon name="check" size={12} />
      </button>
      <button onClick={onEdit} className="min-w-0 flex-1 text-left">
        <div className="flex items-center gap-2">
          <QuadrantDot q={task.quadrant} />
          <span className="truncate font-medium">{task.title}</span>
        </div>
        <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 pl-[18px] text-xs text-muted">
          <span>{fmtMinutes(task.estimate_minutes)}</span>
          {task.category && <span>{task.category}</span>}
          {task.due_date && <span className={overdue ? "font-medium text-q1" : ""}>due {fmtDayLabel(task.due_date)}</span>}
          {task.planned_start && !carried && <span className="text-accent">{fmtDayLabel(dateKey(new Date(task.planned_start)))} {fmtTime(task.planned_start)}</span>}
          {carried && <span className="text-q3">carried over</span>}
          {tracked >= 1 && <span>{fmtMinutes(tracked)} tracked</span>}
        </div>
      </button>
      <button onClick={onDelete} aria-label="Delete" className="btn-ghost px-2 py-1 text-muted opacity-100 md:opacity-0 md:group-hover:opacity-100"><Icon name="trash" size={16} /></button>
    </li>
  );
}
