import Link from 'next/link';
import type { Problem } from '@/lib/database.types';

// Canonical problem display: `#{frontend_id} · {title}` (CLAUDE.md rule #7).
// Falls back to the submission title when problem metadata isn't enriched yet.
export function problemDisplay(
  problem: Problem | null,
  fallbackTitle: string,
): string {
  if (problem?.frontend_id) {
    return `#${problem.frontend_id} · ${problem.title}`;
  }
  return problem?.title ?? fallbackTitle;
}

export function ProblemLabel({
  slug,
  problem,
  fallbackTitle,
  className = '',
}: {
  slug: string;
  problem: Problem | null;
  fallbackTitle: string;
  className?: string;
}) {
  return (
    <Link
      href={`/problems/${slug}`}
      className={`font-medium hover:underline ${className}`}
    >
      {problemDisplay(problem, fallbackTitle)}
    </Link>
  );
}
