# Eat Leet Repeat

A personal LeetCode activity tracker. A scheduled poller pulls the tracked user's recent accepted
submissions from LeetCode's public GraphQL endpoint into our own Postgres (the source of truth),
and the UI shows activity over time — with emphasis on **re-solves**. Single user, no login, no
manual logging.

- **Full spec:** [`docs/eat-leet-repeat-PRD.md`](docs/eat-leet-repeat-PRD.md)
- **Working guide (stack, structure, rules):** [`CLAUDE.md`](CLAUDE.md)

## Stack

Next.js (App Router, TypeScript) · Tailwind CSS · Recharts · Supabase (Postgres) · Vercel
(hosting) · cron-job.org (hourly scheduler that hits `/api/poll`).

## Getting started

```bash
cp .env.example .env.local   # then fill in real values
npm run dev                  # local dev at http://localhost:3000
npm run build                # production build
npm run start                # run the production build locally
npm run lint                 # lint
```

## Environment variables

| Var | Where | Purpose |
|-----|-------|---------|
| `LEETCODE_USERNAME` | server | The single tracked user's public LeetCode handle |
| `CRON_SECRET` | server + cron-job.org header | Protects `/api/poll`. Random, ≥16 chars |
| `NEXT_PUBLIC_SUPABASE_URL` | client/server | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | **server only** | DB writes/reads from the poller and server components |

The service-role key must never reach the client bundle — all DB access goes through server code.

## Scheduling

Hourly polling is driven by **cron-job.org** (external), not Vercel cron — Vercel Hobby caps cron
at once/day, so there is deliberately **no `crons` block** in `vercel.json`. See PRD §8.
