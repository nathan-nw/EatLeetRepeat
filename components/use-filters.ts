'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { SubmissionWithProblem } from '@/lib/dashboard';
import {
  type Filters,
  EMPTY_FILTERS,
  allTags,
  applyFilters,
  buildQuery,
} from '@/lib/filters';

// Client-side filter state for a view. The full (unfiltered) dataset is fetched
// once server-side and handed in as `all`; filtering + URL sync then happen
// entirely in the browser, so changing a control never triggers a server
// navigation or DB round-trip.
export function useFilters(all: SubmissionWithProblem[], initial: Filters) {
  const [filters, setFilters] = useState(initial);

  // Options come from the UNFILTERED set so they don't vanish as filters narrow.
  const tags = useMemo(() => allTags(all), [all]);
  const filtered = useMemo(() => applyFilters(all, filters), [all, filters]);

  // Sync the URL to the current filters after each change, without navigating
  // (keeps views shareable/bookmarkable; Next.js keeps its router in sync with
  // history.replaceState — no refetch). Runs in an effect (post-commit) so we
  // never touch the Router during render. On mount this is a no-op: `filters`
  // already reflects the URL the server parsed.
  useEffect(() => {
    window.history.replaceState(null, '', buildQuery(filters) || window.location.pathname);
  }, [filters]);

  const update = useCallback((patch: Partial<Filters>) => {
    setFilters((prev) => ({ ...prev, ...patch }));
  }, []);

  const clear = useCallback(() => update(EMPTY_FILTERS), [update]);

  return { filters, filtered, tags, update, clear };
}
