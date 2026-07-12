'use client';

import { useRouter, usePathname } from 'next/navigation';
import type { Filters } from '@/lib/filters';

function buildQuery(f: Filters): string {
  const p = new URLSearchParams();
  if (f.difficulty) p.set('difficulty', f.difficulty);
  if (f.tag) p.set('tag', f.tag);
  if (f.from) p.set('from', f.from);
  if (f.to) p.set('to', f.to);
  const s = p.toString();
  return s ? `?${s}` : '';
}

const controlClass =
  'rounded-lg border border-zinc-300 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-950';

export function FilterBar({
  filters,
  tags,
}: {
  filters: Filters;
  tags: string[];
}) {
  const router = useRouter();
  const pathname = usePathname();

  const update = (patch: Partial<Filters>) => {
    router.push(`${pathname}${buildQuery({ ...filters, ...patch })}`);
  };

  const active = Boolean(
    filters.difficulty || filters.tag || filters.from || filters.to,
  );

  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        aria-label="Difficulty"
        className={controlClass}
        value={filters.difficulty ?? ''}
        onChange={(e) =>
          update({ difficulty: (e.target.value || null) as Filters['difficulty'] })
        }
      >
        <option value="">All difficulties</option>
        <option value="Easy">Easy</option>
        <option value="Medium">Medium</option>
        <option value="Hard">Hard</option>
      </select>

      <select
        aria-label="Topic tag"
        className={controlClass}
        value={filters.tag ?? ''}
        onChange={(e) => update({ tag: e.target.value || null })}
      >
        <option value="">All tags</option>
        {tags.map((t) => (
          <option key={t} value={t}>
            {t}
          </option>
        ))}
      </select>

      <label className="flex items-center gap-1 text-xs text-zinc-500 dark:text-zinc-400">
        From
        <input
          type="date"
          aria-label="From date"
          className={controlClass}
          value={filters.from ?? ''}
          max={filters.to ?? undefined}
          onChange={(e) => update({ from: e.target.value || null })}
        />
      </label>

      <label className="flex items-center gap-1 text-xs text-zinc-500 dark:text-zinc-400">
        To
        <input
          type="date"
          aria-label="To date"
          className={controlClass}
          value={filters.to ?? ''}
          min={filters.from ?? undefined}
          onChange={(e) => update({ to: e.target.value || null })}
        />
      </label>

      {active && (
        <button
          type="button"
          onClick={() => router.push(pathname)}
          className="rounded-lg px-2.5 py-1.5 text-sm text-zinc-500 underline-offset-2 hover:text-zinc-900 hover:underline dark:text-zinc-400 dark:hover:text-zinc-100"
        >
          Clear
        </button>
      )}
    </div>
  );
}
