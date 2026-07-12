import Link from 'next/link';
import { getProfile } from '@/lib/auth';
import { SettingsForm } from './settings-form';

export default async function SettingsPage() {
  // The (app) layout already guarantees an onboarded profile.
  const profile = await getProfile();

  return (
    <main className="mx-auto max-w-4xl px-6 py-8">
      <h1 className="text-lg font-semibold tracking-tight">Settings</h1>
      <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
        Change the LeetCode account this tracker follows.
      </p>

      <SettingsForm current={profile?.leetcode_username ?? ''} />

      <p className="mt-6 max-w-sm text-xs text-zinc-400 dark:text-zinc-500">
        Updating your handle changes who the poller tracks going forward.
        Submissions already recorded stay on your dashboard.
      </p>

      <hr className="my-8 border-zinc-200 dark:border-zinc-800" />

      <h2 className="text-base font-semibold tracking-tight">History import</h2>
      <p className="mt-1 max-w-sm text-sm text-zinc-500 dark:text-zinc-400">
        Bring in your full solved history from before you signed up. Runs entirely
        in your own browser — we never see your password or session.
      </p>
      <Link
        href="/import"
        className="mt-3 inline-block rounded-lg border border-zinc-300 px-3 py-2 text-sm font-medium transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
      >
        Import my history →
      </Link>
    </main>
  );
}
