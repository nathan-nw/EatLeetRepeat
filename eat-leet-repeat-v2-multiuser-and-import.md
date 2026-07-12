# Eat Leet Repeat — v2: Multi-User + History Import

**Status:** new spec. **Supersedes `eat-leet-repeat-backfill-spec.md` entirely** (that doc assumed a single user running a local script; both assumptions are now wrong).
**Relationship to v1:** extends `eat-leet-repeat-PRD.md`. The core loop (poll → upsert on submission id → timeline/heatmap/repeats views) is unchanged. This adds accounts, per-user data, and a user-driven history import.
**Owner:** Nathan
**Last updated:** July 2026

---

## 1. What changed and why

Two decisions drive this doc:

1. **This becomes a hosted product other people use.** v1 was single-user with a hardcoded username.
2. **History import must still work** — but the v1 mechanism (grab your own session cookie, run a local script) **cannot be offered to other users.**

### 1.1 The constraint that shapes everything

LeetCode's **public** endpoint returns only the **most recent 20 accepted submissions** per username. Full history lives behind an **authenticated** endpoint requiring that user's `LEETCODE_SESSION` cookie.

A session cookie is **unscoped, full-account access** — not a read-only token. Therefore:

> ⛔ **We never ask users to give us their session cookie. We never transmit it, never store it, never log it.** A hosted database of live session cookies is a catastrophic breach risk and makes us liable for every account it exposes. This is not negotiable and no feature justifies it.

### 1.2 The resulting architecture: two tiers

| | Mechanism | Auth needed | Data |
|---|---|---|---|
| **Forward tracking** (everyone, automatic) | Server polls public endpoint hourly by username | None | Accepted submissions from signup onward |
| **History import** (opt-in, manual) | User runs an export snippet in their **own** browser, uploads the resulting JSON | Their cookie, used **only in their own browser** | Full accepted history |

Forward tracking works for every user with zero effort. History import is opt-in, self-serve, and the user's cookie never crosses the network. New users see a sparse app that fills over time — unless they do the import, which is the pitch during onboarding.

## 2. Scope

**In:** user accounts; per-user data isolation; LeetCode username ownership verification; staggered multi-user polling; the BYO-export import flow (capture snippet → upload → parse → upsert → enrich); onboarding UX.

**Out:** failed attempts (accepted-only, unchanged); storing any user's session cookie, ever; a browser extension (noted as future); scraping other users' data without their action.

## 3. Supersedes / amends prior docs

- **`eat-leet-repeat-backfill-spec.md` — obsolete.** Delete or archive it. Its Phase A/B split survives in spirit (§6 here), but its local-script import and single-user assumptions are replaced.
- **`CLAUDE.md` rule #8** — replace with:

  > **8. Accepted-only.** The app never tracks failed attempts. The authenticated LeetCode endpoint is **never called by our servers**. It is called only by the client-side export snippet, running in the user's own browser, on their own action. No session cookie is ever transmitted to, stored by, or logged by our backend.

- **`CLAUDE.md` rule #2** (`/api/poll` secret) still holds, but the poller now iterates all users (§5.2).
- **`CLAUDE.md` rule #3** (dedup on submission `id`) still holds — now scoped per-user: the conflict target becomes `(user_id, id)`.
- **PRD §4** ("single user, no auth") — superseded by §4 here.

## 4. Multi-user changes

### 4.1 Auth

Use **Supabase Auth** (already in the stack). Email/password or OAuth — implementer's choice, GitHub OAuth is a natural fit for this audience.

### 4.2 LeetCode username ownership verification

**Required.** Without it, anyone can add someone else's username and track their activity. Standard pattern:

1. On onboarding, user enters their LeetCode username.
2. We generate a short random token, e.g. `elr-verify-7f3a9c`.
3. User temporarily pastes it into their **LeetCode profile bio/summary** (a public, editable field).
4. User clicks "Verify." We fetch their public profile via the public GraphQL `matchedUser` query and check the bio contains the token.
5. On success, mark `profiles.leetcode_verified_at`. User may remove the token.

Unverified accounts are **not polled** and **cannot import**.

### 4.3 Schema (revised — every table gains `user_id`)

