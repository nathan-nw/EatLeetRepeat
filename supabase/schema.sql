-- Eat Leet Repeat — database schema
--
-- Apply this in the Supabase SQL editor (or `psql`) once per project. It is
-- idempotent: re-running it makes no destructive changes.
--
-- MULTI-TENANT. Each app user authenticates via Supabase Auth and registers
-- their own LeetCode handle (stored in `profiles`, not an env var). The poller
-- loops over every profile and records that user's accepted submissions.
-- Problem metadata (`problems`) is shared/global across users.
--
-- Access model: RLS is enabled on every table WITH policies that scope each
-- user to their own rows (`auth.uid()`). The poller writes via the Supabase
-- *service-role* key, which bypasses RLS entirely. The public anon key can only
-- read a signed-in user's own data through the policies below.

-- ---------------------------------------------------------------------------
-- profiles — one row per authenticated app user, 1:1 with auth.users.
-- Holds the tracked LeetCode handle. A handle can only be claimed by one
-- account so the poller never double-polls the same LeetCode user.
-- ---------------------------------------------------------------------------
create table if not exists profiles (
  id                uuid primary key references auth.users (id) on delete cascade,
  leetcode_username text not null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create unique index if not exists profiles_leetcode_username_key
  on profiles (lower(leetcode_username));

-- ---------------------------------------------------------------------------
-- submissions — one row per unique accepted submission, scoped to a user.
-- Dedup on the LeetCode submission `id` (globally unique on LeetCode). A
-- re-solve produces a new `id` + `timestamp`, so it lands as an additional row
-- rather than colliding with the prior solve (rule #3). `user_id` owns the row
-- for RLS + per-user queries; upsert with ON CONFLICT (user_id, id) DO NOTHING.
-- ---------------------------------------------------------------------------
create table if not exists submissions (
  id            text not null,                          -- LeetCode submission id
  user_id       uuid not null references profiles (id) on delete cascade,
  title         text not null,
  title_slug    text not null,
  submitted_at  timestamptz not null,                   -- from LeetCode `timestamp` (unix seconds)
  first_seen_at timestamptz not null default now(),     -- when our poller first recorded it
  primary key (user_id, id)
);

create index if not exists submissions_user_slug_idx on submissions (user_id, title_slug);
create index if not exists submissions_user_time_idx on submissions (user_id, submitted_at desc);

-- ---------------------------------------------------------------------------
-- problems — cached problem metadata, GLOBAL (shared across all users).
-- Populated best-effort from the `questionData` query for slugs we haven't seen
-- before (rule #6). `frontend_id` + `title` drive the `#{id} · {title}` display
-- used everywhere in the UI (rule #7). Not user-scoped: problem #1 is the same
-- for everyone, so enrichment is done once and reused.
-- ---------------------------------------------------------------------------
create table if not exists problems (
  title_slug  text primary key,
  frontend_id text,
  title       text not null,
  difficulty  text,                                     -- Easy | Medium | Hard
  topic_tags  text[],
  updated_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- poll_runs — poller health / observability. Every per-user poll writes one row
-- so we can confirm the poller is alive and see fetched/new counts (rule #12).
-- `user_id` is null for a whole-run/global error (e.g. before any user is
-- resolved).
-- ---------------------------------------------------------------------------
create table if not exists poll_runs (
  id            bigserial primary key,
  user_id       uuid references profiles (id) on delete cascade,
  ran_at        timestamptz not null default now(),
  fetched_count int not null,
  new_count     int not null,
  status        text not null,                          -- success | error
  error         text
);

create index if not exists poll_runs_user_time_idx on poll_runs (user_id, ran_at desc);

-- ---------------------------------------------------------------------------
-- Row Level Security — enabled on all tables, with per-user policies.
-- Each user reads only their own rows; problem metadata is readable by any
-- signed-in user. All writes go through the service role, which bypasses RLS
-- (so no INSERT/UPDATE/DELETE policies are granted to anon/authenticated).
-- `create policy` is not idempotent, so each is dropped first.
-- ---------------------------------------------------------------------------
alter table profiles    enable row level security;
alter table submissions enable row level security;
alter table problems    enable row level security;
alter table poll_runs   enable row level security;

-- profiles: a user sees and edits only their own profile row.
drop policy if exists profiles_select_own on profiles;
create policy profiles_select_own on profiles
  for select using (auth.uid() = id);

drop policy if exists profiles_insert_own on profiles;
create policy profiles_insert_own on profiles
  for insert with check (auth.uid() = id);

drop policy if exists profiles_update_own on profiles;
create policy profiles_update_own on profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

-- submissions: read-only to the owner. Writes only via service role (poller).
drop policy if exists submissions_select_own on submissions;
create policy submissions_select_own on submissions
  for select using (auth.uid() = user_id);

-- poll_runs: owner can read their own run history.
drop policy if exists poll_runs_select_own on poll_runs;
create policy poll_runs_select_own on poll_runs
  for select using (auth.uid() = user_id);

-- problems: shared metadata, readable by any authenticated user.
drop policy if exists problems_select_all on problems;
create policy problems_select_all on problems
  for select to authenticated using (true);
