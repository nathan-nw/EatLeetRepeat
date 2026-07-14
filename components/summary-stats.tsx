import type { SummaryStats } from '@/lib/stats';

// Headline numbers as stat tiles (dataviz: a single magnitude is a tile, not a
// chart). Difficulty split rides along as labeled sub-counts under unique count.
function Tile({
  label,
  value,
  children,
}: {
  label: string;
  value: string | number;
  children?: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
      <div className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
        {label}
      </div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div>
      {children}
    </div>
  );
}

const DOT: Record<string, string> = {
  Easy: 'bg-emerald-500',
  Medium: 'bg-amber-500',
  Hard: 'bg-rose-500',
};

type Difficulty = 'Easy' | 'Medium' | 'Hard';

export function SummaryStats({
  stats,
  difficultyCounts,
  activeDifficulty,
  onSelectDifficulty,
}: {
  stats: SummaryStats;
  // Faceted counts: reflect the tag/date filters but NOT the difficulty
  // selection, so all three stay visible and switchable while one is active.
  difficultyCounts: Record<Difficulty, number>;
  activeDifficulty: Difficulty | null;
  onSelectDifficulty: (d: Difficulty) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      <Tile label="Unique problems" value={stats.uniqueProblems}>
        <div className="mt-3 -ml-1.5 flex flex-wrap gap-x-1 gap-y-1 text-xs text-zinc-500 dark:text-zinc-400">
          {(['Easy', 'Medium', 'Hard'] as const).map((k) => {
            const active = activeDifficulty === k;
            const dimmed = activeDifficulty !== null && !active;
            return (
              <button
                key={k}
                type="button"
                aria-pressed={active}
                aria-label={`Filter to ${k} problems`}
                onClick={() => onSelectDifficulty(k)}
                className={`inline-flex cursor-pointer items-center gap-1 rounded-md px-1.5 py-0.5 transition-colors hover:bg-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 dark:hover:bg-zinc-800 ${
                  active ? 'bg-zinc-100 font-medium text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100' : ''
                } ${dimmed ? 'opacity-50' : ''}`}
              >
                <span className={`h-2 w-2 rounded-full ${DOT[k]}`} aria-hidden />
                {k} {difficultyCounts[k]}
              </button>
            );
          })}
        </div>
      </Tile>
      <Tile label="Total submissions" value={stats.totalSubmissions} />
      <Tile label="Re-solved problems" value={stats.repeatProblems} />
    </div>
  );
}
