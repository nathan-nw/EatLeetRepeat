'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useTransition } from 'react';
import { manageTeam } from '@/app/teams-actions';
import type { TeamMember } from '@/lib/teams';

export const teamInput = 'rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm dark:border-zinc-700';
export const teamButton = 'rounded-lg border border-zinc-300 px-3 py-2 text-sm hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-800';

function InviteLink({ token }: { token: string }) {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');
  const url = `${typeof window === 'undefined' ? '' : window.location.origin}/invite/${token}`;
  return <div className="my-3 rounded-lg border border-emerald-300 p-3 dark:border-emerald-800">
    <p className="text-sm font-medium">Your reusable invitation</p>
    <p className="mt-1 text-xs text-zinc-500">Anyone with this link can join. Save it now; only its hash is stored. Resetting it invalidates the previous link.</p>
    <label className="mt-2 block text-xs">Invite link<input aria-label="Invite link" readOnly value={url} className={`${teamInput} mt-1 w-full`} onFocus={(e) => e.target.select()} /></label>
    <button type="button" className={`${teamButton} mt-2`} onClick={async () => {
      try { await navigator.clipboard.writeText(url); setCopied(true); setError(''); }
      catch { setError('Select and copy the link above.'); }
    }}>{copied ? 'Copied' : 'Copy invite link'}</button>
    {error && <p role="status" className="text-sm">{error}</p>}
  </div>;
}

export function CreateTeam() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [result, setResult] = useState<{ id?: string; token?: string; error?: string }>({});
  return <section className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
    <h2 className="font-semibold">Create a team</h2>
    <p className="mt-1 text-sm text-zinc-500">Private groups for up to 20 people. Members share all recorded solves, including imported history.</p>
    <form className="mt-3 flex flex-wrap gap-2" onSubmit={(e) => {
      e.preventDefault(); const form = e.currentTarget;
      const name = String(new FormData(form).get('name') ?? '');
      start(async () => {
        try {
          const response = await manageTeam({ action: 'create', name }); setResult(response);
          if (!response.error) { form.reset(); router.refresh(); }
        } catch { setResult({ error: 'Could not create the team. Please try again.' }); }
      });
    }}>
      <input aria-label="Team name" name="name" required maxLength={80} placeholder="Team name" className={`${teamInput} min-w-0 flex-1`} />
      <button disabled={pending} className={teamButton}>{pending ? 'Creating…' : 'Create team'}</button>
    </form>
    {result.error && <p role="alert" className="mt-2 text-sm text-red-600">{result.error}</p>}
    {result.token && <InviteLink token={result.token} />}
    {result.id && <Link className="text-sm underline" href={`/teams/${result.id}`}>Open your team →</Link>}
  </section>;
}

