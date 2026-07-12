import 'server-only';
import { cache } from 'react';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getSessionUser } from '@/lib/auth';
import type { Submission, Problem } from '@/lib/database.types';

// A submission joined with its (best-effort) problem metadata. `problem` is null
// when the poller hasn't enriched that slug yet — the UI falls back gracefully.
export type SubmissionWithProblem = Submission & { problem: Problem | null };

// All of the signed-in user's submissions, newest first, each joined to its
// problem metadata. RLS scopes the read to the current user; we also filter by
// user_id explicitly for clarity. Joined in JS because `submissions.title_slug`
// is intentionally not a FK to `problems` (a submission can land before its
// problem row is enriched — CLAUDE.md rule #6).
export const getUserSubmissions = cache(
  async (): Promise<SubmissionWithProblem[]> => {
    const user = await getSessionUser();
    if (!user) return [];

    const supabase = await createSupabaseServerClient();
    const { data: subs } = await supabase
      .from('submissions')
      .select('*')
      .eq('user_id', user.id)
      .order('submitted_at', { ascending: false });

    const submissions = subs ?? [];
    if (submissions.length === 0) return [];

    const slugs = Array.from(new Set(submissions.map((s) => s.title_slug)));
    const { data: probs } = await supabase
      .from('problems')
      .select('*')
      .in('title_slug', slugs);

    const bySlug = new Map((probs ?? []).map((p) => [p.title_slug, p]));
    return submissions.map((s) => ({
      ...s,
      problem: bySlug.get(s.title_slug) ?? null,
    }));
  },
);
