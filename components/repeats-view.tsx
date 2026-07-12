'use client';

import { useMemo } from 'react';
import type { SubmissionWithProblem } from '@/lib/dashboard';
import type { Filters } from '@/lib/filters';
import { computeRepeats } from '@/lib/stats';
import { useFilters } from '@/components/use-filters';
import { RepeatsList } from '@/components/repeats-list';
import { FilterBar } from '@/components/filter-bar';

// Client re-solves view: full dataset in, filter + recompute repeats in-browser.
export function RepeatsView({
  all,
  initialFilters,
}: {
  all: SubmissionWithProblem[];
  initialFilters: Filters;
}) {
  const { filters, filtered, tags, update, clear } = useFilters(all, initialFilters);
  const repeats = useMemo(() => computeRepeats(filtered), [filtered]);

  return (
    <main className="mx-auto max-w-4xl px-6 py-8">
      <h1 className="text-lg font-semibold tracking-tight">Re-solves</h1>
      <p className="mt-1 mb-6 text-sm text-zinc-500 dark:text-zinc-400">
        Problems you&apos;ve solved more than once, most-repeated first — each with
        every solve date.
      </p>

      <div className="mb-6">
        <FilterBar filters={filters} tags={tags} onChange={update} onClear={clear} />
      </div>

      <RepeatsList groups={repeats} />
    </main>
  );
}
