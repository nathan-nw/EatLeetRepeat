# Eat Leet Repeat — Product Requirements Document

**Domain:** eatleetrepeat.com
**Owner:** Nathan
**Status:** spec, ready for build — stack, scope, and scheduler locked; **multi-tenant with auth**
**Last updated:** July 2026

---

## 1. Overview

Eat Leet Repeat is a LeetCode activity tracker. It automatically records what problems a user solves **over time** — with a specific emphasis on **repeats** (problems they re-solve to warm up or refresh). It exists so that during peak recruiting season a user can look back and see their actual practice patterns, not just a lifetime "problems solved" counter.

The core insight driving the design: the value isn't in cumulative totals (LeetCode already shows those). The value is in the *timeline* — when you practiced, what you re-did, and how your activity ramps as interviews approach.

There is **no manual logging**. Each user signs in, registers their public LeetCode handle once, and the app does the rest: a scheduled poller pulls their recent accepted submissions from LeetCode's public data and persists them to our own database, which becomes the durable source of truth for that user.

## 2. Goals

- Let anyone sign up, connect their public LeetCode handle, and get an automatic timeline with zero manual entry.
- Automatically capture every accepted submission with an accurate timestamp.
- Correctly record **re-solves** of previously solved problems as distinct events (this is the headline feature).
- Provide a timeline/feed, a calendar heatmap, and a per-problem history so activity over time is legible at a glance.
- Run reliably and unattended on an hourly cadence across all registered users.
- Isolate each user's data — a user sees only their own activity.
- Own the data on our side so LeetCode's response-size limits never constrain history length.

## 3. Non-goals

