import type { Problem } from '@/lib/database.types';
import type { SubmissionWithProblem } from '@/lib/dashboard';

// Pure, server/client-safe computation over a user's submissions. No I/O — feed
// it the result of getUserSubmissions().

export type DifficultyKey = 'Easy' | 'Medium' | 'Hard' | 'Unknown';

export type SummaryStats = {
  totalSubmissions: number;
  uniqueProblems: number;
  repeatProblems: number; // problems solved more than once
  byDifficulty: Record<DifficultyKey, number>; // UNIQUE problems per difficulty
};

function difficultyOf(problem: Problem | null): DifficultyKey {
  const d = problem?.difficulty;
  if (d === 'Easy' || d === 'Medium' || d === 'Hard') return d;
  return 'Unknown';
}

export function computeSummary(subs: SubmissionWithProblem[]): SummaryStats {
  const bySlug = new Map<string, { count: number; difficulty: DifficultyKey }>();

  for (const s of subs) {
    const existing = bySlug.get(s.title_slug);
    if (existing) {
      existing.count += 1;
    } else {
      bySlug.set(s.title_slug, { count: 1, difficulty: difficultyOf(s.problem) });
    }
  }

  const byDifficulty: Record<DifficultyKey, number> = {
    Easy: 0,
    Medium: 0,
    Hard: 0,
    Unknown: 0,
  };
  let repeatProblems = 0;
  for (const { count, difficulty } of bySlug.values()) {
    byDifficulty[difficulty] += 1;
    if (count > 1) repeatProblems += 1;
  }

  return {
    totalSubmissions: subs.length,
    uniqueProblems: bySlug.size,
    repeatProblems,
    byDifficulty,
  };
}

// ---- Repeats ---------------------------------------------------------------

export type RepeatGroup = {
  slug: string;
  problem: Problem | null;
  title: string; // display fallback when problem meta is missing
  count: number;
  dates: string[]; // ISO submitted_at, newest first
};

// Problems solved more than once, most-repeated first. The headline feature.
export function computeRepeats(subs: SubmissionWithProblem[]): RepeatGroup[] {
  const groups = new Map<string, RepeatGroup>();

  for (const s of subs) {
    const g = groups.get(s.title_slug);
    if (g) {
      g.count += 1;
      g.dates.push(s.submitted_at);
    } else {
      groups.set(s.title_slug, {
        slug: s.title_slug,
        problem: s.problem,
        title: s.title,
        count: 1,
        dates: [s.submitted_at],
      });
    }
  }

  return Array.from(groups.values())
    .filter((g) => g.count > 1)
    .map((g) => ({
      ...g,
      dates: g.dates.sort((a, b) => (a < b ? 1 : -1)),
    }))
    .sort((a, b) => b.count - a.count || (a.title < b.title ? -1 : 1));
}

// ---- Calendar heatmap ------------------------------------------------------

const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

// UTC date key (YYYY-MM-DD). We bucket by UTC so the grid is deterministic
// regardless of where it renders (server tz on Vercel is UTC).
function utcKey(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// Sequential magnitude buckets (single hue, light→dark). 0 = empty.
function level(count: number): number {
  if (count <= 0) return 0;
  if (count <= 2) return 1;
  if (count <= 4) return 2;
  if (count <= 7) return 3;
  return 4;
}

// One problem solved on a given day, for the click-to-open day popover.
export type DayEntry = {
  slug: string;
  label: string; // "#1 · Two Sum" (or title fallback)
  difficulty: DifficultyKey;
  iso: string; // submitted_at
};

function displayLabel(
  problem: SubmissionWithProblem['problem'],
  fallback: string,
): string {
  if (problem?.frontend_id) return `#${problem.frontend_id} · ${problem.title}`;
  return problem?.title ?? fallback;
}

// Map of UTC day key → that day's submissions (earliest first). Keyed to match
// the heatmap cell dates so a cell click can look up its day directly.
export function buildDayIndex(
  subs: SubmissionWithProblem[],
): Record<string, DayEntry[]> {
  const index: Record<string, DayEntry[]> = {};
  for (const s of subs) {
    const key = utcKey(new Date(s.submitted_at));
    (index[key] ??= []).push({
      slug: s.title_slug,
      label: displayLabel(s.problem, s.title),
      difficulty: difficultyOf(s.problem),
      iso: s.submitted_at,
    });
  }
  for (const key of Object.keys(index)) {
    index[key].sort((a, b) => (a.iso < b.iso ? -1 : 1));
  }
  return index;
}

export type HeatDay = { date: string; count: number; level: number } | null;
export type HeatWeek = HeatDay[]; // length 7, index 0 = Sunday
export type Heatmap = {
  weeks: HeatWeek[];
  monthLabels: { index: number; label: string }[]; // label above column `index`
  maxCount: number;
  total: number;
};

export function computeDailyCounts(subs: SubmissionWithProblem[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const s of subs) {
    const key = utcKey(new Date(s.submitted_at));
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

// GitHub-contribution-style grid for the trailing `weeksCount` weeks, columns =
// weeks (Sunday-aligned), rows = weekdays.
export function buildHeatmap(
  subs: SubmissionWithProblem[],
  weeksCount = 53,
): Heatmap {
  const counts = computeDailyCounts(subs);

  const now = new Date();
  const end = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - (weeksCount * 7 - 1));
  // Align to the start of the week (Sunday).
  start.setUTCDate(start.getUTCDate() - start.getUTCDay());

  const weeks: HeatWeek[] = [];
  const monthLabels: { index: number; label: string }[] = [];
  let lastMonth = -1;
  let maxCount = 0;
  let total = 0;

  const cur = new Date(start);
  while (cur <= end) {
    const week: HeatWeek = [];
    for (let d = 0; d < 7; d++) {
      if (cur > end) {
        week.push(null);
      } else {
        const key = utcKey(cur);
        const count = counts.get(key) ?? 0;
        maxCount = Math.max(maxCount, count);
        total += count;
        week.push({ date: key, count, level: level(count) });
      }
      cur.setUTCDate(cur.getUTCDate() + 1);
    }

    const firstReal = week.find((x) => x !== null);
    if (firstReal) {
      const month = new Date(`${firstReal.date}T00:00:00Z`).getUTCMonth();
      if (month !== lastMonth) {
        monthLabels.push({ index: weeks.length, label: MONTHS[month] });
        lastMonth = month;
      }
    }
    weeks.push(week);
  }

  return { weeks, monthLabels, maxCount, total };
}
