'use client';

import type { Filters } from '@/lib/filters';

const controlClass =
  'rounded-lg border border-zinc-300 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-950';

// Controlled, presentational filter controls. State + URL sync live in the
// parent view (via useFilters); this component just reports changes upward, so
// changing a filter updates in-memory state instantly with no navigation.
export function FilterBar({
  filters,
  tags,
  onChange,
  onClear,
}: {
  filters: Filters;
  tags: string[];
  onChange: (patch: Partial<Filters>) => void;
  onClear: () => void;
}) {
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
          onChange({ difficulty: (e.target.value || null) as Filters['difficulty'] })
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
        onChange={(e) => onChange({ tag: e.target.value || null })}
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
          onChange={(e) => onChange({ from: e.target.value || null })}
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
          onChange={(e) => onChange({ to: e.target.value || null })}
        />
      </label>

      {active && (
        <button
          type="button"
          onClick={onClear}
          className="rounded-lg px-2.5 py-1.5 text-sm text-zinc-500 underline-offset-2 hover:text-zinc-900 hover:underline dark:text-zinc-400 dark:hover:text-zinc-100"
        >
          Clear
        </button>
      )}
    </div>
  );
}
