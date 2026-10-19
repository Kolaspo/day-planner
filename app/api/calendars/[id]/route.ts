import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const supabase = getServerSupabase();
  // RLS limits this to the signed-in user's own rows.
  const { error } = await supabase.from("calendar_sources").delete().eq("id", params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const supabase = getServerSupabase();
  const body = (await req.json().catch(() => null)) as { name?: string; color?: string } | null;
  const patch: Record<string, string> = {};
  if (body?.name?.trim()) patch.name = body.name.trim().slice(0, 60);
  if (body?.color && /^#[0-9a-fA-F]{6}$/.test(body.color)) patch.color = body.color;
  const { error } = await supabase.from("calendar_sources").update(patch).eq("id", params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
