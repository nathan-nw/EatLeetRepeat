import { NextResponse } from 'next/server';
import { runPoll } from '@/lib/poller';

// The poller endpoint — cron-job.org's scheduled target (every 30 min). The URL is public, so it
// MUST reject anything without the correct bearer secret before doing any work
// (rule #2). This route is excluded from the auth proxy (it has no user session).
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60; // Vercel function budget; keep the all-users loop under it.

function isAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false; // never allow an unset/empty secret to pass
  return request.headers.get('authorization') === `Bearer ${secret}`;
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return new Response('Unauthorized', { status: 401 });
  }

  try {
    const summary = await runPoll();
    return NextResponse.json({ ok: true, ...summary });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
