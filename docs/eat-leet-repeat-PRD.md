# Eat Leet Repeat — Product Requirements Document

**Domain:** eatleetrepeat.com
**Owner:** Nathan
**Status:** v1 spec, ready for build — stack, scope, and scheduler locked
**Last updated:** July 2026

---

## 1. Overview

Eat Leet Repeat is a personal LeetCode activity tracker. It automatically records what problems you solve **over time** — with a specific emphasis on **repeats** (problems you re-solve to warm up or refresh). It exists so that during peak recruiting season you can look back and see your actual practice patterns, not just a lifetime "problems solved" counter.

The core insight driving the design: the value isn't in cumulative totals (LeetCode already shows those). The value is in the *timeline* — when you practiced, what you re-did, and how your activity ramps as interviews approach.

There is **no manual logging** and **no user login**. The app polls LeetCode's public data on a schedule and persists it to our own database, which becomes the durable source of truth.

## 2. Goals

- Automatically capture every accepted submission with an accurate timestamp, with zero manual entry.
- Correctly record **re-solves** of previously solved problems as distinct events (this is the headline feature).
- Provide a timeline/feed, a calendar heatmap, and a per-problem history so activity over time is legible at a glance.
- Run reliably and unattended on an hourly cadence.
- Own the data on our side so LeetCode's response-size limits never constrain history length.

## 3. Non-goals (v1)

- Not tracking lifetime totals or leaderboards.
- Not tracking **failed** submissions (requires authenticated access — see §11).
- Not a multi-user product. Single hardcoded user for v1.
- Not doing a historical backfill of pre-launch activity in v1 (see §11 for the v2 path).
- No code storage, no solution content, no analysis of submitted code.

## 4. User

A single user (the owner). Identified by a public LeetCode username stored in config/env. No auth, no accounts, no per-user data isolation needed in v1.

## 5. Data source & integration

LeetCode has **no official public API**. The app uses LeetCode's unofficial GraphQL endpoint. This is undocumented, unstable, rate-limited, and a ToS gray area — acceptable for a private single-user tool, not for anything scaled or shared publicly (see §10).

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

### 5.2 Enrichment query — problem metadata (public, no auth)

`recentAcSubmissionList` does **not** include difficulty or tags. When the poller sees a `titleSlug` it hasn't recorded before, fetch metadata once and cache it:

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
- Treat all responses defensively — the endpoint is undocumented and can change or return partial data.

## 6. Architecture

```
┌───────────────┐  hourly GET  ┌──────────────────┐  upsert   ┌──────────────┐
│  cron-job.org │ ───────────► │  /api/poll route │ ────────► │   Postgres   │
│  (scheduler)  │  + secret    │  (Next.js/Vercel)│           │  (Supabase)  │
└───────────────┘              └────────┬─────────┘           └──────┬───────┘
                                        │ GraphQL                    │
                                        ▼                            │ read
                                leetcode.com/graphql                 ▼
                                                             ┌──────────────┐
                                                             │  Next.js UI  │
                                                             │  (Vercel)    │
                                                             └──────────────┘
```

cron-job.org triggers the `/api/poll` route hourly (authenticated with a shared secret). The poller fetches the recent 20 accepted submissions, upserts them into Postgres (idempotent, keyed on submission `id`), enriches any new problems, and logs the run. The frontend reads exclusively from our database — never directly from LeetCode.

**Why the 20-cap doesn't matter:** the cap limits a single response, not accumulated history. Because we persist every submission we see and poll repeatedly, the database grows without bound. Overlapping polls re-return the same recent submissions; idempotent upserts make that a no-op. Data is only ever lost if **more than 20 accepted submissions** occur between two consecutive polls — impossible for a human within an hour.

### 6.1 Tech stack & hosting (locked)

- **Frontend + poller:** one Next.js (App Router, TypeScript) app deployed on **Vercel (Hobby / free tier)**. The poller is a route handler at `/api/poll` in the same app — no separate backend service.
- **Database:** **Supabase (free tier)** Postgres.
- **Charts:** Recharts.
- **Styling:** Tailwind CSS.
- **Scheduler:** **cron-job.org (free)** — see §8. (Vercel Hobby cannot run this natively: its cron is capped at once per day, so an hourly expression fails at deploy. An external scheduler is the deliberate choice, not a workaround for a paid feature.)

