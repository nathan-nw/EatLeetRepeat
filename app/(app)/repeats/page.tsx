import { getUserSubmissions } from '@/lib/dashboard';
import { computeRepeats } from '@/lib/stats';
import { RepeatsList } from '@/components/repeats-list';

export default async function RepeatsPage() {
  const submissions = await getUserSubmissions();
  const repeats = computeRepeats(submissions);

  return (
    <main className="mx-auto max-w-4xl px-6 py-8">
      <h1 className="text-lg font-semibold tracking-tight">Re-solves</h1>
      <p className="mt-1 mb-6 text-sm text-zinc-500 dark:text-zinc-400">
        Problems you&apos;ve solved more than once, most-repeated first — each with
        every solve date.
      </p>
      <RepeatsList groups={repeats} />
    </main>
  );
}
