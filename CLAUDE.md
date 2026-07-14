# CLAUDE.md — Eat Leet Repeat

Working guide for Claude Code. The **what** lives in `docs/eat-leet-repeat-PRD.md` (read it first); this file is the **how** — stack, structure, commands, and the project-specific rules that are easy to get wrong.

## What this is

A hosted, **multi-user** LeetCode activity tracker. Each user signs in (Supabase Auth) and registers their public LeetCode handle once; a scheduled poller then pulls **every registered user's** recent accepted submissions from LeetCode's public GraphQL endpoint and persists them to our own Postgres, which is the source of truth. The UI shows each user their own activity over time, with emphasis on **re-solves**. No manual logging. Full spec + rationale in the PRD.

## Stack (do not swap without asking)

- **Next.js** (App Router, TypeScript) — frontend **and** the poller route, one app.
- **Vercel** (Hobby / free) — hosting.
- **Supabase** (free) — Postgres **and Auth** (`@supabase/ssr` for App Router sessions).
- **Tailwind CSS** — styling.
- **Recharts** — charts.
- **cron-job.org** (free) — hourly scheduler that hits `/api/poll`.

## Repo layout (target)

```
app/
  api/poll/route.ts     # the poller — cron-job.org's target. Secret-gated.
  login/                # sign-in (Supabase Auth)
  onboarding/           # first-run: enter your LeetCode handle → profiles row
  page.tsx              # dashboard (per signed-in user)
  ...                   # timeline / repeats / problem views, settings
lib/
  leetcode.ts           # GraphQL client + queries (recentAcSubmissionList, questionData)
  poller.ts             # poll logic: loop all users → fetch → upsert → enrich → log
  db.ts                 # Supabase server client (service role) — poller writes
  supabase/             # @supabase/ssr browser + server (session) clients for the UI
components/
supabase/
  schema.sql            # tables + RLS policies from PRD §7
docs/
  eat-leet-repeat-PRD.md
vercel.json             # NO cron block here (see rules)
```

## Environment variables

| Var | Where | Purpose |
|-----|-------|---------|
| `CRON_SECRET` | server + cron-job.org header | Protects `/api/poll`. Random, ≥16 chars |
| `NEXT_PUBLIC_SUPABASE_URL` | client/server | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | client/server | Supabase Auth + RLS-scoped client reads |
| `SUPABASE_SERVICE_ROLE_KEY` | **server only** | Poller writes + service-role reads. Bypasses RLS |

There is **no** `LEETCODE_USERNAME` env var — each user's handle lives in `profiles.leetcode_username` (DB), set at onboarding. Never ship the service-role key to the client bundle; all privileged DB access goes through server code.

## Commands

```bash
npm run dev      # local dev
npm run build    # production build
npm run lint     # lint
npm run start    # run production build locally
```

To exercise the poller locally, call the route with the secret:
```bash
curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/poll
```

## Project rules (the easy-to-break ones)

1. **Never call LeetCode from the browser.** All `leetcode.com/graphql` traffic is server-side, through `lib/leetcode.ts`. The two sanctioned callers are the poller (`/api/poll` → `lib/poller.ts`) and the onboarding handle-validation probe (a server action). The UI reads data only from our Postgres — never LeetCode.
2. **`/api/poll` must reject unauthenticated requests.** Check `Authorization: Bearer <CRON_SECRET>` before doing anything; 401 otherwise. The URL is public. (This is the *cron* secret — separate from Supabase user auth.)
3. **Dedup on submission `id` within a user, never on `title_slug`.** Upsert with `ON CONFLICT (user_id, id) DO NOTHING`. A re-solve has a new `id` + `timestamp` and **must** become a new `submissions` row — that's the whole point of the app. Do not "dedupe by problem." Every `submissions` row carries the owning `user_id`.
4. **Poller is idempotent, self-healing, and loops all users.** Re-running changes nothing; a missed run is recovered next tick. The poll route loads every `profiles` row and polls each user's handle; **one user's failure (bad handle, 429, timeout) must not abort the others** — log it to that user's `poll_runs` and continue. Don't add stateful cursors or "last seen" offsets that would break idempotency.
5. **Timestamps:** LeetCode `timestamp` is Unix epoch **seconds** (string). Convert to `timestamptz` (`to_timestamp(...)`).
6. **Enrichment is best-effort.** Difficulty/tags come from a *separate* `questionData` query, only for `title_slug`s not already in `problems`. If it fails, still record the submission and backfill later. Never block a submission insert on enrichment.
7. **Display problems as `#{frontend_id} · {title}`** everywhere (e.g. `#1 · Two Sum`).
8. **Accepted-only; app-auth yes, LeetCode-auth no.** The app never tracks failed attempts. The authenticated LeetCode endpoint is **never called by our servers** — it is called only by the client-side export snippet (`lib/export-snippet.ts`), running in the user's own browser, on their own action, for the history import (v2 spec §6). No session cookie is ever transmitted to, stored by, or logged by our backend. This is distinct from our own **Supabase Auth**, which is required (users sign in to see their data); "no session-cookie logic" means *LeetCode's* cookie, not our app session.
9. **No Vercel cron.** Do **not** add a `crons` block to `vercel.json`. Vercel Hobby caps cron at once/day (hourly fails at deploy); scheduling is cron-job.org's job by design.
10. **Rate-limit hygiene (now multi-user):** one request per user per hour, **staggered** within the run; sane `User-Agent`, `Content-Type: application/json`; back off on HTTP 429 and skip that user's run rather than retrying hard. The endpoint is unofficial and hosting this publicly/multi-user is an accepted ToS risk (PRD §10) — keep volume low and polite; read only **public** data; never handle users' LeetCode credentials.
11. **Supabase RLS on, with per-user policies.** Each user reads only their own `profiles`/`submissions`/`poll_runs` (`auth.uid() = user_id`); `problems` is readable by any authenticated user. All writes go through the **service role** (poller), which bypasses RLS. Don't grant client-facing write access.
12. **Per-user data isolation.** Every read in the UI is scoped to the signed-in user's id (server-side), with RLS as backstop. A user must never see another user's submissions — treat any cross-user leak as a P0.
13. **Observability:** every per-user poll writes a `poll_runs` row (`user_id`, `fetched_count`, `new_count`, `status`, `error`). Keep this — it's how we know the poller is alive per user.

## Out of scope (don't gold-plate)

Historical backfill, failed attempts, LeetCode session-cookie flows, social/sharing, and streak/summary reports beyond the basic count stats. These are noted in PRD §11. Auth is **in** scope (Supabase Auth + onboarding) — but keep it minimal (email + password with a one-time email confirmation on signup, plus a password-reset flow; a single handle field). Ship the core loop first: sign in → set handle → poll (all users) → store → the four views (timeline, heatmap, repeats, per-problem history) + summary stats + filters.

## Definition of done

See PRD §14. In short: a user can sign in and register their LeetCode handle; the poller processes all users each hour (one user's failure doesn't stop the rest); their real submissions land in Postgres with correct timestamps; a re-solve shows as a distinct event in that user's repeats + per-problem views; timeline, heatmap, and repeats all render, show **only that user's** data (no cross-user leak), and respect the difficulty/tag/date filters; `poll_runs` shows healthy per-user hourly runs.