import Link from 'next/link';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { TeamSummary } from '@/lib/teams';
import { CreateTeam } from '@/components/team-controls';

export const dynamic = 'force-dynamic';

export default async function TeamsPage() {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('team_list');
  const teams = (data ?? []) as unknown as TeamSummary[];
  return <main className="mx-auto w-full max-w-4xl space-y-6 px-6 py-8">
    <div><h1 className="text-2xl font-semibold">Teams</h1><p className="mt-2 text-sm text-zinc-500">Practice together. See when your study group shows up and what everyone is solving.</p></div>
    {error ? <p role="alert">Teams could not be loaded. Please refresh and try again.</p> : teams.length ?
      <ul className="grid gap-3 sm:grid-cols-2">{teams.map((team) => <li key={team.id}>
        <Link href={`/teams/${team.id}`} className="block rounded-xl border border-zinc-200 p-4 hover:border-emerald-500 dark:border-zinc-800">
          <h2 className="break-words font-medium">{team.name}</h2><p className="mt-1 text-sm text-zinc-500">{team.memberCount} / 20 members · Private</p>
        </Link>
      </li>)}</ul> : <p className="text-sm text-zinc-500">No teams yet. Create one below or join using an invitation from a friend.</p>}
    <CreateTeam />
  </main>;
}
