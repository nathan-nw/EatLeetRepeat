import 'server-only';
import { db } from './db';
import { fetchQuestionData } from './leetcode';

// Shared, idempotent problem-metadata enrichment. Used by both the poller
// (lib/poller.ts) and the history import (/api/import). Problem metadata is
// GLOBAL (one `problems` row per slug, reused across all users), so enrichment is
// done once per slug and benefits everyone.
//
// Best-effort by design (CLAUDE.md rule #6): a failed lookup leaves the slug
// unenriched and is retried on a later run — it must never block a submission
// insert. Safe to re-run: already-present slugs are skipped.

// Politeness gap between `questionData` calls so a large import (hundreds of
// slugs) doesn't burst the public endpoint. The poller passes 0 for its handful
// of new slugs; import passes ~1000ms (§6.4).
const DEFAULT_GAP_MS = 0;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Enrich the given slugs that aren't already in `problems`. Returns the number of
// slugs newly enriched. Never throws.
export async function enrichProblems(
  slugs: string[],
  gapMs: number = DEFAULT_GAP_MS,
): Promise<number> {
  const unique = Array.from(new Set(slugs));
  if (unique.length === 0) return 0;

  const { data: existing } = await db
    .from('problems')
    .select('title_slug')
    .in('title_slug', unique);

  const have = new Set((existing ?? []).map((r) => r.title_slug));
  const missing = unique.filter((s) => !have.has(s));

  let enriched = 0;
  for (let i = 0; i < missing.length; i++) {
    const slug = missing[i];
    try {
      const q = await fetchQuestionData(slug);
      if (!q) continue;
      await db.from('problems').upsert(
        {
          title_slug: q.titleSlug,
          frontend_id: q.questionFrontendId,
          title: q.title,
          difficulty: q.difficulty,
          topic_tags: q.topicTags.map((t) => t.name),
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'title_slug' },
      );
      enriched += 1;
    } catch {
      // swallow — a later run (poller sweep or re-import) backfills this slug.
    }
    if (gapMs > 0 && i < missing.length - 1) {
      await sleep(gapMs);
    }
  }
  return enriched;
}
