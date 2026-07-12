import 'server-only';
import { db } from './db';
import { fetchRecentAcSubmissions, LeetCodeRateLimitError } from './leetcode';
import { enrichProblems } from './enrich';

// Delay between users so a run with N users doesn't burst N requests at
// LeetCode at once (CLAUDE.md rule #10). Small — a human user base stays well
// within the endpoint's tolerance.
const STAGGER_MS = 400;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export type PollSummary = {
  users: number; // profiles considered this run
  fetched: number; // total submissions returned by LeetCode
  inserted: number; // total NEW submission rows written
  errors: number; // per-user failures
  rateLimited: boolean; // run stopped early on a 429
};

// The hourly job. Loops over every registered user, records their new accepted
// submissions, enriches shared problem metadata, and writes a per-user poll_runs
// row. Idempotent and self-healing: re-running changes nothing, a missed tick is
// recovered next time (rule #4). One user's failure never aborts the others.
export async function runPoll(): Promise<PollSummary> {
  const summary: PollSummary = {
    users: 0,
    fetched: 0,
    inserted: 0,
    errors: 0,
    rateLimited: false,
  };

  const { data: profiles, error } = await db
    .from('profiles')
    .select('id, leetcode_username');

  if (error) {
    // Couldn't even list users — log a whole-run error and surface it.
    await logRun(null, 0, 0, 'error', `load profiles: ${error.message}`);
    throw new Error(`Failed to load profiles: ${error.message}`);
  }

  summary.users = profiles.length;

  for (let i = 0; i < profiles.length; i++) {
    const { id, leetcode_username } = profiles[i];
    try {
      const { fetched, inserted } = await pollUser(id, leetcode_username);
      summary.fetched += fetched;
      summary.inserted += inserted;
      await logRun(id, fetched, inserted, 'success', null);
    } catch (err) {
      summary.errors += 1;
      const message = err instanceof Error ? err.message : String(err);
      await logRun(id, 0, 0, 'error', message);

      // A 429 is global to our IP — hitting the next user would only make it
      // worse. Stop the run; the next hourly tick recovers everyone (rule #10).
      if (err instanceof LeetCodeRateLimitError) {
        summary.rateLimited = true;
        break;
      }
      // Any other failure (bad handle, timeout, transient DB error): logged to
      // this user's poll_runs, move on to the next user (rule #4).
    }

    if (i < profiles.length - 1) {
      await sleep(STAGGER_MS);
    }
  }

  return summary;
}

// Poll one user: fetch their recent 20 accepted submissions and upsert the new
// ones. Dedup is on (user_id, id) so a re-solve (new id) lands as a new row.
async function pollUser(
  userId: string,
  username: string,
): Promise<{ fetched: number; inserted: number }> {
  const subs = await fetchRecentAcSubmissions(username, 20);
  if (subs.length === 0) {
    return { fetched: 0, inserted: 0 };
  }

  const rows = subs.map((s) => ({
    id: s.id,
    user_id: userId,
    title: s.title,
    title_slug: s.titleSlug,
    // LeetCode `timestamp` is Unix epoch seconds (rule #5).
    submitted_at: new Date(Number(s.timestamp) * 1000).toISOString(),
    source: 'poll',
  }));

  // ON CONFLICT (user_id, id) DO NOTHING. `.select()` returns only the rows
  // actually inserted, so its length is the new-count and its slugs are exactly
  // the submissions we haven't seen for this user before.
  const { data: inserted, error } = await db
    .from('submissions')
    .upsert(rows, { onConflict: 'user_id,id', ignoreDuplicates: true })
    .select('title_slug');

  if (error) {
    throw new Error(`upsert submissions: ${error.message}`);
  }

  const newSlugs = Array.from(
    new Set((inserted ?? []).map((r) => r.title_slug)),
  );
  if (newSlugs.length > 0) {
    // Best-effort shared enrichment (also used by the history import).
    await enrichProblems(newSlugs);
  }

  return { fetched: subs.length, inserted: inserted?.length ?? 0 };
}

// Observability: one row per user per run (rule #12). user_id is null only for a
// whole-run failure (e.g. couldn't list profiles).
async function logRun(
  userId: string | null,
  fetched: number,
  inserted: number,
  status: 'success' | 'error',
  error: string | null,
): Promise<void> {
  await db.from('poll_runs').insert({
    user_id: userId,
    fetched_count: fetched,
    new_count: inserted,
    status,
    error,
  });
}