```sql
-- One row per app user.
create table profiles (
  id                   uuid primary key references auth.users(id) on delete cascade,
  leetcode_username    text,
  leetcode_verified_at timestamptz,
  verify_token         text,
  poll_slot            smallint not null,   -- 0-59: which minute of the hour we poll them (§5.2)
  last_polled_at       timestamptz,
  poll_cadence         text not null default 'hourly',  -- hourly | daily (see §5.3)
  created_at           timestamptz not null default now()
);

-- One row per unique accepted submission, per user. Re-solves = additional rows.
create table submissions (
  user_id       uuid not null references profiles(id) on delete cascade,
  id            text not null,             -- LeetCode submission id
  title         text not null,
  title_slug    text not null,
  submitted_at  timestamptz not null,      -- the TRUE solve time (historical for imports)
  source        text not null default 'poll',   -- poll | import
  first_seen_at timestamptz not null default now(),
  primary key (user_id, id)                -- ← dedup key. Same submission id per user only once.
);
create index on submissions (user_id, submitted_at desc);
create index on submissions (user_id, title_slug);

-- Problem metadata is GLOBAL, not per-user. Shared cache across all users.
create table problems (
  title_slug  text primary key,
  frontend_id text,
  title       text not null,
  difficulty  text,
  topic_tags  text[],
  updated_at  timestamptz not null default now()
);

-- Poller health, per run.
create table poll_runs (
  id            bigserial primary key,
  user_id       uuid references profiles(id) on delete cascade,
  ran_at        timestamptz not null default now(),
  fetched_count int not null,
  new_count     int not null,
  status        text not null,             -- success | error
  error         text
);

-- Import job tracking (§6.4).
create table import_jobs (
  id            bigserial primary key,
  user_id       uuid not null references profiles(id) on delete cascade,
  started_at    timestamptz not null default now(),
  finished_at   timestamptz,
  status        text not null,             -- pending | parsing | importing | enriching | done | error
  rows_received int,
  rows_accepted int,
  rows_inserted int,
  rows_skipped  int,
  error         text
);
```

