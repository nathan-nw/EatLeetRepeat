import { redirect } from 'next/navigation';
import { getProfile, requireUser } from '@/lib/auth';

export default async function Home() {
  const { user } = await requireUser();

  // No handle yet → finish onboarding first.
  const profile = await getProfile();
  if (!profile) {
    redirect('/onboarding');
  }

  return (
    <main className="flex flex-1 flex-col items-center justify-center px-6 text-center">
      <h1 className="text-3xl font-semibold tracking-tight">Eat Leet Repeat</h1>
      <p className="mt-3 text-zinc-500 dark:text-zinc-400">
        Connected as{' '}
        <span className="font-medium text-zinc-800 dark:text-zinc-200">
          {profile.leetcode_username}
        </span>
      </p>
      <p className="mt-1 text-sm text-zinc-400 dark:text-zinc-500">
        {user.email}
      </p>
      <p className="mt-6 max-w-md text-sm text-zinc-500 dark:text-zinc-400">
        Your dashboard is coming next — timeline, heatmap, repeats, and
        per-problem history. The poller will start filling it on the next run.
      </p>

      <form action="/auth/signout" method="post" className="mt-8">
        <button
          type="submit"
          className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
        >
          Sign out
        </button>
      </form>
    </main>
  );
}
