# Day Planner

A personal daily planner that works on phone and PC, synced live.

1. **Tasks** — add what you need to do and how long you think it takes.
2. **Sort** — drag (or tap) each task into the Eisenhower matrix: urgent/important.
3. **Plan** — the planner reads your Google and Outlook calendars and suggests slots for your tasks: most important first, only in free time, with a buffer around every lecture and task. Accept all, accept one by one, skip, or set a time yourself.
4. **Now** — start a task, pause for breaks, finish it. Every session is recorded.
5. **Review** — planned vs. real time per task, and what the planner has learned about each category. Fix sessions you forgot to pause.

**Learning:** when a category (e.g. "Accounting") keeps taking you 1.4× longer than your estimate, new tasks in that category are planned 1.4× longer. It weighs recent tasks more, needs a few samples before it trusts itself fully, and falls back to similar task titles when there's no category.

**Stack:** Next.js 14 (App Router) · Supabase (Postgres, Auth, Realtime) · Tailwind · ical.js. Installable as a PWA.

---

## Setup (about 15 minutes)

### 1. Supabase project
1. Create a free project at [supabase.com](https://supabase.com). Pick an EU region (e.g. Frankfurt).
2. **SQL Editor → New query** → paste all of `supabase/migrations/0001_init.sql` → Run.
3. **Authentication → Sign In / Providers → Email**: keep Email on.
4. **Authentication → Emails → "Magic Link" template** — make it include the 6-digit code so you can sign in inside the installed phone app:
   ```html
   <h2>Your sign-in code</h2>
   <p style="font-size:28px;letter-spacing:6px"><b>{{ .Token }}</b></p>
   <p>Or <a href="{{ .ConfirmationURL }}">click here to sign in</a>.</p>
   ```
5. **Authentication → URL Configuration**: set Site URL to your deployed URL (later), and add `http://localhost:3000/**` and `https://YOUR-APP.vercel.app/**` to Redirect URLs.

### 2. Run locally
```bash
npm install
cp .env.example .env.local
npm run gen:key          # paste the output into ICS_ENCRYPTION_KEY
# fill in NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY (Project Settings → API)
npm run dev
```
Open http://localhost:3000 and sign in with your email.

### 3. Lock it to yourself
After you've signed in once: **Authentication → Sign In / Providers → turn off "Allow new users to sign up"**. Now nobody else can create an account on your deployment.

### 4. Deploy (Vercel)
1. Push to GitHub, import the repo on [vercel.com](https://vercel.com).
2. Add the three env vars from `.env.local`.
3. Deploy, then put the Vercel URL into Supabase's Site URL / Redirect URLs.

### 5. Install on your phone
- **iPhone:** open the site in Safari → Share → *Add to Home Screen*.
- **Android:** Chrome menu → *Install app*.

Sign in with the same email on every device. Changes sync live via Supabase Realtime, and the app refreshes whenever you reopen it.

---

## Connecting calendars

Read-only, via each calendar's private **ICS link**. Nothing is written back to your calendars.

| Calendar | Where to find the link |
|---|---|
| **Google** | calendar.google.com → ⚙ Settings → click the calendar → *Integrate calendar* → **Secret address in iCal format** |
| **Outlook / Microsoft 365** | outlook.office.com → ⚙ Settings → Calendar → *Shared calendars* → **Publish a calendar** → "Can view all details" → copy the **ICS** link |

If your university account doesn't allow publishing, check whether the uni timetable system offers its own ICS/iCal subscription link — that works too.

Notes:
- Recurring lectures, moved/cancelled occurrences, and time zones (including Outlook's Windows zone names and DST) are handled.
- Events marked *free* and all-day events are shown but don't block time.
- Google refreshes its secret feed quickly; published Outlook calendars can lag by up to a few hours. The ↻ button in Plan forces a re-fetch.

---

## Security

- **Row Level Security** on every table: each row belongs to one user and can only be read or changed by that signed-in user — enforced by Postgres, not just the app.
- **Calendar links are encrypted** (AES-256-GCM) with a server-only key before being stored, are tested on save, and are only ever decrypted on the server to fetch events. They are never sent back to the browser.
- **Passwordless sign-in** (email code / magic link). Turn off sign-ups after creating your account (step 3).
- Server only fetches `https://` feeds on public hosts; security headers (HSTS, no framing, nosniff) are set in `next.config.mjs`.
- The anon key in the browser is safe to expose — RLS is what protects the data. Never put the Supabase **service_role** key in this app.

---

## Project map

```
app/
  page.tsx                 → signed-in app (PlannerApp)
  login/                   → email code sign-in
  auth/callback/           → magic-link landing
  api/calendars/           → add / list / remove calendars (encrypts links)
  api/events/              → fetches + expands ICS feeds for a day
components/
  PlannerApp.tsx           → shell, tabs, day navigation
  TasksView / TaskForm     → add & edit tasks (live learning hint)
  MatrixView               → Eisenhower sort (drag on desktop, tap on phone)
  PlanView / DayTimeline   → suggestions + day view with planned vs actual
  NowView                  → timer: start / pause / resume / finish
  ReviewView               → planned vs real, session fixes, learned ratios
  SettingsView             → day hours, buffer, calendars, sign-out
hooks/usePlannerData.ts    → all data + mutations + realtime sync
lib/
  scheduler.ts             → free-slot finder + priority first-fit (tested)
  learning.ts              → duration learning (tested)
  ics.ts, tz.ts            → ICS parsing, recurrence, time zones (tested)
  crypto.ts                → AES-256-GCM for calendar links
supabase/migrations/       → schema + RLS + realtime
```

`npm test` runs the scheduler, learning and calendar-parsing tests.

## Ideas for next iterations
- Drag suggested blocks on the timeline to move them
- Split long tasks across several free gaps
- "Plan tomorrow" evening reminder (push notification)
- Two-way sync: write accepted blocks into Google/Outlook (needs OAuth per provider)
- Weekly review: hours per category, estimate accuracy trend
