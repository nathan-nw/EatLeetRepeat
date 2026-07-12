import { getUserSubmissions } from '@/lib/dashboard';
import { parseFilters } from '@/lib/filters';
import { RepeatsView } from '@/components/repeats-view';

export default async function RepeatsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // Fetch the full dataset once; filtering + repeats computation happen client-side.
  const all = await getUserSubmissions();
  const initialFilters = parseFilters(await searchParams);

  return <RepeatsView all={all} initialFilters={initialFilters} />;
}
