import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { database, asUser, manage, readTeam, userId, tokenHash } from './team-database.mjs';
import { calendarWeeks, contributionLevel, parseTeamFilters, teamQuery } from '../lib/teams.ts';
import { safeReturnPath } from '../lib/return-path.ts';

let db;
before(async () => { db = await database(); });
after(async () => { await db?.close(); });
const owner = userId(1), member = userId(2), outsider = userId(23);

test('auth return paths reject external and encoded destinations', () => {
  const invite = `/invite/${'a'.repeat(64)}`;
  assert.equal(safeReturnPath(invite), invite);
  const recovery = `/reset-password?next=${encodeURIComponent(invite)}`;
  assert.equal(safeReturnPath(recovery), recovery);
  assert.equal(safeReturnPath('/reset-password?next=https://evil.test'), '/dashboard');
  for (const path of ['https://evil.test', '//evil.test', '/\\evil.test', '/%2f%2fevil.test', '/invite/invalid', ['/teams']]) {
    assert.equal(safeReturnPath(path), '/dashboard');
  }
});

test('calendar includes leap day, consistent weekdays, and shared intensity thresholds', () => {
  const weeks = calendarWeeks(2024);
  assert.ok(weeks.every((week) => week.length === 7));
  assert.equal(weeks.flat().filter(Boolean).length, 366);
  assert.equal(weeks[0][1], '2024-01-01');
  assert.ok(weeks.flat().includes('2024-02-29'));
  assert.deepEqual([0,1,2,3,4,5,7,8].map(contributionLevel), [0,1,1,2,2,3,3,4]);
});

test('filters validate and round-trip multi-member/day selections', () => {
  const filters = parseTeamFilters(new URLSearchParams(`year=2024&member=${member}&member=${owner}&day=2024-02-29&dayMember=${member}&tag=Dynamic+Programming&difficulty=Hard&page=2&newOnly=true`));
  assert.equal(filters.newOnly, true);
  assert.deepEqual(parseTeamFilters(new URLSearchParams(teamQuery(filters))), filters);
  const invalid = parseTeamFilters(new URLSearchParams('year=oops&page=-1&member=bad&day=2024-02-30&difficulty=no'));
  assert.equal(invalid.page, 1); assert.equal(invalid.day, ''); assert.deepEqual(invalid.members, []); assert.equal(invalid.difficulty, '');
  assert.equal(invalid.newOnly, false);
});

test('new problems are first recorded solves per member across all history, with stable pagination', async () => {
  const first = userId(3), second = userId(4);
  const hash = tokenHash('new-problems');
  const team = await manage(db, first, 'create', { name: 'First solves', hash });
  await manage(db, second, 'join', { hash });
  await db.query(`insert into public.submissions(id,user_id,title,title_slug,submitted_at,source) values
    ('old',$1,'Shared','shared','2023-12-31T23:59:59Z','import'),
    ('repeat',$1,'Shared','shared','2024-01-01T00:00:00Z','poll'),
    ('first',$2,'Shared','shared','2024-01-01T00:00:00Z','poll'),
    ('again',$2,'Shared','shared','2024-01-02T00:00:00Z','poll'),
    ('tie-a',$1,'Tie','tie','2024-02-29T12:00:00Z','poll'),
    ('tie-b',$1,'Tie','tie','2024-02-29T12:00:00Z','poll')`, [first, second]);
  let data = await readTeam(db, first, team, { year: 2024, newOnly: true });
  assert.deepEqual(data.feed.map((e) => e.id), ['tie-a', 'first']);
  assert.deepEqual(data.graphs.find((g) => g.id === first).days, { '2024-02-29': 1 });
  assert.deepEqual(data.graphs.find((g) => g.id === second).days, { '2024-01-01': 1 });
  assert.equal((await readTeam(db, first, team, { year: 2024 })).feed.length, 5);
  assert.equal((await readTeam(db, first, team, { year: 2024, newOnly: true, day: '2024-01-02', dayMember: second })).feed.length, 0);
  // A later import can reveal an earlier first solve; never persist a stale flag.
  await db.query(`insert into public.submissions(id,user_id,title,title_slug,submitted_at,source)
    values ('backfill',$1,'Shared','shared','2022-01-01T00:00:00Z','import')`, [second]);
  data = await readTeam(db, first, team, { year: 2024, newOnly: true });
  assert.deepEqual(data.feed.map((e) => e.id), ['tie-a']);
  await db.query(`insert into public.submissions(id,user_id,title,title_slug,submitted_at)
    select 'new-'||n,$1,'New '||n,'new-'||n,'2024-03-01T00:00:00Z' from generate_series(1,30) n`, [first]);
  const seen = new Set(); let cursor;
  do {
    data = await readTeam(db, first, team, { year: 2024, newOnly: true, members: [first], cursor });
    const page = data.feed.slice(0,25);
    for (const row of page) { assert.ok(!seen.has(row.id)); seen.add(row.id); }
    const last = page.at(-1);
    cursor = data.feed.length > 25 ? { at: last.submitted_at, userId: last.user_id, id: last.id } : null;
  } while (cursor);
  assert.equal(seen.size, 31);
  await assert.rejects(readTeam(db, outsider, team, { newOnly: true }), /Team unavailable/);
  await manage(db, first, 'delete', { team });
});

