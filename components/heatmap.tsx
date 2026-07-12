import type { Heatmap as HeatmapData } from '@/lib/stats';

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

export function Heatmap({ data }: { data: HeatmapData }) {
  return (
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
              {week.map((day, di) =>
                day === null ? (
                  <div key={di} className={CELL} />
                ) : (
                  <div
                    key={di}
                    className={`${CELL} ${LEVEL_CLASSES[day.level]}`}
                    title={`${day.count} submission${day.count === 1 ? '' : 's'} on ${day.date}`}
                  />
                ),
              )}
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
  );
}
