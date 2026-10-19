"use client";

import { useEffect, useMemo, useState } from "react";
import { usePlannerData } from "@/hooks/usePlannerData";
import { useEvents } from "@/hooks/useEvents";
import { addDays, dateKey, fmtDayLabel } from "@/lib/time";
import { buildHistory, entriesByTask } from "@/lib/derive";
import TasksView from "./TasksView";
import MatrixView from "./MatrixView";
import PlanView from "./PlanView";
import NowView from "./NowView";
import ReviewView from "./ReviewView";
import SettingsView from "./SettingsView";
import { Icon } from "./Icon";

export type Tab = "tasks" | "sort" | "plan" | "now" | "review" | "settings";

const TABS: { id: Exclude<Tab, "settings">; label: string; icon: Parameters<typeof Icon>[0]["name"] }[] = [
  { id: "tasks", label: "Tasks", icon: "list" },
  { id: "sort", label: "Sort", icon: "grid" },
  { id: "plan", label: "Plan", icon: "calendar" },
  { id: "now", label: "Now", icon: "timer" },
  { id: "review", label: "Review", icon: "chart" },
];

export default function PlannerApp({ userId, email }: { userId: string; email: string }) {
  const data = usePlannerData(userId);
  const [tab, setTab] = useState<Tab>("tasks");
  const [day, setDay] = useState(() => dateKey());

  // Remember the last tab on this device.
  useEffect(() => {
    try {
      const saved = localStorage.getItem("planner.tab") as Tab | null;
      if (saved) setTab(saved);
    } catch {}
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem("planner.tab", tab);
    } catch {}
  }, [tab]);

  // Roll over to the new day if the app stays open past midnight.
  useEffect(() => {
    const id = setInterval(() => {
      const today = dateKey();
      setDay((d) => (d === addDays(today, -1) ? today : d));
    }, 60_000);
    return () => clearInterval(id);
  }, []);

  const sourcesKey = data.sources.map((s) => s.id).join(",");
  const cal = useEvents(day, sourcesKey);

  const byTask = useMemo(() => entriesByTask(data.entries), [data.entries]);
  const history = useMemo(() => buildHistory(data.tasks, byTask), [data.tasks, byTask]);

  const runningTask = data.running ? data.tasks.find((t) => t.id === data.running!.task_id) : null;
  const showsDay = tab === "plan" || tab === "review";
  const today = dateKey();

  if (data.loading || !data.settings) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center text-sm text-muted">Loading your day…</div>
    );
  }

  const ctx = { data, day, setDay, cal, byTask, history, setTab, settings: data.settings };

  return (
    <div className="mx-auto flex min-h-[100dvh] max-w-6xl flex-col">
      <header className="sticky top-0 z-30 border-b border-line bg-paper/90 px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] backdrop-blur md:px-6">
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="eyebrow">Day Planner</p>
            {showsDay ? (
              <div className="mt-0.5 flex items-center gap-1">
                <button aria-label="Previous day" className="btn-ghost -ml-2 px-2 py-1" onClick={() => setDay(addDays(day, -1))}>
                  <Icon name="chevron-left" />
                </button>
                <button className="text-lg font-semibold tracking-tight" onClick={() => setDay(today)} title="Jump to today">
                  {fmtDayLabel(day, today)}
                  {day !== today && <span className="ml-2 text-xs font-normal text-muted">(tap for today)</span>}
                </button>
                <button aria-label="Next day" className="btn-ghost px-2 py-1" onClick={() => setDay(addDays(day, 1))}>
                  <Icon name="chevron-right" />
                </button>
              </div>
            ) : (
              <h1 className="mt-0.5 text-lg font-semibold tracking-tight">{TABS.find((t) => t.id === tab)?.label ?? "Settings"}</h1>
            )}
          </div>

          {runningTask && tab !== "now" && (
            <button onClick={() => setTab("now")} className="flex max-w-[45%] items-center gap-2 rounded-full bg-accent/10 py-1.5 pl-2.5 pr-3 text-xs font-medium text-accent">
              <span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-60" /><span className="relative inline-flex h-2 w-2 rounded-full bg-accent" /></span>
              <span className="truncate">{runningTask.title}</span>
            </button>
          )}

          <nav className="hidden items-center gap-1 md:flex">
            {TABS.map((t) => (
              <button key={t.id} onClick={() => setTab(t.id)} className={`btn px-3 ${tab === t.id ? "bg-ink text-paper" : "text-muted hover:bg-ink/5 hover:text-ink"}`}>
                <Icon name={t.icon} size={16} />
                {t.label}
              </button>
            ))}
          </nav>
          <button aria-label="Settings" onClick={() => setTab("settings")} className={`btn-ghost px-2 ${tab === "settings" ? "bg-ink/10" : ""}`}>
            <Icon name="settings" />
          </button>
        </div>
      </header>

      {data.error && (
        <div className="mx-4 mt-3 flex items-start gap-2 rounded-xl bg-q1/10 px-3 py-2 text-sm text-q1 md:mx-6">
          <span className="flex-1">{data.error}</span>
          <button className="font-medium underline" onClick={data.clearError}>Dismiss</button>
        </div>
      )}

      <main className="flex-1 px-4 pb-28 pt-4 md:px-6 md:pb-10">
        {tab === "tasks" && <TasksView {...ctx} />}
        {tab === "sort" && <MatrixView {...ctx} />}
        {tab === "plan" && <PlanView {...ctx} />}
        {tab === "now" && <NowView {...ctx} />}
        {tab === "review" && <ReviewView {...ctx} />}
        {tab === "settings" && <SettingsView {...ctx} email={email} />}
      </main>

      <nav className="pb-safe fixed inset-x-0 bottom-0 z-30 border-t border-line bg-card/95 backdrop-blur md:hidden">
        <div className="grid grid-cols-5">
          {TABS.map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)} className={`flex flex-col items-center gap-0.5 py-2.5 text-[11px] font-medium ${tab === t.id ? "text-ink" : "text-muted"}`}>
              <Icon name={t.icon} size={22} />
              {t.label}
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}

export type ViewProps = {
  data: ReturnType<typeof usePlannerData>;
  day: string;
  setDay: (d: string) => void;
  cal: ReturnType<typeof useEvents>;
  byTask: ReturnType<typeof entriesByTask>;
  history: ReturnType<typeof buildHistory>;
  setTab: (t: Tab) => void;
  settings: NonNullable<ReturnType<typeof usePlannerData>["settings"]>;
};
