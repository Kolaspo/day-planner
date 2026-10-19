import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";
import { decrypt } from "@/lib/crypto";
import { fetchIcs, parseIcs } from "@/lib/ics";
import { isValidTimeZone } from "@/lib/tz";
import type { CalendarEvent } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Short in-memory cache so switching tabs doesn't refetch every feed. Keyed per source.
const cache = new Map<string, { at: number; text: string }>();
const TTL = 5 * 60_000;

export async function GET(req: Request) {
  const supabase = getServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const params = new URL(req.url).searchParams;
  const from = Date.parse(params.get("from") ?? "");
  const to = Date.parse(params.get("to") ?? "");
  const tzParam = params.get("tz");
  const userTz = isValidTimeZone(tzParam) ? tzParam : "UTC";
  const fresh = params.get("fresh") === "1";
  if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from || to - from > 62 * 86_400_000) {
    return NextResponse.json({ error: "Bad date range" }, { status: 400 });
  }

  const { data: sources, error } = await supabase.from("calendar_sources").select("id, name, url_encrypted");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const errors: { sourceId: string; name: string; message: string }[] = [];
  const events: CalendarEvent[] = [];

  await Promise.all(
    (sources ?? []).map(async (s) => {
      try {
        const key = `${user.id}:${s.id}`;
        const hit = cache.get(key);
        let text: string;
        if (!fresh && hit && Date.now() - hit.at < TTL) {
          text = hit.text;
        } else {
          text = await fetchIcs(new URL(decrypt(s.url_encrypted)));
          cache.set(key, { at: Date.now(), text });
        }
        events.push(...parseIcs(text, { sourceId: s.id, from, to, userTz }));
      } catch (e) {
        errors.push({ sourceId: s.id, name: s.name, message: e instanceof Error ? e.message : "Failed" });
      }
    }),
  );

  events.sort((a, b) => (a.start < b.start ? -1 : 1));
  return NextResponse.json({ events, errors }, { headers: { "Cache-Control": "private, no-store" } });
}
