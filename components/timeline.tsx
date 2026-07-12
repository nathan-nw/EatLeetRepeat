import type { SubmissionWithProblem } from '@/lib/dashboard';
import { ProblemLabel } from '@/components/problem-label';
import { DifficultyBadge } from '@/components/difficulty-badge';
import { Time } from '@/components/time';
import type { DifficultyKey } from '@/lib/stats';

function difficultyOf(s: SubmissionWithProblem): DifficultyKey {
  const d = s.problem?.difficulty;
  return d === 'Easy' || d === 'Medium' || d === 'Hard' ? d : 'Unknown';
}

export function Timeline({
  submissions,
}: {
  submissions: SubmissionWithProblem[];
}) {
  if (submissions.length === 0) {
    return (
      <p className="text-sm text-zinc-500 dark:text-zinc-400">
        No submissions yet. Once the poller runs, your accepted submissions will
        appear here.
      </p>
    );
  }

  return (
    <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
      {submissions.map((s) => (
        <li
          key={`${s.id}-${s.submitted_at}`}
          className="flex items-center justify-between gap-4 py-2.5"
        >
          <div className="flex min-w-0 items-center gap-2">
            <ProblemLabel
              slug={s.title_slug}
              problem={s.problem}
              fallbackTitle={s.title}
              className="truncate"
            />
            <DifficultyBadge difficulty={difficultyOf(s)} />
          </div>
          <div className="shrink-0 text-xs text-zinc-500 dark:text-zinc-400">
            <Time iso={s.submitted_at} />
          </div>
        </li>
      ))}
    </ul>
  );
}
