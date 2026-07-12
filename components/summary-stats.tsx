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

export function SummaryStats({ stats }: { stats: SummaryStats }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      <Tile label="Unique problems" value={stats.uniqueProblems}>
        <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-xs text-zinc-500 dark:text-zinc-400">
          {(['Easy', 'Medium', 'Hard'] as const).map((k) => (
            <span key={k} className="inline-flex items-center gap-1">
              <span className={`h-2 w-2 rounded-full ${DOT[k]}`} aria-hidden />
              {k} {stats.byDifficulty[k]}
            </span>
          ))}
        </div>
      </Tile>
      <Tile label="Total submissions" value={stats.totalSubmissions} />
      <Tile label="Re-solved problems" value={stats.repeatProblems} />
    </div>
  );
}
