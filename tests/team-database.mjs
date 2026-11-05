import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

export const userId = (number) => `00000000-0000-4000-8000-${String(number).padStart(12, '0')}`;
export const tokenHash = (token) => createHash('sha256').update(token).digest('hex');

export async function database() {
  const db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated;
    create schema auth;
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as
      'select nullif(current_setting(''request.jwt.claim.sub'', true), '''')::uuid';
    grant usage on schema auth, public to authenticated, anon;
    grant execute on function auth.uid() to authenticated, anon;
  `);
  await db.exec(await readFile(new URL('../supabase/schema.sql', import.meta.url), 'utf8'));
  // Migration must be safe to apply after the canonical schema as well.
  await db.exec(await readFile(new URL('../supabase/migrations/202611020001_teams.sql', import.meta.url), 'utf8'));
  await db.exec(await readFile(new URL('../supabase/migrations/202611050001_team_new_problems.sql', import.meta.url), 'utf8'));
  await db.exec(`grant select on public.profiles, public.submissions, public.problems to authenticated;`);
  for (let i = 1; i <= 23; i++) {
    await db.query('insert into auth.users(id) values ($1)', [userId(i)]);
    await db.query('insert into public.profiles(id, leetcode_username) values ($1, $2)', [userId(i), `member${String(i).padStart(2, '0')}`]);
  }
  return db;
}

export async function asUser(db, id, sql, params = []) {
  return db.transaction(async (tx) => {
    await tx.query("select set_config('request.jwt.claim.sub', $1, true)", [id ?? '']);
    await tx.exec('set local role authenticated');
    return tx.query(sql, params);
  });
}

export async function manage(db, user, action, options = {}) {
  const result = await asUser(db, user, 'select public.team_manage($1,$2,$3,$4,$5) result', [
    action, options.team ?? null, options.name ?? null, options.hash ?? null, options.target ?? null,
  ]);
  return result.rows[0].result;
}

export async function readTeam(db, user, team, filters = {}) {
  return (await asUser(db, user, 'select public.team_read($1,$2) result', [team, JSON.stringify(filters)])).rows[0].result;
}
