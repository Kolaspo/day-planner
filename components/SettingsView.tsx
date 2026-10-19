"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ViewProps } from "./PlannerApp";
import { Icon } from "./Icon";
import { getSupabase } from "@/lib/supabase/client";

const COLORS = ["#2c5fa8", "#be4232", "#22544a", "#c48a22", "#7a4fa3", "#64748b"];

const HELP: Record<string, { title: string; steps: string[] }> = {
  google: {
    title: "Google Calendar",
    steps: [
      "Open calendar.google.com on a computer → ⚙ Settings.",
      "Under “Settings for my calendars”, click the calendar.",
      "Scroll to “Integrate calendar” → copy “Secret address in iCal format”.",
    ],
  },
  outlook: {
    title: "Outlook / Microsoft 365",
    steps: [
      "Open outlook.office.com (or outlook.com) → ⚙ Settings → Calendar → Shared calendars.",
      "Under “Publish a calendar”, choose the calendar and “Can view all details” → Publish.",
      "Copy the ICS link. (If your university blocks publishing, export your timetable’s ICS link from the uni system instead.)",
    ],
  },
};

export default function SettingsView({ data, settings, email }: ViewProps & { email: string }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [provider, setProvider] = useState<"google" | "outlook" | "other">("outlook");
  const [url, setUrl] = useState("");
  const [color, setColor] = useState(COLORS[0]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      await data.addSource({ name: name.trim() || HELP[provider]?.title || "Calendar", provider, url: url.trim(), color });
      setName("");
      setUrl("");
      setMsg({ ok: true, text: "Calendar connected." });
    } catch (err) {
      setMsg({ ok: false, text: err instanceof Error ? err.message : "Failed" });
    } finally {
      setBusy(false);
    }
  }

  const hhmm = (t: string) => t.slice(0, 5);

  return (
    <div className="mx-auto grid max-w-4xl grid-cols-1 gap-6 md:grid-cols-2">
      <section className="card p-4">
        <p className="eyebrow mb-3">Planning rules</p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label" htmlFor="ds">Day starts</label>
            <input id="ds" type="time" className="input" value={hhmm(settings.day_start)} onChange={(e) => e.target.value && e.target.value < hhmm(settings.day_end) && data.updateSettings({ day_start: e.target.value })} />
          </div>
          <div>
            <label className="label" htmlFor="de">Day ends</label>
            <input id="de" type="time" className="input" value={hhmm(settings.day_end)} onChange={(e) => e.target.value && e.target.value > hhmm(settings.day_start) && data.updateSettings({ day_end: e.target.value })} />
          </div>
        </div>
        <div className="mt-4">
          <label className="label" htmlFor="buf">Buffer between things · {settings.buffer_minutes} min</label>
          <input id="buf" type="range" min={0} max={30} step={5} value={settings.buffer_minutes} onChange={(e) => data.updateSettings({ buffer_minutes: Number(e.target.value) })} className="w-full accent-[rgb(var(--accent))]" />
        </div>
        <Toggle className="mt-4" checked={settings.use_learning} onChange={(v) => data.updateSettings({ use_learning: v })} title="Learn from my real times" sub="Plan longer or shorter blocks based on how long similar tasks actually took." />
        <Toggle className="mt-3" checked={settings.include_q4} onChange={(v) => data.updateSettings({ include_q4: v })} title="Also schedule Q4 tasks" sub="Not urgent & not important — placed last, if there's room." />
      </section>

      <section className="card p-4">
        <p className="eyebrow mb-3">Calendars</p>
        {data.sources.length > 0 && (
          <ul className="mb-4 space-y-1.5">
            {data.sources.map((s) => (
              <li key={s.id} className="flex items-center gap-2 rounded-xl bg-paper px-3 py-2 text-sm">
                <span className="h-3 w-3 rounded-full" style={{ background: s.color }} />
                <span className="flex-1 font-medium">{s.name}</span>
                <span className="text-xs text-muted">{s.provider}</span>
                <button className="btn-ghost px-1.5 py-1 text-muted" onClick={() => confirm(`Disconnect ${s.name}?`) && data.removeSource(s.id)} aria-label="Remove"><Icon name="trash" size={14} /></button>
              </li>
            ))}
          </ul>
        )}

        <form onSubmit={add} className="space-y-3">
          <div className="grid grid-cols-3 gap-1 rounded-xl bg-paper p-1">
            {(["outlook", "google", "other"] as const).map((p) => (
              <button type="button" key={p} onClick={() => setProvider(p)} className={`rounded-lg py-1.5 text-sm font-medium ${provider === p ? "bg-card shadow-sm" : "text-muted"}`}>
                {p === "outlook" ? "Outlook" : p === "google" ? "Google" : "Other"}
              </button>
            ))}
          </div>
          {HELP[provider] && (
            <ol className="list-decimal space-y-1 pl-5 text-xs text-muted">
              {HELP[provider].steps.map((s) => <li key={s}>{s}</li>)}
            </ol>
          )}
          <input className="input" placeholder={provider === "outlook" ? "e.g. University timetable" : provider === "google" ? "e.g. Personal" : "Name"} value={name} onChange={(e) => setName(e.target.value)} maxLength={60} />
          <input className="input font-mono text-xs" placeholder="https://… .ics  (or webcal://…)" value={url} onChange={(e) => setUrl(e.target.value)} required autoComplete="off" spellCheck={false} />
          <div className="flex items-center gap-2">
            {COLORS.map((c) => (
              <button type="button" key={c} onClick={() => setColor(c)} className={`h-6 w-6 rounded-full ring-offset-2 ring-offset-card ${color === c ? "ring-2 ring-ink" : ""}`} style={{ background: c }} aria-label={`Color ${c}`} />
            ))}
          </div>
          <button className="btn-primary w-full" disabled={busy || !url.trim()}>{busy ? "Checking the link…" : "Connect calendar"}</button>
          {msg && <p className={`text-sm ${msg.ok ? "text-accent" : "text-q1"}`}>{msg.text}</p>}
          <p className="text-[11px] leading-relaxed text-muted">
            The link is a private key to your calendar. It&apos;s tested, encrypted on the server (AES-256) and only ever used server-side to read events — it is never sent back to your devices. Read-only: nothing is written to your calendars.
          </p>
        </form>
      </section>

      <section className="card p-4 md:col-span-2">
        <p className="eyebrow mb-2">Account & devices</p>
        <p className="text-sm">Signed in as <b>{email}</b>. Sign in with the same email on your phone and computer — everything syncs live.</p>
        <p className="mt-2 text-sm text-muted">
          <b className="text-ink">Install on your phone:</b> iPhone — open in Safari → Share → “Add to Home Screen”. Android — Chrome menu → “Install app”.
        </p>
        <button
          className="btn-outline mt-3"
          onClick={async () => {
            await getSupabase().auth.signOut();
            router.replace("/login");
          }}
        >
          Sign out
        </button>
      </section>
    </div>
  );
}

function Toggle({ checked, onChange, title, sub, className = "" }: { checked: boolean; onChange: (v: boolean) => void; title: string; sub: string; className?: string }) {
  return (
    <button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)} className={`flex w-full items-start gap-3 text-left ${className}`}>
      <span className={`mt-0.5 flex h-6 w-10 shrink-0 items-center rounded-full p-0.5 transition ${checked ? "bg-accent" : "bg-ink/20"}`}>
        <span className={`h-5 w-5 rounded-full bg-white shadow transition ${checked ? "translate-x-4" : ""}`} />
      </span>
      <span>
        <span className="block text-sm font-medium">{title}</span>
        <span className="block text-xs text-muted">{sub}</span>
      </span>
    </button>
  );
}