**RLS: on, for every table.** Users read only rows where `user_id = auth.uid()`. `problems` is world-readable (it's public problem metadata). All writes go through server-side code using the service role.

**Migration note:** v1's `submissions` primary key was `id` alone. Moving to `(user_id, id)` is a breaking change — for a v1 instance with only your own data, backfill your `user_id` into existing rows, then alter the PK.

## 5. Multi-user polling

### 5.1 The scaling problem, stated plainly

v1 made **1 request/hour** — roughly 36,000× under the endpoint's effective ceiling. With N users it's **N requests/hour from a single server IP** against an undocumented endpoint. At 5,000 users that's ~1.4 req/sec sustained, forever. If LeetCode rate-limits or IP-bans the server, **every user's tracking breaks simultaneously.** This is the single biggest technical risk in v2.

### 5.2 Staggered polling (required)

**Do not fire all polls at :00.** On signup, assign each user a random `poll_slot` (0–59). The cron runs **every minute** and polls only users whose `poll_slot` matches the current minute. This spreads N users evenly across the hour instead of a thundering herd.

- cron-job.org fires `/api/poll` every minute (still `Authorization: Bearer <CRON_SECRET>`).
- Route selects verified users where `poll_slot = current_minute` AND due per their cadence.
- Poll each; upsert on `(user_id, id)`; log a `poll_runs` row per user.
- Cap the number of users processed per invocation to stay inside Vercel's function timeout. If a slot has more users than the cap, process the most-overdue first — the next tick catches the rest.

### 5.3 Backoff and adaptive cadence

- **On HTTP 429:** stop the run immediately, back off exponentially, do not retry-hammer. A global circuit breaker (pause all polling for N minutes) is preferable to per-user retries.
- **Adaptive cadence:** users with no activity in ~30 days drop to `poll_cadence = 'daily'`. Reactivate to hourly on any new submission. Cuts load substantially since most accounts go dormant.
- The 20-cap tolerance still holds: a user would need >20 accepted submissions between polls to lose data. Hourly is ample; even daily is fine for dormant users.

### 5.4 Hosting implications

Vercel Hobby + Supabase free **will not carry this**, and Hobby prohibits commercial use. Expect: paid Vercel (or a real worker on Railway/Fly, which is where a persistent queue actually earns its keep) plus paid Supabase. Per-minute cron and long-running import jobs both push past free-tier function limits.

## 6. History import (BYO-export)

### 6.1 Principle

The user's browser does the authenticated fetching. Our server only ever receives an **inert JSON file of accepted-submission metadata**. No credentials cross the network.

### 6.2 ⚠️ Blocking prerequisite: capture the query ONCE (Nathan, not users)

**Before any of this can be built,** capture the live authenticated submissions query from DevTools on `leetcode.com` (profile avatar → Submissions → Network tab → filter `graphql` → inspect the request payload). Save it to `scripts/export-snippet/query.graphql`.

Users **never** do this. We embed the captured query in the snippet we hand them.

**The one unresolved question that determines the whole loop shape** — answer it from the captured request's `variables`:

- **Global feed** (no `questionSlug` variable): one paginated query walks every submission. Loop is simple. ✅
- **Per-problem** (requires `questionSlug`): "all submissions" means looping over every solved problem and paginating within each. Substantially more complex, slower, and much heavier on rate limits — the snippet would need to first fetch the user's solved-problem list, then iterate.

Do not write the snippet until this is known. Also record: the response path to the submission array, the `hasNext`/cursor field names, the accepted-status field name and its exact value, and **whether a status-filter variable exists** (if it does, filter accepted server-side — for a heavy user this can cut the payload 5–10×).

### 6.3 The export snippet (what users run)

We ship a finished, copy-paste-ready snippet. Requirements:

- Paginates until exhausted, with a **1500ms sleep between pages** (non-negotiable — this is the only time many requests are made; it protects the user's account from rate-limiting).
- Uses `credentials: 'include'` on same-origin `/graphql` — the cookie is applied by the browser automatically. **The snippet must never read, print, or transmit the cookie itself.**
- Filters to **accepted only** before export (or requests only accepted, per §6.2).
- Logs progress (`fetched N, hasNext=…`) so the user sees it working.
- Triggers a **file download** of `leetcode-history.json` — an array of `{ id, title, titleSlug, timestamp }` (drop every other field; we need nothing else).
- Is short and readable. Users are being asked to paste code into their console — it must be plainly inspectable, with a comment header stating exactly what it does and that it sends nothing anywhere.

### 6.4 Ingest pipeline (server)

`POST /api/import` — authenticated (Supabase session), accepts the JSON file.

1. **Validate.** Enforce a max file size. Reject malformed JSON. Validate shape per record; reject the file if it doesn't look like the expected array.
2. **Re-filter to accepted, server-side.** Never trust an upload — even though the snippet filters, filter again.
3. **Map** to schema: `user_id` = `auth.uid()`, `id`, `title`, `title_slug`, `submitted_at = to_timestamp(timestamp)` (LeetCode gives Unix epoch **seconds**), `source = 'import'`.
4. **Batch upsert** (~500/batch) with `ON CONFLICT (user_id, id) DO NOTHING`.
5. **Enrich** every `title_slug` not already in the global `problems` table via the public `questionData` query. ~1s between calls; hundreds of problems is normal for a multi-year history. Must be **idempotent and independently re-runnable** — this is the step most likely to fail partway. Because `problems` is a shared global cache, users after the first benefit from problems already enriched.
6. **Track progress** in `import_jobs` and surface it in the UI (§7, step 5). A multi-year import is not instant — do not block the request on enrichment; return once rows are inserted and enrich asynchronously.

**Idempotency:** import and the live poller both dedupe on `(user_id, id)`. They can run in any order, simultaneously, and repeatedly. Re-uploading the same file inserts zero rows.

## 7. Onboarding UX — step-by-step

The import is a real ask (paste a script into a browser console). Onboarding must make it feel safe, easy, and clearly worth it. **Never present it as a blocker** — the app works without it; the import just makes it good immediately.

### 7.1 Flow

**Step 1 — Sign up.** Supabase Auth.

**Step 2 — Connect LeetCode username.** Enter username. Show the verification token; instruct the user to paste it into their LeetCode profile bio, then click Verify (§4.2). Confirm success and tell them they can remove it.

**Step 3 — "You're tracking!"** Confirm forward tracking is live: *"We'll check hourly for new solved problems. Nothing else to do."* Show their most recent 20 solves, already pulled — immediate payoff, zero effort.

**Step 4 — Offer the history import (the key screen).** Frame it honestly:

> **Want your full history?**
> LeetCode's public API only exposes your last 20 solves. To see your full timeline, heatmap, and — the whole point — which problems you've *re-solved*, you can export your history yourself. Takes about two minutes.
>
> 🔒 **We never see your password or session.** The export runs entirely in your own browser. You send us a plain file of your solved-problem history — nothing else. [How this works ▾]

With: **[ Import my history ]** and **[ Skip for now ]** (always available later from settings).

**Step 5 — The import walkthrough.** A dedicated page. Numbered, one action per step, with a screenshot or short looping GIF for each:

> **1. Open LeetCode and make sure you're logged in.**
> Open [leetcode.com](https://leetcode.com) in a new tab. You must be signed in for this to work.
>
> **2. Open your browser console.**
> Press **F12** (Windows/Linux) or **⌘ + ⌥ + I** (Mac), then click the **Console** tab.
> *If you see a red warning about pasting code — that's normal. It appears for everyone. Read our script below before pasting; it only reads your own submission list.*
> *(Some browsers require you to type `allow pasting` first.)*
>
> **3. Copy our export script.** [ 📋 Copy script ]
> [ View the script ▾ ] ← expandable, showing the full readable source, with a plain-English comment header
>
> **4. Paste it into the console and press Enter.**
> You'll see progress messages like `fetched 240, hasNext=true`. **Leave the tab open** — a long history can take a few minutes. It's paced deliberately so LeetCode doesn't rate-limit you.
>
> **5. Your file downloads automatically.**
> When it finishes, `leetcode-history.json` saves to your Downloads folder.
>
> **6. Upload it here.** [ drag-and-drop zone ]
>
> **7. Done.** We'll parse it and build your timeline. Fetching problem details (difficulty, tags) takes another minute or two — you can leave this page; we'll keep working.

**Step 6 — Import progress + result.** Live status from `import_jobs`: parsing → importing → enriching → done. Then a completion summary with a hook back to the product:

> ✅ Imported **1,247 solves** across **384 problems**, back to **March 2023**.
> Your most re-solved problem: **#1 · Two Sum** — solved **7 times**.
> [ See my timeline → ]

### 7.2 Content requirements

- **A "How this works / Is this safe?" explainer**, linked from every mention of the import. Must state plainly: the script runs in *your* browser; it uses your existing LeetCode login; it never reads your password or session cookie; it sends nothing anywhere; the only thing that reaches our servers is the file *you* choose to upload; here's the full source, read it.
- **The script must be viewable in full before copying.** Non-negotiable trust requirement. Anyone asking users to paste console code owes them plain, readable source.
- **Troubleshooting section:** not logged in; console paste-protection warning; script errors out (usually rate-limiting — wait 10 minutes, re-run); empty file (LeetCode may not retain older history for all accounts); upload rejected.
- **Set expectations on retention.** Some accounts appear to have history going back years; others report seeing only a few months. Whatever the export returns is what LeetCode retained — we can't recover what they've aged out. Say this up front so a short export doesn't read as a bug.

## 8. Legal / ToS posture — read before shipping publicly

Every prior doc said *personal use only; do not scale to many users, do not share publicly, do not monetize.* Hosting this publicly deliberately crosses that line, so do it with clear eyes:

- The endpoints are **undocumented and unofficial**. They can change or break without notice — and would break for all users at once.
- LeetCode's Terms restrict automated access. A public, attributable service is a materially larger target than a private script. Comparable LeetCode-stats sites exist and mostly survive; this is a real but not hypothetical-doom risk.
- Recommended posture: **keep it free and non-commercial**, don't advertise the scraping, respond to any request from LeetCode promptly, and design so the service degrades gracefully rather than dying if the endpoint changes.
- **Have a "LeetCode blocked us" plan:** the DB is ours, so the historical data survives. Forward polling is what breaks. Communicate honestly to users if it does.

## 9. Build order

1. Capture the authenticated query (§6.2) — **blocking; answers the global-vs-per-problem question.**
2. Supabase Auth + `profiles` + username verification (§4.2).
3. Schema migration to per-user tables + RLS (§4.3).
4. Rework the poller: iterate verified users, staggered by `poll_slot`, per-user `poll_runs` (§5.2). Switch cron-job.org to per-minute.
5. Build the export snippet from the captured query (§6.3).
6. `/api/import`: validate → filter → upsert → async enrich, with `import_jobs` tracking (§6.4).
7. Onboarding flow + import walkthrough + safety explainer (§7).
8. Backoff, circuit breaker, adaptive cadence (§5.3).
9. Hosting upgrade (§5.4).

## 10. Acceptance criteria

- A new user signs up, verifies their LeetCode username, and sees their recent 20 solves without any further action.
- An unverified user is never polled; one user cannot see another's data (RLS enforced, verified by test).
- The export snippet runs in a logged-in LeetCode tab and downloads a JSON file of accepted submissions only. **It never reads or transmits the session cookie** — verifiable by reading the source.
- Uploading that file populates the user's timeline, heatmap, and repeats views with **correct historical `submitted_at` dates**, including repeats that predate signup.
- Re-uploading the same file inserts zero new rows. Import and poller running concurrently produce no duplicates.
- Poll requests are spread across the hour, not bunched at :00.
- A 429 from LeetCode triggers backoff, not a retry storm.
- No session cookie appears anywhere in the codebase, database, logs, or network traffic to our servers.
