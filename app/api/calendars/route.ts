import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";
import { encrypt } from "@/lib/crypto";
import { fetchIcs, normalizeFeedUrl, parseIcs } from "@/lib/ics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PUBLIC_COLUMNS = "id, name, provider, color, created_at";

export async function GET() {
  const supabase = getServerSupabase();
  const { data, error } = await supabase.from("calendar_sources").select(PUBLIC_COLUMNS).order("created_at");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ sources: data });
}

export async function POST(req: Request) {
  const supabase = getServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as
    | { name?: string; provider?: string; url?: string; color?: string }
    | null;
  const name = body?.name?.trim().slice(0, 60);
  const provider = ["google", "outlook", "other"].includes(body?.provider ?? "") ? body!.provider : "other";
  const color = /^#[0-9a-fA-F]{6}$/.test(body?.color ?? "") ? body!.color : "#64748b";
  if (!name || !body?.url) return NextResponse.json({ error: "Name and link are required" }, { status: 400 });

  let url: URL;
  try {
    url = normalizeFeedUrl(body.url);
    // Test the link before saving so mistakes show up right away.
    const text = await fetchIcs(url);
    parseIcs(text, { sourceId: "test", from: Date.now(), to: Date.now() + 86_400_000, userTz: "UTC" });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Could not read that calendar" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("calendar_sources")
    .insert({ name, provider, color, url_encrypted: encrypt(url.href), user_id: user.id })
    .select(PUBLIC_COLUMNS)
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ source: data });
}
