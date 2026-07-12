'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import type { SubmissionWithProblem } from '@/lib/dashboard';
import type { Filters } from '@/lib/filters';
import {
  computeSummary,
  buildHeatmap,
  buildDayIndex,
  computeRepeats,
} from '@/lib/stats';
import { useFilters } from '@/components/use-filters';
import { SummaryStats } from '@/components/summary-stats';
import { Heatmap } from '@/components/heatmap';
import { Timeline } from '@/components/timeline';
import { FilterBar } from '@/components/filter-bar';

// Client dashboard: gets the full dataset once, then filters + re-aggregates in
// the browser as controls change (instant, no server round-trip).
export function DashboardView({
  all,
  initialFilters,
}: {
  all: SubmissionWithProblem[];
  initialFilters: Filters;
}) {
  const { filters, filtered, tags, update, clear } = useFilters(all, initialFilters);

  const summary = useMemo(() => computeSummary(filtered), [filtered]);
  const heatmap = useMemo(() => buildHeatmap(filtered), [filtered]);
  const dayIndex = useMemo(() => buildDayIndex(filtered), [filtered]);
  const hasRepeats = useMemo(() => computeRepeats(filtered).length > 0, [filtered]);

  return (
    <main className="mx-auto max-w-4xl px-6 py-8">
      <div className="mb-6">
        <FilterBar filters={filters} tags={tags} onChange={update} onClear={clear} />
      </div>

      <SummaryStats stats={summary} />

      <section className="mt-8">
        <h2 className="mb-3 text-sm font-semibold text-zinc-700 dark:text-zinc-300">
          Activity
        </h2>
        <div className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
          <Heatmap data={heatmap} dayIndex={dayIndex} />
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
        <Timeline submissions={filtered.slice(0, 50)} />
      </section>
    </main>
  );
}