test('private membership, reset links, owner actions, withdrawal, transfer, and deletion', async () => {
  const hash = tokenHash('first');
  const team = await manage(db, owner, 'create', { name: ' Study group ', hash });
  assert.equal((await readTeam(db, owner, team)).name, 'Study group');
  await assert.rejects(readTeam(db, outsider, team), /Team unavailable/);
  await assert.rejects(asUser(db, owner, 'select * from public.teams'), /permission denied/);
  await assert.rejects(asUser(db, member, 'select * from public.team_members'), /permission denied/);
  assert.equal((await asUser(db, outsider, 'select public.team_preview($1) result', [hash])).rows[0].result.name, 'Study group');
  await assert.rejects(asUser(db, null, 'select public.team_preview($1)', [hash]), /Not signed in/);
  await db.exec('set role anon');
  await assert.rejects(db.query('select public.team_preview($1)', [hash]), /permission denied/);
  await db.exec('reset role');
  assert.equal(await manage(db, member, 'join', { hash }), team);
  assert.equal(await manage(db, member, 'join', { hash }), team);
  assert.equal((await readTeam(db, member, team)).members.length, 2);
  for (const action of ['rename', 'reset', 'remove', 'remove_reset', 'transfer', 'delete']) {
    await assert.rejects(manage(db, member, action, { team, name: 'Hijacked', hash, target: owner }), /Only the owner/);
  }
  await assert.rejects(manage(db, owner, 'leave', { team }), /Transfer ownership/);
  const nextHash = tokenHash('second');
  await manage(db, owner, 'reset', { team, hash: nextHash });
  await assert.rejects(manage(db, outsider, 'join', { hash }), /unavailable/);
  await manage(db, owner, 'remove', { team, target: member });
  await assert.rejects(readTeam(db, member, team), /Team unavailable/);
  await manage(db, member, 'join', { hash: nextHash });
  await manage(db, owner, 'remove_reset', { team, target: member, hash });
  await assert.rejects(manage(db, member, 'join', { hash: nextHash }), /unavailable/);
  await manage(db, member, 'join', { hash });
  await manage(db, owner, 'transfer', { team, target: member });
  await assert.rejects(manage(db, owner, 'delete', { team }), /Only the owner/);
  await manage(db, owner, 'leave', { team });
  await assert.rejects(readTeam(db, owner, team), /Team unavailable/);
  await manage(db, member, 'delete', { team });
  await assert.rejects(readTeam(db, member, team), /Team unavailable/);
  assert.equal((await db.query('select count(*)::int n from public.profiles')).rows[0].n, 23);
});