Single repo, single deploy, zero recurring cost.

## 7. Data model

```sql
-- One row per unique accepted submission. Re-solves = additional rows.
create table submissions (
  id            text primary key,          -- LeetCode submission id (dedup key)
  title         text not null,
  title_slug    text not null,
  submitted_at  timestamptz not null,      -- derived from LeetCode `timestamp` (unix seconds)
  first_seen_at timestamptz not null default now()  -- when our poller first recorded it
);
create index on submissions (title_slug);
create index on submissions (submitted_at desc);

-- Cached problem metadata, enriched separately from the submission feed.
create table problems (
  title_slug  text primary key,
  frontend_id text,
  title       text not null,
  difficulty  text,          -- Easy | Medium | Hard
  topic_tags  text[],
  updated_at  timestamptz not null default now()
);

-- Poller health / observability.
create table poll_runs (
  id            bigserial primary key,
  ran_at        timestamptz not null default now(),
  fetched_count int not null,
  new_count     int not null,
  status        text not null,   -- success | error
  error         text
);
```

If deployed on Supabase, enable RLS and lock these tables to server-side/service-role access only (the UI can read via a server route or a read-only policy, since there's no per-user data to isolate in v1).

## 8. The poller (hourly job)

Pseudocode:

```
on schedule (hourly):
  try:
    subs = graphql(recentAcSubmissionList, { username: USERNAME, limit: 20 })
    new = 0
    for s in subs:
      result = INSERT INTO submissions (id, title, title_slug, submitted_at)
               VALUES (s.id, s.title, s.titleSlug, to_timestamp(s.timestamp))
               ON CONFLICT (id) DO NOTHING
      if result.inserted:
        new += 1
        if s.titleSlug NOT IN problems:
          meta = graphql(questionData, { titleSlug: s.titleSlug })
          upsert into problems(...)
    log poll_run(fetched=len(subs), new=new, status='success')
  except err:
    log poll_run(fetched=0, new=0, status='error', error=str(err))
```

Requirements:

- **Idempotent.** Re-running the same poll changes nothing. `ON CONFLICT (id) DO NOTHING`.
- **Self-healing.** A missed hourly run is recovered by the next run, because the recent-20 window still contains the missed submissions (given the <20/hour reality).
- **Enrichment is best-effort.** If metadata fetch fails, still record the submission; backfill difficulty/tags on a later run.
- **Observable.** Every run writes a `poll_runs` row so you can confirm it's alive and see counts.

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
  // ... run the poller (see pseudocode above) ...
  return Response.json({ ok: true });
}
```

Notes:

- Set `CRON_SECRET` to a random string of at least 16 characters in Vercel's environment variables; store the same value in cron-job.org's custom header.
- cron-job.org fires within ~1 minute of schedule and provides per-run execution history plus failure notifications — enable email alerts so a silently broken poller surfaces.
- Timing drift is irrelevant here anyway: the poller is idempotent and self-healing, so a late or occasionally-skipped run causes no data loss.

**Why not the alternatives:** Vercel Hobby cron is capped at once per day (hourly fails at deploy) and would cost $20/mo (Pro) to lift. GitHub Actions is free but its scheduled-workflow timing has degraded (10–30 min delays) and — the real dealbreaker for an always-on tracker — it auto-disables scheduled workflows after 60 days of repo inactivity, so the poller could silently stop during an off-season gap.

**Documented fallback:** if you'd rather add no external service at all, **Supabase pg_cron + pg_net** can schedule the same hourly HTTP call to `/api/poll` from inside the Postgres instance you're already running. Slightly more setup (enable the extensions, write the schedule as SQL), same result. cron-job.org is the default; this is the escape hatch if you want everything on Supabase.

## 9. Frontend requirements (v1)

Every problem is displayed by its **LeetCode problem number and name** together — e.g. `#1 · Two Sum` — using `problems.frontend_id` and `problems.title`. This pairing is the canonical way a problem is shown everywhere in the UI.

Views:

