# Eat Leet Repeat

A hosted, **multi-user** LeetCode activity tracker with an emphasis on **re-solves**. You sign in,
register your public LeetCode handle once, and a scheduled poller pulls every registered user's
recent accepted submissions from LeetCode's public GraphQL endpoint into our own Postgres — the
source of truth. The UI then shows each user their own activity over time. No manual logging, no
LeetCode credentials.

The core question the app answers: *which problems have I actually solved more than once, and when?*
Every re-solve is recorded as a distinct event rather than collapsed into "already done."

- **Full spec & rationale:** [`docs/eat-leet-repeat-PRD.md`](docs/eat-leet-repeat-PRD.md)
- **Working guide (stack, structure, project rules):** [`CLAUDE.md`](CLAUDE.md)

## How it works

```
               every 30m
 cron-job.org ──────────▶ GET /api/poll  ──▶  lib/poller.ts
 (Bearer CRON_SECRET)     (secret-gated)       │
                                               │  for each profile (staggered):
                                               ▼
                        LeetCode public GraphQL ──▶ recent 20 accepted subs + problem metadata
                                               │
                                               ▼
                                        Supabase Postgres  ◀── source of truth
                                               ▲
                          RLS-scoped reads     │  service-role writes
                                               │
 signed-in user ──▶ Next.js App Router UI ─────┘  (only ever reads our DB, never LeetCode)
```

- **The poller** (`/api/poll` → `lib/poller.ts`) loops over every `profiles` row, fetches that
  user's recent accepted submissions, and upserts the new ones. It's **idempotent and self-healing**:
  re-running changes nothing, and a missed run is recovered on the next tick. One user's failure
  (bad handle, timeout, 429) is logged to that user's `poll_runs` and never aborts the others.
- **Dedup is on the submission `id` within a user**, never on the problem. A re-solve produces a new
  `id` + `timestamp`, so it lands as a *new* row — that's the whole point of the app.
- **Problem metadata** (difficulty, tags, frontend id) is enriched best-effort from a separate
  `questionData` query, into a shared global `problems` table. Enrichment never blocks a submission
  insert.
- **The browser never talks to LeetCode.** All `leetcode.com/graphql` traffic is server-side; the UI
  reads only from Postgres.

## Stack

- **Next.js** (App Router, TypeScript) — the UI *and* the poller route, one app
- **Supabase** — Postgres **and** Auth (`@supabase/ssr` for App Router sessions; magic-link sign-in)
- **Tailwind CSS** — styling
- Hand-rolled SVG/Tailwind timeline & heatmap components (no charting dependency)
- **Vercel** (Hobby) — hosting
- **cron-job.org** — external scheduler (every 30 min) that hits `/api/poll`

## Views

All views are gated behind auth + onboarding and show **only the signed-in user's** data.

| Route | What it shows |
|-------|---------------|
| `/` (Dashboard) | Summary stats, activity timeline, and a contribution-style heatmap, with difficulty / tag / date filters |
| `/repeats` | Problems solved more than once, with each re-solve as a distinct event |
| `/problems/[slug]` | Full per-problem solve history |
| `/settings` | Update your registered LeetCode handle |
| `/login`, `/onboarding` | Magic-link sign-in and first-run handle registration |

## Getting started

```bash
cp .env.example .env.local   # then fill in real values (see below)
npm install
npm run dev                  # local dev at http://localhost:3000
```

Before the app is usable you also need to:

1. **Create a Supabase project** and apply the schema in
   [`supabase/schema.sql`](supabase/schema.sql) (Supabase SQL editor or `psql`). It creates the
   `profiles`, `submissions`, `problems`, and `poll_runs` tables and enables per-user RLS. It's
   idempotent — safe to re-run.
2. **Enable email (magic-link) auth** in Supabase → Authentication.
3. Fill in the environment variables below.

Then sign in, register your LeetCode handle at onboarding, and either wait for the scheduler or
trigger a poll manually (below).

### Other commands

```bash
npm run build   # production build
npm run start   # run the production build locally
npm run lint    # lint
```

## Environment variables

Copy [`.env.example`](.env.example) to `.env.local` and fill in real values. Never commit
`.env.local`, and never ship the service-role key to the client bundle — all privileged DB access
goes through server code.

| Var | Where | Purpose |
|-----|-------|---------|
| `CRON_SECRET` | server + cron-job.org header | Protects `/api/poll`. Random string, ≥16 chars |
| `NEXT_PUBLIC_SUPABASE_URL` | client + server | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | client + server | Supabase Auth + RLS-scoped client reads |
| `SUPABASE_SERVICE_ROLE_KEY` | **server only** | Poller writes + service-role reads. Bypasses RLS |

There is **no `LEETCODE_USERNAME`** — each user's handle lives in `profiles.leetcode_username`,
set at onboarding.

## Running the poller

The endpoint is public, so it rejects any request without the correct bearer secret (401):

```bash
curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/poll
```

A successful run returns a JSON summary (`users`, `fetched`, `inserted`, `errors`, `rateLimited`)
and writes one `poll_runs` row per user for observability.

## Scheduling

Polling is driven by **cron-job.org** (external), which sends
`Authorization: Bearer <CRON_SECRET>` to `/api/poll` every 30 minutes. This is deliberate: Vercel Hobby
caps cron at once/day, so there is **no `crons` block** in `vercel.json` (adding one fails at
deploy). See PRD §8 and `CLAUDE.md` rule #9.

## Security & data model notes

- **Per-user isolation.** Every UI read is scoped server-side to the signed-in user's id, with
  Supabase RLS as a backstop. A cross-user data leak is treated as a P0.
- **Accepted submissions only, public data only.** The app never touches LeetCode's authenticated
  endpoints and never stores users' LeetCode session cookies. It does use our own Supabase Auth
  (that's required to sign in).
- **Polite, low-volume polling.** One request per user per run (every 30 min), staggered within a run, with a
  sane `User-Agent` and back-off on HTTP 429. The endpoint is unofficial — see PRD §10 for the
  accepted ToS risk of hosting this publicly.
