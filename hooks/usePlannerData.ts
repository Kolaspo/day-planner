"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getSupabase } from "@/lib/supabase/client";
import type { CalendarSource, Quadrant, Settings, Task, TimeEntry } from "@/lib/types";

const HISTORY_DAYS = 180;

export const DEFAULT_SETTINGS: Omit<Settings, "user_id"> = {
  day_start: "08:00:00",
  day_end: "22:00:00",
  buffer_minutes: 10,
  use_learning: true,
  include_q4: false,
};

export type NewTask = Pick<Task, "title" | "estimate_minutes"> &
  Partial<Pick<Task, "category" | "notes" | "quadrant" | "due_date">>;

export function usePlannerData(userId: string) {
  const supabase = useMemo(() => getSupabase(), []);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [sources, setSources] = useState<CalendarSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const since = useMemo(() => new Date(Date.now() - HISTORY_DAYS * 86_400_000).toISOString(), []);

  const loadTasks = useCallback(async () => {
    const { data, error } = await supabase
      .from("tasks")
      .select("*")
      .or(`status.eq.todo,completed_at.gte.${since}`)
      .order("created_at");
    if (error) throw error;
    setTasks(data as Task[]);
  }, [supabase, since]);

  const loadEntries = useCallback(async () => {
    const { data, error } = await supabase
      .from("time_entries")
      .select("*")
      .or(`started_at.gte.${since},ended_at.is.null`)
      .order("started_at");
    if (error) throw error;
    setEntries(data as TimeEntry[]);
  }, [supabase, since]);

  const loadSettings = useCallback(async () => {
    const { data, error } = await supabase.from("settings").select("*").maybeSingle();
    if (error) throw error;
    if (data) {
      setSettings(data as Settings);
    } else {
      const { data: created, error: e2 } = await supabase
        .from("settings")
        .upsert({ user_id: userId, ...DEFAULT_SETTINGS })
        .select("*")
        .single();
      if (e2) throw e2;
      setSettings(created as Settings);
    }
  }, [supabase, userId]);

  const loadSources = useCallback(async () => {
    const res = await fetch("/api/calendars", { cache: "no-store" });
    if (res.ok) setSources(((await res.json()) as { sources: CalendarSource[] }).sources);
  }, []);

  const reloadAll = useCallback(async () => {
    try {
      await Promise.all([loadTasks(), loadEntries(), loadSettings(), loadSources()]);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load your data");
    } finally {
      setLoading(false);
    }
  }, [loadTasks, loadEntries, loadSettings, loadSources]);

  // Initial load + live sync: any change on another device triggers a (debounced) refetch.
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    reloadAll();
    const schedule = (fn: () => Promise<void>) => () => {
      if (debounce.current) clearTimeout(debounce.current);
      debounce.current = setTimeout(() => fn().catch(() => {}), 250);
    };
    const channel = supabase
      .channel(`planner-${userId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "tasks", filter: `user_id=eq.${userId}` }, schedule(loadTasks))
      .on("postgres_changes", { event: "*", schema: "public", table: "time_entries", filter: `user_id=eq.${userId}` }, schedule(loadEntries))
      .on("postgres_changes", { event: "*", schema: "public", table: "settings", filter: `user_id=eq.${userId}` }, schedule(loadSettings))
      .subscribe();

    // Phones suspend sockets in the background: refresh whenever the app comes back.
    const onVisible = () => {
      if (document.visibilityState === "visible") reloadAll();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", reloadAll);
    return () => {
      supabase.removeChannel(channel);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", reloadAll);
    };
  }, [supabase, userId, reloadAll, loadTasks, loadEntries, loadSettings]);

  const fail = (e: { message: string } | null) => {
    if (e) {
      setError(e.message);
      reloadAll();
      return true;
    }
    return false;
  };

  // ── Tasks ────────────────────────────────────────────────────────────────
  const addTask = useCallback(
    async (t: NewTask) => {
      const { data, error } = await supabase.from("tasks").insert({ ...t, user_id: userId }).select("*").single();
      if (!fail(error) && data) setTasks((prev) => [...prev, data as Task]);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [supabase, userId],
  );

  const updateTask = useCallback(
    async (id: string, patch: Partial<Task>) => {
      setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
      const { error } = await supabase.from("tasks").update(patch).eq("id", id);
      fail(error);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [supabase],
  );

  const deleteTask = useCallback(
    async (id: string) => {
      setTasks((prev) => prev.filter((t) => t.id !== id));
      setEntries((prev) => prev.filter((e) => e.task_id !== id));
      const { error } = await supabase.from("tasks").delete().eq("id", id);
      fail(error);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [supabase],
  );

  const setQuadrant = useCallback((id: string, quadrant: Quadrant | null) => updateTask(id, { quadrant }), [updateTask]);

  const planTask = useCallback(
    (id: string, start: number, end: number) =>
      updateTask(id, { planned_start: new Date(start).toISOString(), planned_end: new Date(end).toISOString() }),
    [updateTask],
  );

  const planMany = useCallback(
    async (items: { taskId: string; start: number; end: number }[]) => {
      await Promise.all(items.map((p) => planTask(p.taskId, p.start, p.end)));
    },
    [planTask],
  );

  const unplanTask = useCallback((id: string) => updateTask(id, { planned_start: null, planned_end: null }), [updateTask]);

  // ── Timer ────────────────────────────────────────────────────────────────
  const running = entries.find((e) => !e.ended_at) ?? null;

  const stopRunning = useCallback(async () => {
    const r = entries.find((e) => !e.ended_at);
    if (!r) return;
    const ended_at = new Date().toISOString();
    setEntries((prev) => prev.map((e) => (e.id === r.id ? { ...e, ended_at } : e)));
    const { error } = await supabase.from("time_entries").update({ ended_at }).eq("id", r.id);
    fail(error);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries, supabase]);

  const startTimer = useCallback(
    async (taskId: string) => {
      if (running?.task_id === taskId) return;
      await stopRunning(); // starting a task pauses whatever was running
      const { data, error } = await supabase
        .from("time_entries")
        .insert({ task_id: taskId, user_id: userId, started_at: new Date().toISOString() })
        .select("*")
        .single();
      if (!fail(error) && data) setEntries((prev) => [...prev, data as TimeEntry]);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [running, stopRunning, supabase, userId],
  );

  const pauseTimer = stopRunning;

  const finishTask = useCallback(
    async (taskId: string) => {
      if (running?.task_id === taskId) await stopRunning();
      await updateTask(taskId, { status: "done", completed_at: new Date().toISOString() });
    },
    [running, stopRunning, updateTask],
  );

  const reopenTask = useCallback((taskId: string) => updateTask(taskId, { status: "todo", completed_at: null }), [updateTask]);

  const updateEntry = useCallback(
    async (id: string, patch: Partial<Pick<TimeEntry, "started_at" | "ended_at">>) => {
      setEntries((prev) => prev.map((e) => (e.id === id ? { ...e, ...patch } : e)));
      const { error } = await supabase.from("time_entries").update(patch).eq("id", id);
      fail(error);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [supabase],
  );

  const deleteEntry = useCallback(
    async (id: string) => {
      setEntries((prev) => prev.filter((e) => e.id !== id));
      const { error } = await supabase.from("time_entries").delete().eq("id", id);
      fail(error);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [supabase],
  );

  const addEntry = useCallback(
    async (taskId: string, startedAt: number, endedAt: number) => {
      const { data, error } = await supabase
        .from("time_entries")
        .insert({ task_id: taskId, user_id: userId, started_at: new Date(startedAt).toISOString(), ended_at: new Date(endedAt).toISOString() })
        .select("*")
        .single();
      if (!fail(error) && data) setEntries((prev) => [...prev, data as TimeEntry]);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [supabase, userId],
  );

  // ── Settings & calendars ─────────────────────────────────────────────────
  const updateSettings = useCallback(
    async (patch: Partial<Settings>) => {
      setSettings((prev) => (prev ? { ...prev, ...patch } : prev));
      const { error } = await supabase.from("settings").update(patch).eq("user_id", userId);
      fail(error);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [supabase, userId],
  );

  const addSource = useCallback(
    async (s: { name: string; provider: string; url: string; color: string }) => {
      const res = await fetch("/api/calendars", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(s),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Could not add calendar");
      await loadSources();
    },
    [loadSources],
  );

  const removeSource = useCallback(
    async (id: string) => {
      setSources((prev) => prev.filter((s) => s.id !== id));
      await fetch(`/api/calendars/${id}`, { method: "DELETE" });
      await loadSources();
    },
    [loadSources],
  );

  return {
    loading, error, clearError: () => setError(null),
    tasks, entries, settings, sources, running,
    addTask, updateTask, deleteTask, setQuadrant, planTask, planMany, unplanTask,
    startTimer, pauseTimer, finishTask, reopenTask, updateEntry, deleteEntry, addEntry,
    updateSettings, addSource, removeSource, reloadAll,
  };
}

export type PlannerData = ReturnType<typeof usePlannerData>;
