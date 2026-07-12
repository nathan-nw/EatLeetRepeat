import { getUserSubmissions } from '@/lib/dashboard';
import { computeRepeats } from '@/lib/stats';
import { parseFilters, applyFilters, allTags } from '@/lib/filters';
import { RepeatsList } from '@/components/repeats-list';
import { FilterBar } from '@/components/filter-bar';

export default async function RepeatsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const all = await getUserSubmissions();
  const filters = parseFilters(await searchParams);
  const submissions = applyFilters(all, filters);
  const repeats = computeRepeats(submissions);

  return (
    <main className="mx-auto max-w-4xl px-6 py-8">
      <h1 className="text-lg font-semibold tracking-tight">Re-solves</h1>
      <p className="mt-1 mb-6 text-sm text-zinc-500 dark:text-zinc-400">
        Problems you&apos;ve solved more than once, most-repeated first — each with
        every solve date.
      </p>

      <div className="mb-6">
        <FilterBar filters={filters} tags={allTags(all)} />
      </div>

      <RepeatsList groups={repeats} />
    </main>
  );
}
