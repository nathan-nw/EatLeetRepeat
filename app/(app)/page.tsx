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

  return <DashboardView all={all} initialFilters={initialFilters} />;
}
