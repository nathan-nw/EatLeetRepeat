import Link from 'next/link';

// Public marketing landing page served at `/`. Signed-in users are redirected to
// `/dashboard` by the middleware before they ever reach this. No AppHeader / gate.
export default function LandingPage() {
  return (
    <main className="flex-1">
      {/* Slim top bar */}
      <header className="border-b border-zinc-200 dark:border-zinc-800">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-4 px-6 py-4">
          <span className="text-sm font-semibold tracking-tight">
            Eat Leet Repeat
          </span>
          <a
            href="#start"
            className="text-sm text-zinc-500 transition-colors hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
          >
            Sign in
          </a>
        </div>
      </header>

      {/* Hero */}
      <section className="mx-auto max-w-4xl px-6 pt-20 pb-16 sm:pt-28">
        <p className="text-sm font-medium text-emerald-600 dark:text-emerald-400">
          LeetCode, over time
        </p>
        <h1 className="mt-3 max-w-2xl text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
          Eat. Sleep. Leet. Repeat.
        </h1>
        <p className="mt-5 max-w-xl text-lg text-zinc-500 dark:text-zinc-400">
          The clearest way to track your prep while you&rsquo;re recruiting.
          Unlike a plain solved-count, we record every accepted submission —
          including the problems you go back and re-solve — so you can see what
          you&rsquo;ve truly drilled, not just what you cleared once. No manual
          logging.
        </p>
        <div className="mt-8 flex items-center gap-4">
          <a
            href="#start"
            className="rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90 dark:bg-white dark:text-zinc-900"
          >
            Get started
          </a>
          <a
            href="#features"
            className="text-sm font-medium text-zinc-500 transition-colors hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
          >
            See what you get →
          </a>
        </div>
      </section>

      {/* Heatmap showcase — the app's signature visual */}
      <section className="mx-auto max-w-4xl px-6 pb-16">
        <div className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">
              Your year of solving
            </p>
            <div className="flex items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400">
              <span>Less</span>
              {LEVELS.map((cls, i) => (
                <span key={i} className={`${CELL} ${cls}`} />
              ))}
              <span>More</span>
            </div>
          </div>
          <div className="mt-4 overflow-hidden">
            <DemoHeatmap />
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="mx-auto max-w-4xl px-6 pb-20">
        <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">
          Four ways to see your progress
        </h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {FEATURES.map((f) => (
            <div
              key={f.title}
              className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800"
            >
              <p className="font-medium">{f.title}</p>
              <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                {f.body}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* How it works + safety */}
      <section className="mx-auto max-w-4xl px-6 pb-20">
        <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">
          Only your public username — nothing more
        </h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-zinc-200 p-5 dark:border-zinc-800">
            <p className="font-medium">Just your public handle</p>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              Enter your public LeetCode username once. From then on we read only
              your public accepted submissions — no LeetCode password, no login,
              and no access to your account. That&rsquo;s all it takes to start
              tracking.
            </p>
          </div>
          <div className="rounded-xl border border-zinc-200 p-5 dark:border-zinc-800">
            <p className="font-medium">
              Optional: import your full history{' '}
              <span className="text-zinc-400 dark:text-zinc-500">
                — and it&rsquo;s safe
              </span>
            </p>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              The public API only exposes your recent solves. To bring in older
              ones, you can run a small export script — and you never have to take
              our word that it&rsquo;s safe:
            </p>
            <ul className="mt-3 flex flex-col gap-2 text-sm text-zinc-500 dark:text-zinc-400">
              {SAFETY_POINTS.map((point) => (
                <li key={point} className="flex gap-2">
                  <span
                    aria-hidden="true"
                    className="mt-0.5 text-emerald-600 dark:text-emerald-400"
                  >
                    ✓
                  </span>
                  <span>{point}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* Sign-in — the scroll target */}
      <section
        id="start"
        className="border-t border-zinc-200 dark:border-zinc-800"
      >
        <div className="mx-auto flex max-w-4xl flex-col items-center px-6 py-20 text-center">
          <h2 className="text-2xl font-semibold tracking-tight">
            Start tracking in seconds
          </h2>
          <p className="mt-2 max-w-sm text-sm text-zinc-500 dark:text-zinc-400">
            Create an account with your email and password, add your LeetCode
            handle, and you&rsquo;re done.
          </p>
          <div className="mt-8 flex items-center gap-4">
            <Link
              href="/login"
              className="rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90 dark:bg-white dark:text-zinc-900"
            >
              Create your account
            </Link>
            <Link
              href="/login"
              className="text-sm font-medium text-zinc-500 transition-colors hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
            >
              Sign in
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-zinc-200 dark:border-zinc-800">
        <div className="mx-auto flex max-w-4xl flex-col items-center justify-between gap-2 px-6 py-6 text-xs text-zinc-500 sm:flex-row dark:text-zinc-400">
          <span>Reads only your public LeetCode activity.</span>
          <span className="flex items-center gap-1.5">
            Made by
            <a
              href="https://github.com/nathan-nw"
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-zinc-700 underline-offset-2 transition-colors hover:text-zinc-900 hover:underline dark:text-zinc-300 dark:hover:text-zinc-100"
            >
              @nathan-nw
            </a>
            <span aria-hidden="true">·</span>
            <a
              href="https://x.com/Nathan_nww"
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-zinc-700 underline-offset-2 transition-colors hover:text-zinc-900 hover:underline dark:text-zinc-300 dark:hover:text-zinc-100"
            >
              @Nathan_nww on X
            </a>
          </span>
        </div>
      </footer>
    </main>
  );
}

// Sequential single-hue ramp (emerald), mirrored from components/heatmap.tsx so
// the marketing preview matches the real dashboard chart. Level 0 is neutral.
const LEVELS = [
  'bg-zinc-100 dark:bg-zinc-800/70',
  'bg-emerald-200 dark:bg-emerald-900',
  'bg-emerald-300 dark:bg-emerald-700',
  'bg-emerald-500 dark:bg-emerald-600',
  'bg-emerald-600 dark:bg-emerald-400',
];
const CELL = 'h-[11px] w-[11px] rounded-[2px]';

const FEATURES = [
  {
    title: 'Timeline',
    body: 'A running feed of your accepted submissions, newest first, with difficulty and tags.',
  },
  {
    title: 'Activity heatmap',
    body: 'A GitHub-style calendar of every solve — spot streaks and gaps at a glance.',
  },
  {
    title: 'Re-solves',
    body: 'The whole point: problems you’ve solved more than once, ranked by how often you return.',
  },
  {
    title: 'Per-problem history',
    body: 'Open any problem to see each distinct attempt over time, not just the latest.',
  },
];

// Honest, verifiable claims about the optional history-export script — these
// mirror what lib/export-snippet.ts actually does.
const SAFETY_POINTS = [
  'Read the entire script first — the full source is shown right on the import page before you copy it.',
  'It runs in your own browser, in the DevTools console on your logged-in LeetCode tab. Nothing runs on our servers.',
  'It never reads, prints, or transmits your password or session cookie — your login stays in your browser.',
  'Its only output is a file that downloads to your computer, which you then choose to upload. Nothing is sent anywhere automatically.',
];

// Continuously scrolling marquee of a decorative ~year-long contribution grid.
// Intensity is a fixed, deterministic function of the cell index (no randomness →
// no hydration surprises), shaped to look like real activity: busier weekdays, a
// couple of quiet stretches. Two identical copies sit side by side and the track
// translates by exactly one copy's width, so the loop is seamless. Columns carry
// a right margin (instead of a container gap) so the two copies butt together
// with consistent spacing — that's what makes -50% land perfectly.
function DemoHeatmap() {
  const weeks = 53;
  const days = 7;
  const columns: number[][] = [];
  for (let w = 0; w < weeks; w++) {
    const col: number[] = [];
    for (let d = 0; d < days; d++) {
      col.push(intensity(w, d));
    }
    columns.push(col);
  }

  const grid = (
    <div className="flex shrink-0">
      {columns.map((col, w) => (
        <div key={w} className="mr-[3px] flex flex-col gap-[3px]">
          {col.map((level, d) => (
            <span key={d} className={`${CELL} ${LEVELS[level]}`} />
          ))}
        </div>
      ))}
    </div>
  );

  return (
    <div className="flex w-max elr-heatmap-track" aria-hidden="true">
      <style>{MARQUEE_CSS}</style>
      {grid}
      {grid}
    </div>
  );
}

// Pure-CSS seamless marquee. Duplicated content + translateX(-50%) loops without
// a seam; paused only for users who prefer reduced motion.
const MARQUEE_CSS = `
.elr-heatmap-track {
  animation: elr-heatmap-scroll 60s linear infinite;
  will-change: transform;
}
@keyframes elr-heatmap-scroll {
  from { transform: translateX(0); }
  to { transform: translateX(-50%); }
}
@media (prefers-reduced-motion: reduce) {
  .elr-heatmap-track { animation: none; }
}
`;

function intensity(week: number, day: number): number {
  // Weekends lean quieter; two "vacation" weeks are near-empty; otherwise a
  // smooth pseudo-pattern across the year. Purely cosmetic.
  if (week === 12 || week === 34) return day === 3 ? 1 : 0;
  const base = (week * 7 + day * 3) % 11;
  const weekendPenalty = day === 0 || day === 6 ? 3 : 0;
  const score = base - weekendPenalty;
  if (score <= 0) return 0;
  if (score <= 2) return 1;
  if (score <= 5) return 2;
  if (score <= 8) return 3;
  return 4;
}
