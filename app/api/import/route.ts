import { NextResponse, after } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { db } from '@/lib/db';
import { parseImport, ingestImport, MAX_IMPORT_BYTES } from '@/lib/import';
import { enrichProblems } from '@/lib/enrich';

// User-driven history import (spec §6.4). Authenticated via the user's Supabase
// session (this is a user action, NOT the cron). We only ever receive an inert
// JSON file the user chose to upload — never a LeetCode credential.
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(request: Request) {
  // Resolve the signed-in user (RLS client). Writes then go through the
  // service-role client with this user_id.
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: 'Not signed in.' }, { status: 401 });
  }

  const raw = await request.text();
  if (raw.length > MAX_IMPORT_BYTES) {
    return NextResponse.json(
      { ok: false, error: 'File is too large.' },
      { status: 413 },
    );
  }

  // Open a tracking job so the UI (and re-runs) can see progress. Written via
  // service role; the user can read their own via RLS.
  const { data: job, error: jobErr } = await db
    .from('import_jobs')
    .insert({ user_id: user.id, status: 'parsing' })
    .select('id')
    .single();
  if (jobErr || !job) {
    return NextResponse.json(
      { ok: false, error: 'Could not start the import.' },
      { status: 500 },
    );
  }
  const jobId = job.id;

  const fail = async (message: string, status: number) => {
    await db
      .from('import_jobs')
      .update({ status: 'error', error: message, finished_at: new Date().toISOString() })
      .eq('id', jobId);
    return NextResponse.json({ ok: false, error: message, jobId }, { status });
  };

  // Parse + structurally validate (re-filter to accepted server-side, §6.4).
  const parsed = parseImport(raw);
  if (!parsed.ok) {
    return fail(parsed.error, 400);
  }
  const problems = new Set(parsed.records.map((r) => r.titleSlug)).size;

  await db
    .from('import_jobs')
    .update({
      status: 'importing',
      rows_received: parsed.received,
      rows_accepted: parsed.records.length,
    })
    .eq('id', jobId);

  // Batch upsert on (user_id, id) — dedupes against prior imports and the poller.
  let result;
  try {
    result = await ingestImport(user.id, parsed.records);
  } catch (err) {
    return fail(err instanceof Error ? err.message : 'Import failed.', 500);
  }

  // Rows are in — mark done and return now (spec §6.4: don't block on enrichment).
  await db
    .from('import_jobs')
    .update({
      status: 'done',
      rows_inserted: result.inserted,
      rows_skipped: result.skipped,
      finished_at: new Date().toISOString(),
    })
    .eq('id', jobId);

  // Enrich the new problems best-effort AFTER responding. The poller's bounded
  // sweep is the durable backstop if this is cut short (idempotent, §6.4).
  if (result.slugs.length > 0) {
    after(async () => {
      try {
        await enrichProblems(result.slugs, 1000);
      } catch {
        // swallow — the poll sweep finishes it
      }
    });
  }

  return NextResponse.json({
    ok: true,
    jobId,
    received: parsed.received,
    accepted: parsed.records.length,
    inserted: result.inserted,
    skipped: result.skipped,
    problems,
  });
}
