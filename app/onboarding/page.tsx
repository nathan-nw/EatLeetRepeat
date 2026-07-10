import { redirect } from 'next/navigation';
import { getProfile, requireUser } from '@/lib/auth';
import { OnboardingForm } from './onboarding-form';

export default async function OnboardingPage() {
  await requireUser();

  // Already connected a handle? Skip onboarding.
  const profile = await getProfile();
  if (profile) {
    redirect('/');
  }

  return (
    <main className="flex flex-1 flex-col items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-semibold tracking-tight">
          Connect your LeetCode
        </h1>
        <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
          Enter your public LeetCode username. We’ll track your accepted
          submissions over time — including re-solves. You can change this later.
        </p>
        <OnboardingForm />
      </div>
    </main>
  );
}