export function JoinTeam({ token, name }: { token: string; name: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState('');
  return <div className="mx-auto max-w-md px-6 py-16">
    <h1 className="text-2xl font-semibold">Join {name}</h1>
    <p className="mt-4 text-sm text-zinc-500">Joining shares all your recorded accepted submissions with this team, including past solves and imported history. You can leave at any time; your activity will then disappear from the team view.</p>
    <button className={`${teamButton} mt-6`} disabled={pending} onClick={() => start(async () => {
      try {
        const result = await manageTeam({ action: 'join', token });
        if (result.error) setError(result.error);
        else router.replace(`/teams/${result.id}`);
      } catch { setError('Could not join. Please try again.'); }
    })}>{pending ? 'Joining…' : 'Join team and share history'}</button>
    <Link href="/teams" className="ml-4 text-sm underline">Cancel</Link>
    {error && <p role="alert" className="mt-3 text-sm text-red-600">{error}</p>}
  </div>;
}

export function TeamManagement({ id, name, ownerId, userId, members, onChanged }: {
  id: string; name: string; ownerId: string; userId: string; members: TeamMember[]; onChanged: () => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [token, setToken] = useState('');
  const [target, setTarget] = useState('');
  const dropdown = useRef<HTMLDetailsElement>(null);
  const owner = ownerId === userId;
  useEffect(() => {
    const closeOutside = (event: PointerEvent) => {
      if (dropdown.current && !dropdown.current.contains(event.target as Node)) dropdown.current.open = false;
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && dropdown.current?.open) {
        dropdown.current.open = false;
        dropdown.current.querySelector('summary')?.focus();
      }
    };
    document.addEventListener('pointerdown', closeOutside);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOutside);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, []);
  function run(action: 'rename' | 'reset' | 'remove' | 'remove_reset' | 'transfer' | 'leave' | 'delete', newName?: string) {
    const prompts: Record<string, string> = {
      reset: 'Invalidate the current invite link and generate a new one?',
      remove: 'Remove this member and their activity from the team? They can rejoin if they still have the invite link.',
      remove_reset: 'Remove this member and invalidate the invite link for everyone?',
      transfer: 'Transfer ownership to this member? You will lose owner controls.',
      leave: 'Leave this team? Your activity will disappear from its shared view.',
      delete: 'Delete this team for everyone? Personal submissions will be preserved.',
    };
    if (prompts[action] && !window.confirm(prompts[action])) return;
    start(async () => {
      setError(''); setNotice('');
      try {
        const result = await manageTeam({ action, teamId: id, name: newName, target });
        if (result.error) { setError(result.error); return; }
        if (result.token) setToken(result.token);
        if (action === 'transfer') setToken('');
        if (action === 'delete' || action === 'leave') { router.replace('/teams'); router.refresh(); }
        else { setNotice('Team updated.'); setTarget(''); onChanged(); }
      } catch { setError('Could not update the team. Please try again.'); }
    });
  }
  return <details ref={dropdown} className="relative" onBlur={(event) => {
    if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget as Node)) event.currentTarget.open = false;
  }}>
    <summary className="flex cursor-pointer list-none items-center gap-1 rounded-lg px-2 py-2 text-xs text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 focus-visible:outline-2 focus-visible:outline-emerald-500 dark:hover:bg-zinc-800 dark:hover:text-zinc-100 [&::-webkit-details-marker]:hidden">
      {owner ? 'Team settings' : 'Membership'}
      <svg aria-hidden="true" width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="m3 4.5 3 3 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
    </summary>
    <div className="absolute right-0 top-full z-30 mt-2 max-h-[70vh] w-[min(24rem,calc(100vw-2rem))] space-y-4 overflow-y-auto rounded-xl border border-zinc-200 bg-white p-4 shadow-lg dark:border-zinc-700 dark:bg-zinc-950">
      {owner ? <>
        <form className="flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); run('rename', String(new FormData(e.currentTarget).get('name'))); }}>
          <input key={name} aria-label="Team name" name="name" defaultValue={name} required maxLength={80} className={`${teamInput} min-w-0 flex-1`} />
          <button className={teamButton} disabled={pending}>Rename</button>
        </form>
        <p className="text-xs text-zinc-500">Generate an invite link to add people. This replaces the previous link.</p>
        <button className={teamButton} disabled={pending} onClick={() => run('reset')}>Reset / generate invite link</button>
        {token && <InviteLink token={token} />}
        <label className="block text-sm">Member
          <select aria-label="Member" className={`${teamInput} ml-2 max-w-full`} value={target} onChange={(e) => setTarget(e.target.value)}>
            <option value="">Choose a member</option>
            {members.filter((m) => m.id !== ownerId).map((m) => <option key={m.id} value={m.id}>{m.handle}</option>)}
          </select>
        </label>
        <div className="flex flex-wrap gap-2">
          <button disabled={pending || !target} className={teamButton} onClick={() => run('remove')}>Remove</button>
          <button disabled={pending || !target} className={teamButton} onClick={() => run('remove_reset')}>Remove and reset invite</button>
          <button disabled={pending || !target} className={teamButton} onClick={() => run('transfer')}>Transfer ownership</button>
        </div>
        <p className="text-xs text-zinc-500">Removed members can rejoin using the old invite unless you reset it.</p>
        <p className="text-xs text-zinc-500">To leave, transfer ownership first or delete the team.</p>
        <button disabled={pending} className={`${teamButton} text-red-600`} onClick={() => run('delete')}>Delete team</button>
      </> : <button disabled={pending} className={teamButton} onClick={() => run('leave')}>Leave team</button>}
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      {notice && <p role="status" className="text-sm">{notice}</p>}
    </div>
  </details>;
}
