import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { parseTeamFilters } from '@/lib/teams';
import { readTeam } from '@/app/teams-actions';
import { TeamView } from '@/components/team-view';

export const dynamic = 'force-dynamic';

export default async function TeamPage({ params, searchParams }: {
  params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { user } = await requireUser();
  const { id } = await params;
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(await searchParams)) {
    if (Array.isArray(value)) value.forEach((v) => query.append(key, v));
    else if (value !== undefined) query.set(key, value);
  }
  const filters = parseTeamFilters(query);
  const result = await readTeam(id, filters);
  if (!result.data) return <main className="mx-auto max-w-4xl px-6 py-8"><h1 className="text-xl font-semibold">Team unavailable</h1><p className="mt-3">{result.error}</p><Link href="/teams" className="mt-4 inline-block underline">Back to teams</Link></main>;
  return <TeamView key={query.toString()} initial={result.data} filters={filters} userId={user.id} />;
}
