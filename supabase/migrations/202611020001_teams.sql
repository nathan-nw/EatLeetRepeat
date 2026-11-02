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
