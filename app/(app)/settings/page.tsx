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
        Updating your handle changes who the hourly poller tracks going forward.
        Submissions already recorded stay on your dashboard.
      </p>
    </main>
  );
}
