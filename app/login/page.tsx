"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabase } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [stage, setStage] = useState<"email" | "code">("email");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function sendCode(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const { error } = await getSupabase().auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: `${window.location.origin}/auth/callback`, shouldCreateUser: true },
    });
    setBusy(false);
    if (error) setMsg(error.message);
    else setStage("code");
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const { error } = await getSupabase().auth.verifyOtp({ email: email.trim(), token: code.trim(), type: "email" });
    setBusy(false);
    if (error) setMsg(error.message);
    else router.replace("/");
  }

  return (
    <main className="mx-auto flex min-h-[100dvh] max-w-sm flex-col justify-center px-5">
      <p className="eyebrow">Day Planner</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">Plan the day you actually have.</h1>
      <p className="mt-2 text-sm text-muted">Sign in with your email. No password — you get a one-time code.</p>

      {stage === "email" ? (
        <form onSubmit={sendCode} className="mt-8 space-y-3">
          <label className="label" htmlFor="email">Email</label>
          <input id="email" type="email" required autoComplete="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
          <button className="btn-primary w-full py-2.5" disabled={busy}>{busy ? "Sending…" : "Send code"}</button>
        </form>
      ) : (
        <form onSubmit={verify} className="mt-8 space-y-3">
          <label className="label" htmlFor="code">Code from your email</label>
          <input id="code" inputMode="numeric" autoComplete="one-time-code" required className="input text-center font-mono text-2xl tracking-[0.4em]" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 8))} placeholder="••••••" />
          <button className="btn-primary w-full py-2.5" disabled={busy || code.length < 6}>{busy ? "Checking…" : "Sign in"}</button>
          <p className="text-xs text-muted">On a computer you can also just click the link in the email. On a phone with the app installed, type the code here instead so you stay inside the app.</p>
          <button type="button" className="btn-ghost w-full" onClick={() => setStage("email")}>Use a different email</button>
        </form>
      )}
      {msg && <p className="mt-4 rounded-xl bg-q1/10 px-3 py-2 text-sm text-q1">{msg}</p>}
    </main>
  );
}