test('capacity and duplicate joins remain bounded when requests race', async () => {
  const hash = tokenHash('capacity');
  const team = await manage(db, owner, 'create', { name: 'Full team', hash });
  for (let i = 2; i <= 19; i++) await manage(db, userId(i), 'join', { hash });
  const results = await Promise.allSettled([20, 21].map((i) => manage(db, userId(i), 'join', { hash })));
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  assert.equal((await readTeam(db, owner, team)).members.length, 20);
  await manage(db, owner, 'join', { hash });
  await assert.rejects(manage(db, outsider, 'join', { hash }), /full/);
  const page = await readTeam(db, owner, team, { page: 4 });
  assert.equal(page.graphs.length, 5);
  assert.ok(page.graphs.every((graph) => Object.keys(graph.days).length === 0));
  await manage(db, owner, 'delete', { team });
});

test('SQL totals, imports, year boundaries, metadata, filters, and cursor pagination', async () => {
  const hash = tokenHash('history');
  const team = await manage(db, owner, 'create', { name: 'History', hash });
  await manage(db, member, 'join', { hash });
  await db.exec(`insert into public.problems(title_slug,title,frontend_id,difficulty,topic_tags)
    values ('two-sum','Two Sum','1','Easy',array['Array']);`);
  await db.query(`insert into public.submissions(id,user_id,title,title_slug,submitted_at,source)
    select n::text,$1,'Two Sum','two-sum','2024-02-29T12:00:00Z','import' from generate_series(1,1105) n`, [member]);
  // An imported row and poller row sharing the same ID remain one event.
  await db.query(`insert into public.submissions(id,user_id,title,title_slug,submitted_at)
    values ('1',$1,'Two Sum','two-sum','2024-02-29T12:00:00Z') on conflict(user_id,id) do nothing`, [member]);
  await db.query(`insert into public.submissions(id,user_id,title,title_slug,submitted_at) values
    ('before',$1,'Unknown','unknown','2023-12-31T23:59:59Z'),
    ('start',$1,'Unknown','unknown','2024-01-01T00:00:00Z'),
    ('1',$1,'Unknown','unknown','2024-02-29T12:00:00Z'),
    ('after',$1,'Unknown','unknown','2025-01-01T00:00:00Z')`, [owner]);
  const data = await readTeam(db, owner, team, { year: 2024 });
  assert.equal(data.graphs.find((g) => g.id === member).days['2024-02-29'], 1105);
  assert.equal(data.graphs.find((g) => g.id === owner).days['2024-01-01'], 1);
  assert.ok(data.years.includes(2023)); assert.ok(data.years.includes(2025));
  assert.deepEqual(data.tags, ['Array']);
  const onlyOwner = await readTeam(db, owner, team, { year: 2024, members: [owner] });
  assert.equal(onlyOwner.feed.length, 2); assert.equal(onlyOwner.feed[0].difficulty, null);
  const easy = await readTeam(db, owner, team, { year: 2024, difficulty: 'Easy', tag: 'Array' });
  assert.deepEqual(easy.graphs.find((g) => g.id === owner).days, {});
  const selectedDay = await readTeam(db, owner, team, { year: 2024, day: '2024-02-29', dayMember: member });
  assert.equal(selectedDay.graphs.length, 2); assert.ok(selectedDay.feed.every((entry) => entry.user_id === member));
  const ids = new Set(); let cursor;
  do {
    const response = await readTeam(db, owner, team, { year: 2024, cursor });
    const page = response.feed.slice(0, 25);
    page.forEach((entry) => { const key = `${entry.user_id}:${entry.id}`; assert.ok(!ids.has(key)); ids.add(key); });
    const last = page.at(-1);
    cursor = response.feed.length > 25 ? { at: last.submitted_at, userId: last.user_id, id: last.id } : null;
  } while (cursor);
  assert.equal(ids.size, 1107);
  // Original RLS still exposes only the caller's own activity/profile.
  assert.equal((await asUser(db, owner, 'select count(*)::int n from public.submissions')).rows[0].n, 4);
  assert.equal((await asUser(db, owner, 'select count(*)::int n from public.profiles')).rows[0].n, 1);
  await manage(db, member, 'leave', { team });
  const afterLeave = await readTeam(db, owner, team, { year: 2024 });
  assert.equal(afterLeave.feed.length, 2); assert.equal(afterLeave.graphs.length, 1);
  await manage(db, owner, 'delete', { team });
  assert.equal((await db.query('select count(*)::int n from public.submissions where user_id=$1', [member])).rows[0].n, 1105);
});
