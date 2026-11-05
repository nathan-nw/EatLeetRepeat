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

-- v2 additions (idempotent). See eat-leet-repeat-v2-multiuser-and-import.md §4.3.
--  * poll_slot: which minute of the hour (0-59) we poll this user, so N users are
--    spread evenly across the hour instead of thundering at :00 (§5.2). Assigned a
--    random value at onboarding; existing rows are backfilled below.
--  * last_polled_at / poll_cadence: adaptive cadence (§5.3). Dormant users drop to
--    'daily'; any new submission reactivates them to 'hourly'.
--  * verify_token / leetcode_verified_at: OPTIONAL ownership verification (§4.2).
--    Nothing gates on these — forward tracking works for everyone unverified; import
--    self-proves ownership. Present so the optional flow can stamp them later.
-- poll_slot defaults to a random minute so any insert (incl. the pre-v2 onboarding
-- path) always gets a slot; onboarding also sets it explicitly.
alter table profiles add column if not exists poll_slot            smallint default (floor(random() * 60))::smallint;
alter table profiles add column if not exists last_polled_at       timestamptz;
alter table profiles add column if not exists poll_cadence         text not null default 'hourly';
alter table profiles add column if not exists verify_token         text;
alter table profiles add column if not exists leetcode_verified_at timestamptz;

-- has_password: whether this user has set an email/password credential. Users
-- created via the legacy magic-link flow have none (default false), so the
-- settings "change password" form lets them set one WITHOUT a current-password
-- check. Once a password is set (signup, reset, or the settings form) this flips
-- true and future changes require confirming the current password. Supabase does
-- not expose a "has password" flag to the client, so we track it ourselves.
alter table profiles add column if not exists has_password boolean not null default false;

-- Backfill a poll_slot for any pre-v2 row that predates the column, then make it
-- required so every future insert must carry one (onboarding sets it).
update profiles set poll_slot = floor(random() * 60)::smallint where poll_slot is null;
alter table profiles alter column poll_slot set not null;

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

-- v2: where the row came from. 'poll' = scheduled public-endpoint poller (default),
-- 'import' = the user's own history upload (§6). The dedup key stays (user_id, id),
-- so poller and import share it: re-uploads and concurrent runs insert zero dupes.
alter table submissions add column if not exists source text not null default 'poll';

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
-- import_jobs — one row per history-import upload, per user (§6.4). Tracks the
-- pipeline (parsing → importing → enriching → done|error) and counts so the UI
-- can show live progress and a completion summary. Owned by a user (RLS); written
-- only by the /api/import route via the service role.
-- ---------------------------------------------------------------------------
create table if not exists import_jobs (
  id            bigserial primary key,
  user_id       uuid not null references profiles (id) on delete cascade,
  started_at    timestamptz not null default now(),
  finished_at   timestamptz,
  status        text not null,             -- pending | parsing | importing | enriching | done | error
  rows_received int,
  rows_accepted int,
  rows_inserted int,
  rows_skipped  int,
  error         text
);

create index if not exists import_jobs_user_time_idx on import_jobs (user_id, started_at desc);

-- ---------------------------------------------------------------------------
-- poller_state — a single global row backing the 429 circuit breaker (§5.3).
-- Serverless invocations share no memory, so a rate-limit pause must live in the
-- DB: on HTTP 429 the poller stamps `paused_until` a few minutes out and every
-- invocation no-ops until then. Service-role only; never exposed to clients.
-- ---------------------------------------------------------------------------
create table if not exists poller_state (
  id           smallint primary key default 1,
  paused_until timestamptz,
  updated_at   timestamptz not null default now(),
  constraint poller_state_singleton check (id = 1)
);

insert into poller_state (id) values (1) on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Row Level Security — enabled on all tables, with per-user policies.
-- Each user reads only their own rows; problem metadata is readable by any
-- signed-in user. All writes go through the service role, which bypasses RLS
-- (so no INSERT/UPDATE/DELETE policies are granted to anon/authenticated).
-- `create policy` is not idempotent, so each is dropped first.
-- ---------------------------------------------------------------------------
alter table profiles     enable row level security;
alter table submissions  enable row level security;
alter table problems     enable row level security;
alter table poll_runs    enable row level security;
alter table import_jobs  enable row level security;
alter table poller_state enable row level security;  -- no policies: service-role only

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

-- import_jobs: owner can read their own import history (drives the progress UI).
-- Writes go through the service role, so no insert/update policy is granted.
drop policy if exists import_jobs_select_own on import_jobs;
create policy import_jobs_select_own on import_jobs
  for select using (auth.uid() = user_id);

-- problems: shared metadata, readable by any authenticated user.
drop policy if exists problems_select_all on problems;
create policy problems_select_all on problems
  for select to authenticated using (true);
