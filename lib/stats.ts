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
  yearLabels: { index: number; label: string }[]; // count under each January column
  maxCount: number;
  total: number; // all cells in the rendered (full-history) window
  lastYearTotal: number; // trailing 53 weeks only — drives the legend copy
};

export function computeDailyCounts(subs: SubmissionWithProblem[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const s of subs) {
    const key = utcKey(new Date(s.submitted_at));
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

// GitHub-contribution-style grid spanning the user's full history — from their
// earliest submission (or a trailing `minWeeks` window, whichever is longer)
// through today. Columns = weeks (Sunday-aligned), rows = weekdays. The extra
// width is what makes the heatmap scrollable back through history.
export function buildHeatmap(
  subs: SubmissionWithProblem[],
  minWeeks = 53,
): Heatmap {
  const counts = computeDailyCounts(subs);

  const now = new Date();
  const end = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );

  // Always guarantee at least a trailing `minWeeks` window (so a brand-new user
  // still sees a full year), but extend further back if older data exists.
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - (minWeeks * 7 - 1));
  let earliestKey: string | null = null;
  for (const key of counts.keys()) {
    if (earliestKey === null || key < earliestKey) earliestKey = key;
  }
  if (earliestKey) {
    const earliest = new Date(`${earliestKey}T00:00:00Z`);
    if (earliest < start) start.setTime(earliest.getTime());
  }
  // Align to the start of the week (Sunday).
  start.setUTCDate(start.getUTCDate() - start.getUTCDay());

  // Trailing-12-month total for the legend (independent of how far the grid
  // scrolls back). String comparison is valid for YYYY-MM-DD keys.
  const lastYearStart = new Date(end);
  lastYearStart.setUTCDate(lastYearStart.getUTCDate() - (53 * 7 - 1));
  const lastYearStartKey = utcKey(lastYearStart);
  let lastYearTotal = 0;
  for (const [key, count] of counts) {
    if (key >= lastYearStartKey) lastYearTotal += count;
  }

  // Per-calendar-year totals, surfaced under each January column. The current
  // year shows the trailing-12-month figure instead (the year's still running).
  const yearTotals = new Map<string, number>();
  for (const [key, count] of counts) {
    const y = key.slice(0, 4);
    yearTotals.set(y, (yearTotals.get(y) ?? 0) + count);
  }
  const currentYear = String(end.getUTCFullYear());

  const weeks: HeatWeek[] = [];
  const monthLabels: { index: number; label: string }[] = [];
  const yearLabels: { index: number; label: string }[] = [];
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
        const year = firstReal.date.slice(0, 4);
        // Tag January with the year so multi-year scrolling stays legible.
        const label = month === 0 ? `${MONTHS[month]} ${year}` : MONTHS[month];
        monthLabels.push({ index: weeks.length, label });
        if (month === 0) {
          const count =
            year === currentYear ? lastYearTotal : (yearTotals.get(year) ?? 0);
          const text =
            year === currentYear ? `${count} in the last year` : `${count} in ${year}`;
          yearLabels.push({ index: weeks.length, label: text });
        }
        lastMonth = month;
      }
    }
    weeks.push(week);
  }

  return { weeks, monthLabels, yearLabels, maxCount, total, lastYearTotal };
}
