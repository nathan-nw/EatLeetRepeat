import type { DifficultyKey } from '@/lib/stats';

// Difficulty is categorical, but the label text is ALWAYS shown alongside the
// color — color is never the sole encoding (dataviz accessibility rule).
const STYLES: Record<DifficultyKey, string> = {
  Easy: 'text-emerald-700 bg-emerald-50 dark:text-emerald-300 dark:bg-emerald-950/60',
  Medium: 'text-amber-700 bg-amber-50 dark:text-amber-300 dark:bg-amber-950/60',
  Hard: 'text-rose-700 bg-rose-50 dark:text-rose-300 dark:bg-rose-950/60',
  Unknown: 'text-zinc-500 bg-zinc-100 dark:text-zinc-400 dark:bg-zinc-800',
};

export function DifficultyBadge({ difficulty }: { difficulty: DifficultyKey }) {
  return (
    <span
      className={`inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium ${STYLES[difficulty]}`}
    >
      {difficulty}
    </span>
  );
}
