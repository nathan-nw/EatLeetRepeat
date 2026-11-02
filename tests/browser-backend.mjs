// Local-only Supabase protocol adapter. Real team SQL runs in PGlite; auth is
// deliberately fake. Never point this test server at a deployed database.
import http from 'node:http';
import { createHmac } from 'node:crypto';
import { database, asUser, userId } from './team-database.mjs';

const db = await database();
await db.query('delete from public.profiles where id=$1', [userId(22)]);
await db.exec('grant insert on public.profiles to authenticated');
await db.query(`insert into public.problems(title_slug,title,frontend_id,difficulty,topic_tags)
  values ('two-sum','Two Sum','1','Easy',array['Array'])`);
await db.query(`insert into public.submissions(id,user_id,title,title_slug,submitted_at,source)
  select n::text,$1,'Two Sum','two-sum','2024-02-29T12:00:00Z','import' from generate_series(1,30) n`, [userId(2)]);

function user(id) {
  return { id, aud: 'authenticated', role: 'authenticated', email: `member${Number(id.slice(-12))}@example.test`,
    email_confirmed_at: '2024-01-01T00:00:00Z', app_metadata: { provider: 'email', providers: ['email'] }, user_metadata: {}, identities: [], created_at: '2024-01-01T00:00:00Z' };
}
function session(id) {
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const payload = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: id, aud: 'authenticated', role: 'authenticated', exp: Math.floor(Date.now()/1000)+3600, iat: Math.floor(Date.now()/1000) })}`;
  return { access_token: `${payload}.${createHmac('sha256', 'local-test-only').update(payload).digest('base64url')}`, token_type: 'bearer', expires_in: 3600, refresh_token: `test-${id}`, user: user(id) };
}
function actor(request) {
  try { return JSON.parse(Buffer.from(request.headers.authorization.split('.')[1], 'base64url').toString()).sub; }
  catch { return null; }
}

http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,OPTIONS');
  res.setHeader('Content-Type', 'application/json');
  const send = (status, data) => { res.writeHead(status); res.end(JSON.stringify(data)); };
  if (req.method === 'OPTIONS') { send(200, {}); return; }
  const url = new URL(req.url, 'http://127.0.0.1:54329');
  let raw = ''; for await (const chunk of req) raw += chunk;
  const body = raw ? JSON.parse(raw) : {};
  const id = actor(req);
  try {
    if (url.pathname === '/health') return send(200, { ok: true });
    if (url.pathname === '/auth/v1/token') {
      const n = Number(body.email?.match(/^member(\d+)@example.test$/)?.[1]);
      if (!n || n > 23) return send(400, { message: 'Invalid login credentials' });
      return send(200, session(userId(n)));
    }
    if (url.pathname === '/auth/v1/user') return send(id ? 200 : 401, id ? user(id) : { message: 'Not signed in' });
    if (url.pathname === '/auth/v1/signup') return send(200, user(userId(22)));
    if (url.pathname === '/auth/v1/verify' && body.token_hash === 'fixture-member22') return send(200, session(userId(22)));
    if (url.pathname === '/auth/v1/logout') return send(200, {});
    if (url.pathname === '/rest/v1/profiles') {
      if (req.method === 'POST') {
        await asUser(db, id, 'insert into public.profiles(id,leetcode_username,has_password) values ($1,$2,$3)', [body.id, body.leetcode_username, body.has_password]);
        return send(201, {});
      }
      const result = await asUser(db, id, 'select * from public.profiles where id=$1', [id]);
      return send(200, req.headers.accept?.includes('object') ? result.rows[0] ?? null : result.rows);
    }
    if (url.pathname.startsWith('/rest/v1/rpc/')) {
      const name = url.pathname.split('/').at(-1);
      const contracts = {
        team_list: [], team_preview: ['p_hash'], team_read: ['p_team','p_filters'],
        team_manage: ['p_action','p_team','p_name','p_hash','p_target'],
      };
      if (!(name in contracts)) return send(404, {});
      const args = contracts[name].map((key) => key === 'p_filters' ? JSON.stringify(body[key] ?? {}) : body[key] ?? null);
      const result = await asUser(db, id, `select public.${name}(${args.map((_, i) => `$${i+1}`).join(',')}) result`, args);
      return send(200, result.rows[0].result);
    }
    // Existing personal dashboard reads are empty in this test adapter.
    if (url.pathname.startsWith('/rest/v1/')) return send(200, []);
    send(404, { message: 'Unsupported local test endpoint' });
  } catch (error) { send(400, { message: error.message, code: error.code }); }
}).listen(54329, '127.0.0.1', () => console.log('Local team test backend ready'));
