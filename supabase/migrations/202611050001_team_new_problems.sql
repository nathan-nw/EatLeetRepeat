-- Update team filtering only. No tables, columns, or existing data are changed.
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

revoke all on function public.team_read(uuid, jsonb) from public, anon;
grant execute on function public.team_read(uuid, jsonb) to authenticated;
