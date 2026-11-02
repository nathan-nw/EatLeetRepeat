import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getProfile, getSessionUser } from '@/lib/auth';
import { INVITE_TOKEN } from '@/lib/teams';
import { previewTeam } from '@/app/teams-actions';
import { JoinTeam } from '@/components/team-controls';

export const dynamic = 'force-dynamic';
export const metadata = { referrer: 'no-referrer' as const, robots: { index: false, follow: false } };

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!INVITE_TOKEN.test(token)) return <Unavailable />;
  const next = `/invite/${token}`;
  if (!await getSessionUser()) redirect(`/login?next=${encodeURIComponent(next)}`);
  if (!await getProfile()) redirect(`/onboarding?next=${encodeURIComponent(next)}`);
  const preview = await previewTeam(token);
  if (!preview) return <Unavailable />;
  return <JoinTeam token={token} name={preview.name} />;
}

function Unavailable() {
  return <main className="mx-auto max-w-md px-6 py-16"><h1 className="text-xl font-semibold">Invitation unavailable</h1><p className="mt-3 text-sm text-zinc-500">This link may have been reset or the team deleted. Ask the owner for a new invitation.</p><Link className="mt-4 inline-block underline" href="/teams">Go to teams</Link></main>;
}
