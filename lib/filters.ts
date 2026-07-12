import type { SubmissionWithProblem } from '@/lib/dashboard';
import type { DifficultyKey } from '@/lib/stats';

// URL-driven filters. State lives entirely in the query string so views are
// shareable/bookmarkable and work with server components (no client state).

export type Filters = {
  difficulty: 'Easy' | 'Medium' | 'Hard' | null;
  tag: string | null;
  from: string | null; // YYYY-MM-DD, inclusive
  to: string | null; // YYYY-MM-DD, inclusive
};

export const EMPTY_FILTERS: Filters = {
  difficulty: null,
  tag: null,
  from: null,
  to: null,
};

type SearchParams = Record<string, string | string[] | undefined>;

function str(v: string | string[] | undefined): string | null {
  const s = Array.isArray(v) ? v[0] : v;
  return s && s.length > 0 ? s : null;
}

export function parseFilters(sp: SearchParams): Filters {
  const difficulty = str(sp.difficulty);
  return {
    difficulty:
      difficulty === 'Easy' || difficulty === 'Medium' || difficulty === 'Hard'
        ? difficulty
        : null,
    tag: str(sp.tag),
    from: str(sp.from),
    to: str(sp.to),
  };
}

export function hasActiveFilters(f: Filters): boolean {
  return Boolean(f.difficulty || f.tag || f.from || f.to);
}

// Serialize filters back to a query string (`?difficulty=Medium&tag=...`), or an
// empty string when no filters are active. Inverse of parseFilters; used to keep
// the URL in sync as filters change client-side.
export function buildQuery(f: Filters): string {
  const p = new URLSearchParams();
  if (f.difficulty) p.set('difficulty', f.difficulty);
  if (f.tag) p.set('tag', f.tag);
  if (f.from) p.set('from', f.from);
  if (f.to) p.set('to', f.to);
  const s = p.toString();
  return s ? `?${s}` : '';
}

// All topic tags present across the user's submissions, sorted. Built from the
// UNFILTERED set so the dropdown options don't vanish as filters narrow.
export function allTags(subs: SubmissionWithProblem[]): string[] {
  const tags = new Set<string>();
  for (const s of subs) {
    for (const t of s.problem?.topic_tags ?? []) tags.add(t);
  }
  return Array.from(tags).sort((a, b) => a.localeCompare(b));
}

function difficultyOf(s: SubmissionWithProblem): DifficultyKey {
  const d = s.problem?.difficulty;
  return d === 'Easy' || d === 'Medium' || d === 'Hard' ? d : 'Unknown';
}

export function applyFilters(
  subs: SubmissionWithProblem[],
  f: Filters,
): SubmissionWithProblem[] {
  const fromTs = f.from ? Date.parse(`${f.from}T00:00:00.000Z`) : null;
  const toTs = f.to ? Date.parse(`${f.to}T23:59:59.999Z`) : null;

  return subs.filter((s) => {
    if (f.difficulty && difficultyOf(s) !== f.difficulty) return false;
    if (f.tag && !(s.problem?.topic_tags ?? []).includes(f.tag)) return false;

    if (fromTs !== null || toTs !== null) {
      const ts = Date.parse(s.submitted_at);
      if (fromTs !== null && ts < fromTs) return false;
      if (toTs !== null && ts > toTs) return false;
    }
    return true;
  });
}
