import Link from 'next/link';
import { getUserSubmissions } from '@/lib/dashboard';
import { computeSummary, buildHeatmap, computeRepeats } from '@/lib/stats';
import { parseFilters, applyFilters, allTags } from '@/lib/filters';
import { SummaryStats } from '@/components/summary-stats';
import { Heatmap } from '@/components/heatmap';
import { Timeline } from '@/components/timeline';
import { FilterBar } from '@/components/filter-bar';

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const all = await getUserSubmissions();
  const filters = parseFilters(await searchParams);
  const submissions = applyFilters(all, filters);

  const summary = computeSummary(submissions);
  const heatmap = buildHeatmap(submissions);
  const hasRepeats = computeRepeats(submissions).length > 0;

  return (
    <main className="mx-auto max-w-4xl px-6 py-8">
      <div className="mb-6">
        <FilterBar filters={filters} tags={allTags(all)} />
      </div>

      <SummaryStats stats={summary} />

      <section className="mt-8">
        <h2 className="mb-3 text-sm font-semibold text-zinc-700 dark:text-zinc-300">
          Activity
        </h2>
        <div className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
          <Heatmap data={heatmap} />
        </div>
      </section>

      <section className="mt-8">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">
            Recent activity
          </h2>
          {hasRepeats && (
            <Link
              href="/repeats"
              className="text-xs text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
            >
              View re-solves →
            </Link>
          )}
        </div>
        <Timeline submissions={submissions.slice(0, 50)} />
      </section>
    </main>
  );
}
