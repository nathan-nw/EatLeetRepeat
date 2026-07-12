'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import type { Heatmap as HeatmapData, DayEntry } from '@/lib/stats';
import { DifficultyBadge } from '@/components/difficulty-badge';

// Sequential single-hue ramp (emerald), light→dark = low→high magnitude. Level 0
// is a recessive neutral, not a hue. Dark mode gets its own steps (brighter =
// higher), not an auto-flip.
const LEVEL_CLASSES = [
  'bg-zinc-100 dark:bg-zinc-800/70',
  'bg-emerald-200 dark:bg-emerald-900',
  'bg-emerald-300 dark:bg-emerald-700',
  'bg-emerald-500 dark:bg-emerald-600',
  'bg-emerald-600 dark:bg-emerald-400',
];

const CELL = 'h-[11px] w-[11px] rounded-[2px]';
const POPOVER_WIDTH = 288; // px, matches w-72

// Position is relative to the heatmap root (position: absolute), so the popover
// stays anchored to the day cell and scrolls with the page.
type Selected = { date: string; x: number; y: number };

function formatDay(dateKey: string): string {
  return new Date(`${dateKey}T00:00:00Z`).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function Heatmap({
  data,
  dayIndex,
}: {
  data: HeatmapData;
  dayIndex: Record<string, DayEntry[]>;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [selected, setSelected] = useState<Selected | null>(null);

  // Close on Escape.
  useEffect(() => {
    if (!selected) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelected(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selected]);

  const openDay = (date: string, el: HTMLElement) => {
    const root = rootRef.current;
    if (!root) return;
    const rootRect = root.getBoundingClientRect();
    const cellRect = el.getBoundingClientRect();
    // Cell position within the root, then clamp so the popover stays inside it.
    const rawLeft = cellRect.left - rootRect.left;
    const maxLeft = Math.max(0, root.clientWidth - POPOVER_WIDTH);
    const x = Math.max(0, Math.min(rawLeft, maxLeft));
    const y = cellRect.bottom - rootRect.top + 6;
    setSelected((prev) => (prev?.date === date ? null : { date, x, y }));
  };

  const entries = selected ? (dayIndex[selected.date] ?? []) : [];

  return (
    <div ref={rootRef} className="relative">
      <div className="overflow-x-auto">
        <div className="inline-flex min-w-full flex-col gap-1">
          {/* Month labels aligned to the week columns. */}
          <div className="flex gap-[3px] pl-[3px] text-[10px] text-zinc-400 dark:text-zinc-500">
            {data.weeks.map((_, i) => {
              const label = data.monthLabels.find((m) => m.index === i)?.label;
              return (
                <div key={i} className="w-[11px]">
                  {label ?? ''}
                </div>
              );
            })}
          </div>

          <div className="flex gap-[3px]">
            {data.weeks.map((week, wi) => (
              <div key={wi} className="flex flex-col gap-[3px]">
                {week.map((day, di) => {
                  if (day === null) return <div key={di} className={CELL} />;
                  const label = `${day.count} submission${day.count === 1 ? '' : 's'} on ${day.date}`;
                  if (day.count === 0) {
                    return (
                      <div
                        key={di}
                        className={`${CELL} ${LEVEL_CLASSES[0]}`}
                        title={label}
                      />
                    );
                  }
                  return (
                    <button
                      key={di}
                      type="button"
                      title={label}
                      aria-label={`${label}. Click to view problems.`}
                      onClick={(e) => openDay(day.date, e.currentTarget)}
                      className={`${CELL} ${LEVEL_CLASSES[day.level]} cursor-pointer outline-none ring-offset-1 focus-visible:ring-2 focus-visible:ring-zinc-400 ${
                        selected?.date === day.date ? 'ring-2 ring-zinc-500' : ''
                      }`}
                    />
                  );
                })}
              </div>
            ))}
          </div>

          {/* Legend + total. */}
          <div className="mt-1 flex items-center justify-between text-[11px] text-zinc-500 dark:text-zinc-400">
            <span>{data.total} submissions in the last year</span>
            <span className="flex items-center gap-1">
              Less
              {LEVEL_CLASSES.map((c, i) => (
                <span key={i} className={`${CELL} ${c}`} aria-hidden />
              ))}
              More
            </span>
          </div>
        </div>
      </div>

      {/* Day popover — absolute within the root so it anchors to the cell. */}
      {selected && (
        <>
          {/* click-away backdrop */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => setSelected(null)}
            aria-hidden
          />
          <div
            role="dialog"
            aria-label={`Problems on ${formatDay(selected.date)}`}
            className="absolute z-50 w-72 rounded-xl border border-zinc-200 bg-white p-3 shadow-lg dark:border-zinc-700 dark:bg-zinc-900"
            style={{ left: selected.x, top: selected.y }}
          >
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-medium text-zinc-700 dark:text-zinc-200">
                {formatDay(selected.date)}
              </span>
              <span className="text-[11px] text-zinc-400 dark:text-zinc-500">
                {entries.length} solved
              </span>
            </div>
            <ul className="flex max-h-64 flex-col gap-1.5 overflow-y-auto">
              {entries.map((e, i) => (
                <li key={`${e.slug}-${i}`} className="flex items-center gap-2">
                  <Link
                    href={`/problems/${e.slug}`}
                    className="min-w-0 flex-1 truncate text-sm hover:underline"
                    onClick={() => setSelected(null)}
                  >
                    {e.label}
                  </Link>
                  <DifficultyBadge difficulty={e.difficulty} />
                  <span className="shrink-0 text-[11px] tabular-nums text-zinc-400 dark:text-zinc-500">
                    {formatTime(e.iso)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
    </div>
  );
}