-- Private teams. All access is through narrow, authenticated RPCs. Existing
-- personal-table RLS is deliberately unchanged.
create table if not exists public.teams (
  id uuid primary key default gen_random_uuid(),
  name text not null check (name = btrim(name) and char_length(name) between 1 and 80),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  invite_token_hash text not null unique check (invite_token_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.team_members (
  team_id uuid not null references public.teams(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (team_id, user_id)
);
create index if not exists team_members_user_idx on public.team_members(user_id, team_id);
-- The owner must always be a member, including under concurrent mutations.
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'teams_owner_member' and conrelid = 'public.teams'::regclass) then
    alter table public.teams add constraint teams_owner_member
      foreign key (id, owner_id) references public.team_members(team_id, user_id)
      deferrable initially deferred;
  end if;
end $$;
alter table public.teams enable row level security;
alter table public.team_members enable row level security;
revoke all on public.teams, public.team_members from anon, authenticated;

create or replace function public.team_list() returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  return coalesce((select jsonb_agg(x order by lower(x->>'name'), x->>'id') from (
    select jsonb_build_object('id', t.id, 'name', t.name, 'ownerId', t.owner_id,
      'memberCount', (select count(*) from public.team_members m where m.team_id = t.id)) x
    from public.teams t join public.team_members mine on mine.team_id = t.id
    where mine.user_id = auth.uid()
  ) q), '[]'::jsonb);
end $$;

-- Invites reveal only the team name to a signed-in user holding the token.
create or replace function public.team_preview(p_hash text) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  return (select jsonb_build_object('name', name) from public.teams where invite_token_hash = p_hash);
end $$;

create or replace function public.team_manage(
  p_action text, p_team uuid default null, p_name text default null,
  p_hash text default null, p_target uuid default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  team public.teams;
begin
  if actor is null or not exists (select 1 from public.profiles where id = actor) then
    raise exception 'Complete onboarding first';
  end if;
  if p_action = 'create' then
    insert into public.teams(name, owner_id, invite_token_hash)
      values (btrim(p_name), actor, p_hash) returning * into team;
    insert into public.team_members(team_id, user_id) values (team.id, actor);
    return team.id;
  end if;
  -- Every membership/owner mutation takes this same lock. Joining rechecks the
  -- hash after waiting, so a concurrently reset link cannot admit a new member.
  if p_action = 'join' then
    select * into team from public.teams where invite_token_hash = p_hash for update;
  else
    select * into team from public.teams where id = p_team for update;
  end if;
  if team.id is null then raise exception 'Team or invitation unavailable'; end if;
  if p_action = 'join' then
    if exists (select 1 from public.team_members where team_id = team.id and user_id = actor) then
      return team.id;
    end if;
    if (select count(*) from public.team_members where team_id = team.id) >= 20 then
      raise exception 'This team is full (20 members)';
    end if;
    insert into public.team_members(team_id, user_id) values (team.id, actor);
    return team.id;
  end if;
  if not exists (select 1 from public.team_members where team_id = team.id and user_id = actor) then
    raise exception 'Team unavailable';
  end if;
  if p_action = 'leave' then
    if team.owner_id = actor then raise exception 'Transfer ownership or delete the team before leaving'; end if;
    delete from public.team_members where team_id = team.id and user_id = actor;
    return team.id;
  end if;
  if team.owner_id <> actor then raise exception 'Only the owner can do this'; end if;
  case p_action
    when 'rename' then update public.teams set name = btrim(p_name), updated_at = now() where id = team.id;
    when 'reset' then update public.teams set invite_token_hash = p_hash, updated_at = now() where id = team.id;
    when 'remove', 'remove_reset' then
      if p_target = actor then raise exception 'The owner cannot be removed'; end if;
      delete from public.team_members where team_id = team.id and user_id = p_target;
      if p_action = 'remove_reset' then
        update public.teams set invite_token_hash = p_hash, updated_at = now() where id = team.id;
      end if;
    when 'transfer' then
      if not exists (select 1 from public.team_members where team_id = team.id and user_id = p_target) then
        raise exception 'Choose a current member';
      end if;
      update public.teams set owner_id = p_target, updated_at = now() where id = team.id;
    when 'delete' then delete from public.teams where id = team.id;
    else raise exception 'Unknown team action';
  end case;
  return team.id;
end $$;

-- One bounded JSON response avoids PostgREST row caps on large histories.
-- Counts are aggregated in SQL, never by fetching all submissions in the app.
create or replace function public.team_read(p_team uuid, p_filters jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  team public.teams;
  yr int := coalesce((p_filters->>'year')::int, extract(year from now() at time zone 'UTC')::int);
  page int := greatest(1, least(4, coalesce((p_filters->>'page')::int, 1)));
  chosen uuid[];
  result jsonb;
begin
  if auth.uid() is null or not exists (
    select 1 from public.team_members where team_id = p_team and user_id = auth.uid()
  ) then raise exception 'Team unavailable'; end if;
  select * into team from public.teams where id = p_team;
  if yr < 1970 or yr > 9998 then raise exception 'Invalid year'; end if;
  select array_agg(value::uuid) into chosen from jsonb_array_elements_text(coalesce(p_filters->'members', '[]'::jsonb));
  with members as materialized (
    select m.user_id, p.leetcode_username handle from public.team_members m
    join public.profiles p on p.id = m.user_id where m.team_id = p_team
  ), selected_members as (
    select * from members where chosen is null or user_id = any(chosen)
  ), visible_members as materialized (
    select * from selected_members order by lower(handle), user_id limit 5 offset (page - 1) * 5
  ), filtered as materialized (
    select s.id, s.user_id, s.title_slug, s.submitted_at,
      coalesce(p.title, s.title) title, p.frontend_id, p.difficulty, m.handle
    from public.submissions s join selected_members m on m.user_id = s.user_id
    left join public.problems p on p.title_slug = s.title_slug
    where s.submitted_at >= make_timestamptz(yr, 1, 1, 0, 0, 0, 'UTC')
      and s.submitted_at < make_timestamptz(yr + 1, 1, 1, 0, 0, 0, 'UTC')
      and (nullif(p_filters->>'difficulty', '') is null or p.difficulty = p_filters->>'difficulty')
      and (nullif(p_filters->>'tag', '') is null or p_filters->>'tag' = any(p.topic_tags))
      -- Compare against all recorded history, before year/day/cursor filtering.
      -- The submission ID breaks timestamp ties so only one event is counted.
      and (coalesce(p_filters->>'newOnly', 'false') <> 'true' or not exists (
        select 1 from public.submissions earlier
        where earlier.user_id = s.user_id and earlier.title_slug = s.title_slug
          and (earlier.submitted_at, earlier.id) < (s.submitted_at, s.id)
      ))
  ), daily as (
    select f.user_id, (f.submitted_at at time zone 'UTC')::date::text as day_key, count(*) as count
    from filtered f join visible_members v on v.user_id = f.user_id group by 1, 2
  ), feed as (
    select f.* from filtered f
    where (nullif(p_filters->>'dayMember', '') is null or f.user_id = (p_filters->>'dayMember')::uuid)
      and (nullif(p_filters->>'day', '') is null or (f.submitted_at at time zone 'UTC')::date = (p_filters->>'day')::date)
      and (p_filters->'cursor' is null or p_filters->'cursor' = 'null'::jsonb or
        (f.submitted_at, f.user_id, f.id) < ((p_filters->'cursor'->>'at')::timestamptz,
          (p_filters->'cursor'->>'userId')::uuid, p_filters->'cursor'->>'id'))
    order by f.submitted_at desc, f.user_id desc, f.id desc limit 26
  )
  select jsonb_build_object(
    'newOnlySupported', true,
    'id', team.id, 'name', team.name, 'ownerId', team.owner_id,
    'members', coalesce((select jsonb_agg(jsonb_build_object('id', user_id, 'handle', handle) order by lower(handle), user_id) from members), '[]'::jsonb),
    'memberTotal', (select count(*) from selected_members),
    'graphs', coalesce((select jsonb_agg(jsonb_build_object('id', v.user_id, 'handle', v.handle,
      'days', coalesce((select jsonb_object_agg(day_key, count) from daily where user_id = v.user_id), '{}'::jsonb))
      order by lower(v.handle), v.user_id) from visible_members v), '[]'::jsonb),
    'years', (select jsonb_agg(y order by y desc) from (
      select distinct extract(year from s.submitted_at at time zone 'UTC')::int y
      from public.submissions s join members m on m.user_id = s.user_id
      union select extract(year from now() at time zone 'UTC')::int) years),
    'tags', coalesce((select jsonb_agg(tag order by tag) from (
      select distinct unnest(p.topic_tags) tag from public.problems p
      join public.submissions s on s.title_slug = p.title_slug join members m on m.user_id = s.user_id
    ) tags), '[]'::jsonb),
    'feed', coalesce((select jsonb_agg(to_jsonb(f) order by submitted_at desc, user_id desc, id desc) from feed f), '[]'::jsonb)
  ) into result;
  return result;
end $$;

revoke all on function public.team_list() from public, anon;
revoke all on function public.team_preview(text) from public, anon;
revoke all on function public.team_manage(text, uuid, text, text, uuid) from public, anon;
revoke all on function public.team_read(uuid, jsonb) from public, anon;
grant execute on function public.team_list() to authenticated;
grant execute on function public.team_preview(text) to authenticated;
grant execute on function public.team_manage(text, uuid, text, text, uuid) to authenticated;
grant execute on function public.team_read(uuid, jsonb) to authenticated;
