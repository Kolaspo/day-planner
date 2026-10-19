"use client";

import { useCallback, useEffect, useState } from "react";
import type { CalendarEvent } from "@/lib/types";
import { dayRange, localTimeZone } from "@/lib/time";

export function useEvents(day: string, sourcesKey: string) {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [errors, setErrors] = useState<{ sourceId: string; name: string; message: string }[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(
    async (fresh = false) => {
      if (!sourcesKey) {
        setEvents([]);
        setErrors([]);
        return;
      }
      setLoading(true);
      try {
        const { start, end } = dayRange(day);
        const qs = new URLSearchParams({
          from: new Date(start).toISOString(),
          to: new Date(end).toISOString(),
          tz: localTimeZone(),
          ...(fresh ? { fresh: "1" } : {}),
        });
        const res = await fetch(`/api/events?${qs}`, { cache: "no-store" });
        const json = await res.json();
        if (res.ok) {
          setEvents(json.events);
          setErrors(json.errors);
        } else {
          setErrors([{ sourceId: "", name: "Calendars", message: json.error ?? "Failed to load" }]);
        }
      } catch {
        setErrors([{ sourceId: "", name: "Calendars", message: "You seem to be offline" }]);
      } finally {
        setLoading(false);
      }
    },
    [day, sourcesKey],
  );

  useEffect(() => {
    load();
  }, [load]);

  return { events, errors, loading, refresh: () => load(true) };
}
