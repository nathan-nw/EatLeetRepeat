import Link from 'next/link';
import { getUserSubmissions } from '@/lib/dashboard';
import { problemDisplay, leetcodeUrl } from '@/components/problem-label';
import { DifficultyBadge } from '@/components/difficulty-badge';
import { Time } from '@/components/time';
import type { DifficultyKey } from '@/lib/stats';

export default async function ProblemPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const all = await getUserSubmissions();
  const solves = all.filter((s) => s.title_slug === slug); // already newest-first

  const problem = solves[0]?.problem ?? null;
  const title = problemDisplay(problem, solves[0]?.title ?? slug);
  const difficulty: DifficultyKey =
    problem?.difficulty === 'Easy' ||
    problem?.difficulty === 'Medium' ||
    problem?.difficulty === 'Hard'
      ? problem.difficulty
      : 'Unknown';

  return (
    <main className="mx-auto max-w-4xl px-6 py-8">
      <Link
        href="/"
        className="text-xs text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
      >
        ← Dashboard
      </Link>

      {solves.length === 0 ? (
        <p className="mt-6 text-sm text-zinc-500 dark:text-zinc-400">
          No solves recorded for this problem.
        </p>
      ) : (
        <>
          <div className="mt-3 flex items-center gap-2">
            <a
              href={leetcodeUrl(slug)}
              target="_blank"
              rel="noopener noreferrer"
              className="group inline-flex items-center gap-1.5 text-lg font-semibold tracking-tight hover:underline"
              title="Open on LeetCode"
            >
              <h1>{title}</h1>
              <span
                aria-hidden
                className="text-zinc-400 transition-colors group-hover:text-zinc-600 dark:group-hover:text-zinc-300"
              >
                ↗
              </span>
            </a>
            <DifficultyBadge difficulty={difficulty} />
          </div>

          {problem?.topic_tags && problem.topic_tags.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {problem.topic_tags.map((t) => (
                <span
                  key={t}
                  className="rounded bg-zinc-100 px-1.5 py-0.5 text-xs text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
                >
                  {t}
                </span>
              ))}
            </div>
          )}

          <p className="mt-4 text-sm text-zinc-500 dark:text-zinc-400">
            Solved {solves.length} time{solves.length === 1 ? '' : 's'}.
          </p>

          <ul className="mt-3 divide-y divide-zinc-100 dark:divide-zinc-800">
            {solves.map((s) => (
              <li
                key={`${s.id}-${s.submitted_at}`}
                className="py-2.5 text-sm text-zinc-600 dark:text-zinc-300"
              >
                <Time iso={s.submitted_at} />
              </li>
            ))}
          </ul>
        </>
      )}
    </main>
  );
}