- Not tracking lifetime totals or cross-user leaderboards.
- Not tracking **failed** submissions (requires each user's authenticated LeetCode access — out of scope; see §11).
- Not doing a historical backfill of pre-registration activity (see §11).
- No code storage, no solution content, no analysis of submitted code.
- Not a social product — no following, sharing feeds, or public profiles in this version.

## 4. Users & auth

Multiple users, each with an account. Authentication is via **Supabase Auth** using **email + password**: signup requires a one-time email confirmation, after which the user signs in with their email and password (a password-reset flow covers forgotten passwords). On first sign-in a user completes a one-step onboarding: enter their public **LeetCode username**, which is stored on their `profiles` row (§7). That handle is what the poller tracks for them.

- **A LeetCode handle can be claimed by only one account** (enforced by a unique index), so the poller never double-tracks the same handle.
- **Per-user data isolation** is enforced by Postgres Row Level Security: a signed-in user can read only their own `profiles`, `submissions`, and `poll_runs`. Problem metadata (`problems`) is shared/global and readable by any signed-in user.
- We only ever read **public** LeetCode data (the user's public accepted-submission feed). We never ask for or store a user's LeetCode password or session cookie.

## 5. Data source & integration

LeetCode has **no official public API**. The app uses LeetCode's unofficial GraphQL endpoint. This is undocumented, unstable, rate-limited, and a ToS gray area (see §10 for the risks this project is accepting by running it multi-user and public).

**Endpoint:** `POST https://leetcode.com/graphql`

### 5.1 Primary query — recent accepted submissions (public, no auth)

```graphql
query recentAcSubmissions($username: String!, $limit: Int!) {
  recentAcSubmissionList(username: $username, limit: $limit) {
    id
    title
    titleSlug
    timestamp
  }
}
```

- `limit` is **hard-capped at 20 server-side**. Passing a higher value returns at most 20. There is no `offset` or cursor — this endpoint is not paginated.
- `timestamp` is a Unix epoch **in seconds** (string). Convert to `timestamptz`.
- `id` is a stable, unique per-submission identifier. **This is the dedup key.** A genuine re-solve produces a new `id` and new `timestamp`, so it correctly lands as a new row rather than colliding with the prior solve.
- Returns only **accepted** submissions.
- The query is run **per registered user**, substituting each user's `leetcode_username`.

### 5.2 Enrichment query — problem metadata (public, no auth)

`recentAcSubmissionList` does **not** include difficulty or tags. Problem metadata is the same for every user, so it lives in a shared `problems` table. When the poller sees a `titleSlug` no user has recorded before, fetch metadata once and cache it:

```graphql
query questionData($titleSlug: String!) {
  question(titleSlug: $titleSlug) {
    questionFrontendId
    title
    titleSlug
    difficulty
    topicTags { name slug }
  }
}
```

### 5.3 Request hygiene

- Send a normal browser-like `User-Agent` and `Content-Type: application/json`.
- Handle HTTP 429 with exponential backoff and skip the run rather than retry-hammering.
- **Stagger per-user requests** within a run (e.g. a small delay between users) so a run with N users doesn't burst N requests at the endpoint at once.
- Treat all responses defensively — the endpoint is undocumented and can change or return partial data.

## 6. Architecture

```
┌───────────────┐  hourly GET  ┌──────────────────┐  upsert   ┌──────────────┐
│  cron-job.org │ ───────────► │  /api/poll route │ ────────► │   Postgres   │
│  (scheduler)  │  + secret    │  (Next.js/Vercel)│           │  (Supabase)  │
└───────────────┘              └────────┬─────────┘           └──────┬───────┘
                                        │ for each user:             │
                                        │ GraphQL(username)          │ RLS-scoped
                                        ▼                            ▼ read
                                leetcode.com/graphql          ┌──────────────┐
                                                              │  Next.js UI  │
                            ┌──────────────┐   sign in        │  (Vercel)    │
                            │ Supabase Auth│ ◄────────────────│  per user    │
                            └──────────────┘                  └──────────────┘
```

cron-job.org triggers the `/api/poll` route hourly (authenticated with a shared secret). The poller loads every registered user, and for each one fetches their recent 20 accepted submissions, upserts them into Postgres (idempotent, keyed on `(user_id, id)`), enriches any new problems into the shared `problems` table, and logs a per-user run. The frontend reads exclusively from our database — never directly from LeetCode — and each user sees only their own rows.

**Why the 20-cap doesn't matter:** the cap limits a single response, not accumulated history. Because we persist every submission we see and poll repeatedly, each user's history grows without bound. Overlapping polls re-return the same recent submissions; idempotent upserts make that a no-op. Data is only ever lost if a single user makes **more than 20 accepted submissions** between two consecutive polls — impossible for a human within an hour.

### 6.1 Tech stack & hosting (locked)

- **Frontend + poller:** one Next.js (App Router, TypeScript) app deployed on **Vercel (Hobby / free tier)**. The poller is a route handler at `/api/poll` in the same app — no separate backend service.
- **Auth:** **Supabase Auth** (via `@supabase/ssr` for App Router session handling).
- **Database:** **Supabase (free tier)** Postgres, with Row Level Security.
- **Charts:** Recharts.
- **Styling:** Tailwind CSS.
- **Scheduler:** **cron-job.org (free)** — see §8. (Vercel Hobby cannot run this natively: its cron is capped at once per day, so an hourly expression fails at deploy. An external scheduler is the deliberate choice, not a workaround for a paid feature.)

Single repo, single deploy, zero recurring cost.

## 7. Data model

```sql
-- One row per authenticated app user, 1:1 with auth.users. Holds the tracked
-- LeetCode handle. A handle can be claimed by only one account.
create table profiles (
  id                uuid primary key references auth.users (id) on delete cascade,
  leetcode_username text not null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create unique index on profiles (lower(leetcode_username));

-- One row per unique accepted submission, scoped to a user. Re-solves = more
-- rows. Dedup on (user_id, id); a re-solve has a new LeetCode id + timestamp.
create table submissions (
  id            text not null,             -- LeetCode submission id
  user_id       uuid not null references profiles (id) on delete cascade,
  title         text not null,
  title_slug    text not null,
  submitted_at  timestamptz not null,      -- derived from LeetCode `timestamp` (unix seconds)
  first_seen_at timestamptz not null default now(),
  primary key (user_id, id)
);
create index on submissions (user_id, title_slug);
create index on submissions (user_id, submitted_at desc);

-- Cached problem metadata, GLOBAL (shared across all users). Enriched once.
create table problems (
  title_slug  text primary key,
  frontend_id text,
  title       text not null,
  difficulty  text,          -- Easy | Medium | Hard
  topic_tags  text[],
  updated_at  timestamptz not null default now()
);

-- Poller health / observability, per user (null user_id = whole-run error).
create table poll_runs (
  id            bigserial primary key,
  user_id       uuid references profiles (id) on delete cascade,
  ran_at        timestamptz not null default now(),
  fetched_count int not null,
  new_count     int not null,
  status        text not null,   -- success | error
  error         text
);
create index on poll_runs (user_id, ran_at desc);
```

**Row Level Security.** RLS is enabled on all tables with per-user policies: a signed-in user can `select` only their own `profiles`/`submissions`/`poll_runs` rows (`auth.uid() = user_id`), and can `insert`/`update` only their own `profiles` row (onboarding + handle edits). `problems` is `select`-able by any authenticated user. **All writes go through the service role** (the poller), which bypasses RLS — there are no client-facing insert/update policies on `submissions`, `problems`, or `poll_runs`. The canonical, runnable schema (with the exact policies) lives in `supabase/schema.sql`.

## 8. The poller (hourly job)

Pseudocode:

```
on schedule (hourly):
  users = SELECT id, leetcode_username FROM profiles
  for u in users:
    try:
      subs = graphql(recentAcSubmissionList, { username: u.leetcode_username, limit: 20 })
      new = 0
      for s in subs:
        result = INSERT INTO submissions (id, user_id, title, title_slug, submitted_at)
                 VALUES (s.id, u.id, s.title, s.titleSlug, to_timestamp(s.timestamp))
                 ON CONFLICT (user_id, id) DO NOTHING
        if result.inserted:
          new += 1
          if s.titleSlug NOT IN problems:
            meta = graphql(questionData, { titleSlug: s.titleSlug })
            upsert into problems(...)          -- shared/global, best-effort
      log poll_run(user_id=u.id, fetched=len(subs), new=new, status='success')
    except err:
      log poll_run(user_id=u.id, fetched=0, new=0, status='error', error=str(err))
      continue    # one user's failure must not abort the others
    sleep(small_stagger_delay)
```

Requirements:

- **Idempotent.** Re-running the same poll changes nothing. `ON CONFLICT (user_id, id) DO NOTHING`.
- **Self-healing.** A missed hourly run is recovered by the next run, because each user's recent-20 window still contains their missed submissions (given the <20/hour-per-user reality).
- **Fault-isolated.** A failure fetching one user (bad handle, 429, timeout) is logged to that user's `poll_runs` and the loop continues to the next user.
- **Enrichment is best-effort.** If metadata fetch fails, still record the submission; backfill difficulty/tags on a later run.
- **Observable.** Every per-user run writes a `poll_runs` row so you can confirm it's alive and see counts.

### Scheduling — cron-job.org (locked)

The hourly trigger is an external scheduler, **cron-job.org** (free), pointing at the `/api/poll` route.

Setup:

1. Create a free cron-job.org account and add a cronjob.
2. **URL:** the production poller route, e.g. `https://eatleetrepeat.com/api/poll` (or the `*.vercel.app` URL).
3. **Schedule:** every hour, `0 * * * *`.
4. **Method:** `GET`.
5. **Custom header:** `Authorization: Bearer <CRON_SECRET>` — the value matches the `CRON_SECRET` env var set in Vercel.

Route auth (the poller must reject unauthenticated calls, since the URL is public):

```ts
// app/api/poll/route.ts (App Router)
export async function GET(request: Request) {
  const auth = request.headers.get('authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 });
  }
  // ... run the poller over all users (see pseudocode above) ...
  return Response.json({ ok: true });
}
```

Notes:

- Set `CRON_SECRET` to a random string of at least 16 characters in Vercel's environment variables; store the same value in cron-job.org's custom header.
- cron-job.org fires within ~1 minute of schedule and provides per-run execution history plus failure notifications — enable email alerts so a silently broken poller surfaces.
- **Watch the run's wall-clock budget.** The whole all-users loop happens in one request; with staggering, keep total runtime under Vercel's function timeout. If the user count ever outgrows a single request, switch to batching (poll a slice of users per run) — but that's a later concern.
- Timing drift is irrelevant here: the poller is idempotent and self-healing, so a late or occasionally-skipped run causes no data loss.

**Why not the alternatives:** Vercel Hobby cron is capped at once per day (hourly fails at deploy) and would cost $20/mo (Pro) to lift. GitHub Actions is free but its scheduled-workflow timing has degraded (10–30 min delays) and — the real dealbreaker for an always-on tracker — it auto-disables scheduled workflows after 60 days of repo inactivity, so the poller could silently stop during an off-season gap.

**Documented fallback:** if you'd rather add no external service at all, **Supabase pg_cron + pg_net** can schedule the same hourly HTTP call to `/api/poll` from inside the Postgres instance you're already running. Slightly more setup (enable the extensions, write the schedule as SQL), same result. cron-job.org is the default; this is the escape hatch if you want everything on Supabase.

## 9. Frontend requirements

**Auth & onboarding.** Unauthenticated visitors get a landing/sign-in page. After sign-in, a user with no `leetcode_username` is sent to a one-field onboarding step to enter their public LeetCode handle (validated by a live `recentAcSubmissionList` probe so a typo'd handle is caught immediately). Once set, they land on their dashboard. A settings screen lets them edit their handle later.

**Data scoping.** Every view shows only the signed-in user's data (server-side reads filtered by the session user's id; RLS as defense-in-depth).

Every problem is displayed by its **LeetCode problem number and name** together — e.g. `#1 · Two Sum` — using `problems.frontend_id` and `problems.title`. This pairing is the canonical way a problem is shown everywhere in the UI.

Views (all per-user):

1. **Activity timeline** — reverse-chronological feed of completed submissions: `#number · name`, difficulty, tags, timestamp. The "what did I do, when" view.
2. **Calendar heatmap** — submissions per day (GitHub-contribution style). Answers "am I ramping for recruiting season?" at a glance.
3. **Repeats view** — the headline feature. Problems solved more than once, each showing every solve date. Sortable by most-repeated.
4. **Per-problem history** — click any problem to see every time you've solved it, with timestamps.

Summary stats (shown prominently, e.g. a header strip): **count of unique problems completed** and **total submissions logged** — optionally broken down by difficulty. These reflect the accumulated log, not LeetCode's lifetime counters, and respect the active date-range filter.

Filters (apply across views): difficulty (Easy/Medium/Hard), topic tag, and date range.

Design direction: clean, minimal, data-forward. A Wealthsimple-style restrained aesthetic fits well — lots of whitespace, quiet color, one accent, legible typography. Charts via Recharts.

## 10. Non-functional requirements

- **Rate limiting / bans:** At one poll per user per hour, staggered within the run, total traffic scales linearly with the user count and stays far under the endpoint's effective ceiling (~20 req / 10 s that common libraries self-throttle to) for any realistic user base. Send a sane User-Agent, stagger requests, and back off on 429 (skip that user's run, recover next hour). If the user base grows large, revisit cadence/batching before it becomes a burst problem.
- **Terms of service (risk being accepted):** This uses an **unofficial** LeetCode endpoint, and running it as a hosted, multi-user, public product is a bigger ToS gray area than a private single-user tool. We mitigate by reading only public data, never handling users' LeetCode credentials, keeping request volume low and polite, and backing off on throttling. The endpoint can still change or block us at any time; that's an accepted operational risk of this project, not something the design can fully remove.
- **Data isolation:** RLS per user, plus service-role-only writes. A user must never be able to read another user's submissions.
- **Reliability:** Idempotent upserts + hourly cadence + per-user fault isolation make the system tolerant of missed/duplicated runs and individual-user failures.
- **Secrets & config:**
  - `CRON_SECRET` — protects `/api/poll` (shared between Vercel env and cron-job.org's header).
  - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` — client-side Supabase (auth + RLS-scoped reads).
  - `SUPABASE_SERVICE_ROLE_KEY` — **server only**; the poller's writes. Never shipped to the client.
  - The LeetCode public endpoint itself needs no credentials. The per-user LeetCode handle is **in the database** (`profiles.leetcode_username`), not an env var.

## 11. Future / out of scope

- **Historical backfill** — one-time import of a user's pre-registration activity via the authenticated `submissionList` endpoint (paginated), which requires that user's LeetCode **session cookie**. Deferred: it changes the credential/trust model (we'd be handling users' session cookies), which we're deliberately avoiding for now.
- **Failed attempts** — also requires the authenticated endpoint; would capture attempts that weren't accepted.
- **Recruiting-season reports** — date-range summaries, streaks, weekly rollups.
- **Social / sharing** — opt-in public profiles, following, comparisons.
- **Poller batching** — slice users across runs if a single hourly request can't cover everyone within the function timeout.

## 12. Decisions (locked)

- **Scope:** accepted submissions only. Failed attempts are explicitly out (see §11).
- **Tenancy:** multi-user. Supabase Auth; each user registers their own public LeetCode handle, stored in `profiles`. Per-user data isolation via RLS.
- **Hosting:** Next.js on Vercel Hobby (frontend + `/api/poll`), Supabase Postgres + Auth. Single repo.
- **Scheduler:** cron-job.org, hourly, `Authorization: Bearer <CRON_SECRET>`; the poll route loops over all users.
- **Credentials:** we read only public LeetCode data; we never store users' LeetCode passwords or session cookies.

## 13. Suggested build order

1. Provision Supabase project; apply `supabase/schema.sql` (§7, incl. RLS policies). Enable Supabase Auth email provider with **Confirm email** on (email + password); point the "Confirm signup" and "Reset password" email templates at `/auth/confirm` using the `token_hash`/`type` params. Set `CRON_SECRET` and the Supabase URL/anon/service-role env vars.
2. Auth + onboarding: sign-in, session handling (`@supabase/ssr`), and the "enter your LeetCode handle" step that writes the `profiles` row (validated against `recentAcSubmissionList`).
3. Build the GraphQL client; verify `recentAcSubmissionList` against a real username; confirm field shapes.
4. Poller route `/api/poll`: secret check → load all users → per-user fetch → upsert on `(user_id, id)` → shared enrichment → per-user `poll_runs` logging, with fault isolation + staggering.
5. Deploy to Vercel; create the cron-job.org hourly job pointing at `/api/poll` with the `Authorization` header; confirm rows appear for a registered user after real submissions.
6. Frontend (per-user): summary stats + activity timeline + calendar heatmap.
7. Repeats view + per-problem history.
8. Filters (difficulty / tag / date range) + settings (edit handle) + visual polish.

## 14. Acceptance criteria

- A new user can sign in, enter their public LeetCode handle, and — after the poller runs across a day of their real activity — see their own accepted submissions in the database with correct timestamps.
- Re-solving an already-solved problem creates a **new** `submissions` row (distinct `id`) for that user, and that re-solve is visible in their repeats view and the problem's history.
- A user's views render the timeline, calendar heatmap, and repeats view, all respecting the difficulty/tag/date filters, and show **only that user's** data (no cross-user leakage — verified against RLS).
- The poller processes all registered users in one run; one user's failure doesn't stop the others; `poll_runs` shows successful per-user hourly runs with sensible fetched/new counts.