1. **Activity timeline** — reverse-chronological feed of completed submissions: `#number · name`, difficulty, tags, timestamp. The "what did I do, when" view.
2. **Calendar heatmap** — submissions per day (GitHub-contribution style). Answers "am I ramping for recruiting season?" at a glance.
3. **Repeats view** — the headline feature. Problems solved more than once, each showing every solve date. Sortable by most-repeated.
4. **Per-problem history** — click any problem to see every time you've solved it, with timestamps.

Summary stats (shown prominently, e.g. a header strip): **count of unique problems completed** and **total submissions logged** — optionally broken down by difficulty. These reflect the accumulated log, not LeetCode's lifetime counters, and respect the active date-range filter.

Filters (apply across views): difficulty (Easy/Medium/Hard), topic tag, and date range.

Design direction: clean, minimal, data-forward. A Wealthsimple-style restrained aesthetic fits well — lots of whitespace, quiet color, one accent, legible typography. Charts via Recharts.

## 10. Non-functional requirements

- **Rate limiting / bans:** One request per hour is roughly 36,000× under the endpoint's effective ceiling (~20 req / 10 s that common libraries self-throttle to). No ban risk at this cadence. Still send a sane User-Agent and back off on 429.
- **Terms of service:** Unofficial endpoint, personal use only. Do not scale to many users, do not share publicly, do not monetize on top of it.
- **Reliability:** Idempotent upserts + hourly cadence make the system tolerant of missed or duplicated runs.
- **Secrets:** One for v1 — `CRON_SECRET` (protects the `/api/poll` route; shared between Vercel env vars and cron-job.org's request header). The LeetCode public endpoint itself needs no credentials. (Auth-based features in v2 would add a session-cookie secret.)
- **Config:** `LEETCODE_USERNAME` env var (single user for v1), plus standard Supabase connection/service-role env vars.

## 11. Future / out of scope for v1

- **Historical backfill** — one-time import of pre-launch activity via the authenticated `submissionList` endpoint (paginated: `offset` + `limit` + `lastKey`/`hasNext` cursor), which requires a LeetCode **session cookie**. Grab the cookie once, page through full history, then never need it again.
- **Failed attempts** — also requires the authenticated endpoint; would capture attempts that weren't accepted.
- **Recruiting-season reports** — date-range summaries, streaks, weekly rollups.
- **Multi-user** — would require real auth and per-user username config + data isolation.

## 12. Decisions (locked for v1)

- **Scope:** accepted submissions only. Failed attempts are explicitly out (not needed — see §11 for the v2 path).
- **Hosting:** Next.js on Vercel Hobby (frontend + `/api/poll`), Supabase Postgres. Single repo.
- **Scheduler:** cron-job.org, hourly, `Authorization: Bearer <CRON_SECRET>`.
- **User:** single user via `LEETCODE_USERNAME` env var.

Remaining open question: whether to shape the schema now to accommodate the eventual v2 auth backfill / failed attempts, or defer entirely. Default: defer — the current schema already tolerates adding those later without a breaking migration.

## 13. Suggested build order

1. Provision Supabase project; apply schema (§7). Set `LEETCODE_USERNAME` and `CRON_SECRET` env vars.
2. Build GraphQL client; verify `recentAcSubmissionList` against the real username; confirm field shapes.
3. Poller route `/api/poll`: secret check → fetch → upsert on `id` → `poll_runs` logging.
4. Deploy to Vercel; create the cron-job.org hourly job pointing at `/api/poll` with the `Authorization` header; confirm rows appear after real submissions.
5. Problem metadata enrichment for new slugs (so `#number · name`, difficulty, and tags are available).
6. Frontend: summary stats + activity timeline + calendar heatmap.
7. Repeats view + per-problem history.
8. Filters (difficulty / tag / date range) + visual polish.

## 14. v1 acceptance criteria

- Given the configured username, after the poller runs across a day of real activity, the database contains every accepted submission from that period with correct timestamps.
- Re-solving an already-solved problem creates a **new** `submissions` row (distinct `id`), and that re-solve is visible in the repeats view and the problem's history.
- The UI renders the timeline, the calendar heatmap, and the repeats view, and all three respect the difficulty/tag/date filters.
- `poll_runs` shows successful hourly runs with sensible fetched/new counts.