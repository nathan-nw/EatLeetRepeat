import 'server-only';
import { db } from './db';
import type { ImportRecord } from './import-parse';

// History-import ingest (spec §6.4). The browser export produces an inert JSON
// array of accepted submissions; lib/import-parse.ts validates + maps it, and
// this upserts on (user_id, id) — the SAME dedup key the poller uses, so import
// and poll are idempotent together: re-uploads and concurrent runs insert zero
// dupes. Writes go through the service-role client (`db`); the caller resolves
// `auth.uid()` from the user's session first and passes it in.

export { parseImport, MAX_IMPORT_BYTES } from './import-parse';
export type { ImportRecord, ParseResult } from './import-parse';

const UPSERT_BATCH = 500;

export type IngestResult = {
  inserted: number;
  skipped: number;
  slugs: string[]; // distinct slugs among newly-inserted rows (for enrichment)
};

// Batch-upsert the records for a user. ON CONFLICT (user_id, id) DO NOTHING, so
// already-known submissions (from a prior import or the poller) insert nothing.
export async function ingestImport(
  userId: string,
  records: ImportRecord[],
): Promise<IngestResult> {
  let inserted = 0;
  const insertedSlugs = new Set<string>();

  for (let i = 0; i < records.length; i += UPSERT_BATCH) {
    const batch = records.slice(i, i + UPSERT_BATCH).map((r) => ({
      id: r.id,
      user_id: userId,
      title: r.title,
      title_slug: r.titleSlug,
      // LeetCode timestamp is Unix epoch seconds (rule #5).
      submitted_at: new Date(Number(r.timestamp) * 1000).toISOString(),
      source: 'import',
    }));

    const { data, error } = await db
      .from('submissions')
      .upsert(batch, { onConflict: 'user_id,id', ignoreDuplicates: true })
      .select('title_slug');

    if (error) {
      throw new Error(`upsert submissions: ${error.message}`);
    }
    for (const row of data ?? []) {
      inserted += 1;
      insertedSlugs.add(row.title_slug);
    }
  }

  return {
    inserted,
    skipped: records.length - inserted,
    slugs: Array.from(insertedSlugs),
  };
}
