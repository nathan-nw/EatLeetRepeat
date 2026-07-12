// Pure parsing + validation for the history import. No DB, no 'server-only' — so
// it's trivially testable and safe to import from anywhere. The DB-touching
// ingest lives in lib/import.ts.

// The fixed upload contract (matches lib/export-snippet.ts output).
export type ImportRecord = {
  id: string;
  title: string;
  titleSlug: string;
  timestamp: string; // Unix epoch SECONDS
};

// Cap upload size so a bad/hostile file can't exhaust memory. A multi-year
// history is well under this.
export const MAX_IMPORT_BYTES = 8 * 1024 * 1024; // 8 MB

export type ParseResult =
  | { ok: true; records: ImportRecord[]; received: number }
  | { ok: false; error: string };

// Parse + structurally validate the uploaded text. Because the snippet already
// exports accepted-only and drops the status field, "re-filter to accepted"
// (spec §6.4 step 2) becomes strict structural validation here: any row missing a
// required field or with a non-numeric timestamp is dropped. Malformed JSON or a
// non-array shape rejects the whole file. If an optional status field survived
// the export, it's honoured (accepted-only).
export function parseImport(raw: string): ParseResult {
  if (raw.length > MAX_IMPORT_BYTES) {
    return { ok: false, error: 'File is too large.' };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, error: 'That file isn’t valid JSON.' };
  }

  if (!Array.isArray(parsed)) {
    return {
      ok: false,
      error: 'Unexpected file shape — expected an array of submissions.',
    };
  }

  const received = parsed.length;
  const records: ImportRecord[] = [];
  for (const row of parsed) {
    if (!row || typeof row !== 'object') continue;
    const r = row as Record<string, unknown>;
    const { id, title, titleSlug, timestamp } = r;

    // Honour an optional status field if the export kept one.
    if (typeof r.statusDisplay === 'string' && r.statusDisplay !== 'Accepted') {
      continue;
    }

    if (
      (typeof id !== 'string' && typeof id !== 'number') ||
      typeof title !== 'string' ||
      typeof titleSlug !== 'string' ||
      (typeof timestamp !== 'string' && typeof timestamp !== 'number')
    ) {
      continue;
    }
    const ts = Number(timestamp);
    if (!Number.isFinite(ts) || ts <= 0) continue;

    records.push({
      id: String(id),
      title,
      titleSlug,
      timestamp: String(Math.trunc(ts)),
    });
  }

  if (received > 0 && records.length === 0) {
    return {
      ok: false,
      error: 'No valid accepted submissions found in that file.',
    };
  }

  return { ok: true, records, received };
}
