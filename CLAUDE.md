# CLAUDE.md — Eat Leet Repeat

Working guide for Claude Code. The **what** lives in `docs/eat-leet-repeat-PRD.md` (read it first); this file is the **how** — stack, structure, commands, and the project-specific rules that are easy to get wrong.

## What this is

A personal LeetCode activity tracker. A scheduled poller pulls the user's recent accepted submissions from LeetCode's public GraphQL endpoint and persists them to our own Postgres, which is the source of truth. The UI shows activity over time, with emphasis on **re-solves**. Single user, no login, no manual logging. Full spec + rationale in the PRD.

## Stack (do not swap without asking)

- **Next.js** (App Router, TypeScript) — frontend **and** the poller route, one app.
- **Vercel** (Hobby / free) — hosting.
- **Supabase** (free) — Postgres.
- **Tailwind CSS** — styling.
- **Recharts** — charts.
- **cron-job.org** (free) — hourly scheduler that hits `/api/poll`.

## Repo layout (target)

```
app/
  api/poll/route.ts     # the poller — cron-job.org's target. Auth-gated.
  page.tsx              # dashboard
  ...                   # timeline / repeats / problem views
lib/
  leetcode.ts           # GraphQL client + queries (recentAcSubmissionList, questionData)
  poller.ts             # poll logic (fetch → upsert → enrich → log). Called by the route.
  db.ts                 # Supabase server client (service role)
components/
supabase/
  schema.sql            # tables from PRD §7
docs/
  eat-leet-repeat-PRD.md
vercel.json             # NO cron block here (see rules)
```

## Environment variables

| Var | Where | Purpose |
|-----|-------|---------|
| `LEETCODE_USERNAME` | server | The single tracked user's public LeetCode handle |
| `CRON_SECRET` | server + cron-job.org header | Protects `/api/poll`. Random, ≥16 chars |
| `NEXT_PUBLIC_SUPABASE_URL` | client/server | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | **server only** | DB writes/reads from the poller and server components |

Never ship the service-role key to the client bundle. All DB access goes through server code.

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

1. **Never call LeetCode from the client.** Only the poller (`/api/poll` → `lib/poller.ts`) talks to `leetcode.com/graphql`. The UI reads only from our Postgres.
2. **`/api/poll` must reject unauthenticated requests.** Check `Authorization: Bearer <CRON_SECRET>` before doing anything; 401 otherwise. The URL is public.
3. **Dedup on submission `id`, never on `title_slug`.** Upsert with `ON CONFLICT (id) DO NOTHING`. A re-solve has a new `id` + `timestamp` and **must** become a new `submissions` row — that's the whole point of the app. Do not "dedupe by problem."
4. **Poller is idempotent and self-healing.** Re-running changes nothing; a missed run is recovered next tick. Don't add stateful cursors or "last seen" offsets that would break this.
5. **Timestamps:** LeetCode `timestamp` is Unix epoch **seconds** (string). Convert to `timestamptz` (`to_timestamp(...)`).
6. **Enrichment is best-effort.** Difficulty/tags come from a *separate* `questionData` query, only for `title_slug`s not already in `problems`. If it fails, still record the submission and backfill later. Never block a submission insert on enrichment.
7. **Display problems as `#{frontend_id} · {title}`** everywhere (e.g. `#1 · Two Sum`).
8. **Accepted-only.** v1 does not track failed attempts. Do not add auth/session-cookie logic or the `submissionList` endpoint — that's v2 (PRD §11).
9. **No Vercel cron.** Do **not** add a `crons` block to `vercel.json`. Vercel Hobby caps cron at once/day (hourly fails at deploy); scheduling is cron-job.org's job by design.
10. **Rate-limit hygiene:** one request/hour, sane `User-Agent`, `Content-Type: application/json`, back off on HTTP 429 and skip the run rather than retrying hard. Personal use only — don't build anything that scales this to many users or shares it publicly (unofficial endpoint, ToS gray area).
11. **Supabase RLS on.** Writes via service role (server). Don't expose write access to the client.
12. **Observability:** every poll writes a `poll_runs` row (`fetched_count`, `new_count`, `status`, `error`). Keep this — it's how we know the poller is alive.

## Out of scope for v1 (don't gold-plate)

Historical backfill, failed attempts, multi-user/auth, streak/summary reports beyond the basic count stats. These are noted in PRD §11 as v2. Ship the core loop first: poll → store → the four views (timeline, heatmap, repeats, per-problem history) + summary stats + filters.

## Definition of done

See PRD §14. In short: real submissions land in Postgres with correct timestamps; a re-solve shows as a distinct event in the repeats + per-problem views; timeline, heatmap, and repeats all render and respect the difficulty/tag/date filters; `poll_runs` shows healthy hourly runs.