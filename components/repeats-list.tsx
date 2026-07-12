import type { RepeatGroup } from '@/lib/stats';
import { ProblemLabel } from '@/components/problem-label';
import { DifficultyBadge } from '@/components/difficulty-badge';
import { Time } from '@/components/time';
import type { DifficultyKey } from '@/lib/stats';

function difficultyOf(g: RepeatGroup): DifficultyKey {
  const d = g.problem?.difficulty;
  return d === 'Easy' || d === 'Medium' || d === 'Hard' ? d : 'Unknown';
}

export function RepeatsList({ groups }: { groups: RepeatGroup[] }) {
  if (groups.length === 0) {
    return (
      <p className="text-sm text-zinc-500 dark:text-zinc-400">
        No re-solves yet. When you solve a problem you&apos;ve already completed,
        it&apos;ll show up here with each solve date.
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-3">
      {groups.map((g) => (
        <li
          key={g.slug}
          className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800"
        >
          <div className="flex items-center justify-between gap-4">
            <div className="flex min-w-0 items-center gap-2">
              <ProblemLabel
                slug={g.slug}
                problem={g.problem}
                fallbackTitle={g.title}
                className="truncate"
              />
              <DifficultyBadge difficulty={difficultyOf(g)} />
            </div>
            <span className="shrink-0 rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium tabular-nums dark:bg-zinc-800">
              {g.count}× solved
            </span>
          </div>
          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-zinc-500 dark:text-zinc-400">
            {g.dates.map((d, i) => (
              <span key={i}>
                <Time iso={d} mode="date" />
              </span>
            ))}
          </div>
        </li>
      ))}
    </ul>
  );
}
