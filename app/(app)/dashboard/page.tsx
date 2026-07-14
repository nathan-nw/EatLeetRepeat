import Link from 'next/link';
import { getUserSubmissions } from '@/lib/dashboard';
import { parseFilters } from '@/lib/filters';
import { DashboardView } from '@/components/dashboard-view';

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // Fetch the full dataset once; filtering + aggregation happen client-side.
  const all = await getUserSubmissions();
  const initialFilters = parseFilters(await searchParams);

  // Non-blocking nudge: if they've never imported, offer it once here (§7).
  const hasImport = all.some((s) => s.source === 'import');

  return (
    <>
      {!hasImport && <ImportOffer />}
      <DashboardView all={all} initialFilters={initialFilters} />
    </>
  );
}

function ImportOffer() {
  return (
    <div className="mx-auto max-w-4xl px-6 pt-6">
      <div className="flex flex-col items-start justify-between gap-3 rounded-xl border border-zinc-200 bg-zinc-50 p-4 sm:flex-row sm:items-center dark:border-zinc-800 dark:bg-zinc-900/40">
        <div className="text-sm">
          <p className="font-medium">Want your full history?</p>
          <p className="mt-0.5 text-zinc-500 dark:text-zinc-400">
            We only see your last 20 solves via the public API. Import the rest —
            it runs in your own browser and takes ~2 minutes.
          </p>
        </div>
        <Link
          href="/import"
          className="shrink-0 rounded-lg bg-zinc-900 px-3 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 dark:bg-white dark:text-zinc-900"
        >
          Import my history
        </Link>
      </div>
    </div>
  );
}
