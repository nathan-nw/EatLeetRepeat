'use client';

import { useCallback, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { EXPORT_SNIPPET, EXPORT_FILENAME } from '@/lib/export-snippet';

const MAX_BYTES = 8 * 1024 * 1024; // keep in sync with lib/import.ts

type Result = {
  received: number;
  accepted: number;
  inserted: number;
  skipped: number;
  problems: number;
};

type Phase = 'idle' | 'uploading' | 'done' | 'error';

export function ImportClient() {
  const router = useRouter();
  const [copied, setCopied] = useState(false);
  const [showSource, setShowSource] = useState(false);
  const [showSafety, setShowSafety] = useState(false);
  const [phase, setPhase] = useState<Phase>('idle');
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const copyScript = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(EXPORT_SNIPPET);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setShowSource(true); // clipboard blocked — reveal source so they can select it
    }
  }, []);

  const upload = useCallback(
    async (file: File) => {
      setError(null);
      setResult(null);

      if (!/\.json$/i.test(file.name) && file.type !== 'application/json') {
        setPhase('error');
        setError('Please upload the leetcode-history.json file.');
        return;
      }
      if (file.size > MAX_BYTES) {
        setPhase('error');
        setError('That file is too large (max 8 MB).');
        return;
      }

      setPhase('uploading');
      try {
        const text = await file.text();
        const res = await fetch('/api/import', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: text,
        });
        const json = await res.json();
        if (!res.ok || !json.ok) {
          setPhase('error');
          setError(json.error ?? 'Import failed. Please try again.');
          return;
        }
        setResult({
          received: json.received,
          accepted: json.accepted,
          inserted: json.inserted,
          skipped: json.skipped,
          problems: json.problems,
        });
        setPhase('done');
        router.refresh(); // update dashboard/repeats with the new history
      } catch {
        setPhase('error');
        setError('Something went wrong reading or uploading the file.');
      }
    },
    [router],
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const file = e.dataTransfer.files?.[0];
      if (file) upload(file);
    },
    [upload],
  );

  return (
    <div className="mt-8 flex flex-col gap-8">
      {/* Safety explainer — linked from every mention of the import (§7.2). */}
      <section className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-900/40">
        <button
          type="button"
          onClick={() => setShowSafety((s) => !s)}
          className="flex w-full items-center justify-between text-left text-sm font-medium"
        >
          <span>🔒 How this works / Is this safe?</span>
          <span className="text-zinc-400">{showSafety ? '▲' : '▼'}</span>
        </button>
        {showSafety && (
          <div className="mt-3 space-y-2 text-sm text-zinc-600 dark:text-zinc-300">
            <p>
              The export script runs entirely in <strong>your own browser</strong>,
              using the LeetCode login you already have in that tab.
            </p>
            <p>
              It <strong>never reads your password or session cookie</strong> and
              sends nothing anywhere. The only thing that reaches our servers is the{' '}
              <code>{EXPORT_FILENAME}</code> file <em>you</em> choose to upload —
              a plain list of your solved problems.
            </p>
            <p>
              You can read the full script before running it (“View the script”
              below). We ask you to paste code into your console, so you deserve
              plainly readable source.
            </p>
          </div>
        )}
      </section>

      {/* Numbered walkthrough (§7.1 step 5). */}
      <ol className="flex flex-col gap-6">
        <Step n={1} title="Open LeetCode and make sure you're logged in.">
          <p>
            Open{' '}
            <a
              href="https://leetcode.com"
              target="_blank"
              rel="noreferrer"
              className="underline underline-offset-2"
            >
              leetcode.com
            </a>{' '}
            in a new tab. You must be signed in for this to work.
          </p>
        </Step>

        <Step n={2} title="Open your browser console.">
          <p>
            Press <kbd>F12</kbd> (Windows/Linux) or <kbd>⌘</kbd>+<kbd>⌥</kbd>+
            <kbd>I</kbd> (Mac), then click the <strong>Console</strong> tab.
          </p>
          <p className="text-zinc-500 dark:text-zinc-400">
            If you see a red warning about pasting code, that&rsquo;s normal — it
            appears for everyone. Read the script below before pasting; it only
            reads your own submission list. Some browsers require you to type{' '}
            <code>allow pasting</code> first.
          </p>
        </Step>

        <Step n={3} title="Copy our export script.">
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={copyScript}
              className="rounded-lg bg-zinc-900 px-3 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 dark:bg-white dark:text-zinc-900"
            >
              {copied ? '✓ Copied' : '📋 Copy script'}
            </button>
            <button
              type="button"
              onClick={() => setShowSource((s) => !s)}
              className="text-sm text-zinc-500 underline underline-offset-2 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
            >
              {showSource ? 'Hide the script' : 'View the script'}
            </button>
          </div>
          {showSource && (
            <pre className="mt-3 max-h-80 overflow-auto rounded-lg border border-zinc-200 bg-zinc-950 p-3 text-xs leading-relaxed text-zinc-100 dark:border-zinc-800">
              <code>{EXPORT_SNIPPET}</code>
            </pre>
          )}
        </Step>

        <Step n={4} title="Paste it into the console and press Enter.">
          <p>
            You&rsquo;ll see progress messages like{' '}
            <code>fetched 240, hasNext=true</code>. <strong>Leave the tab open</strong>{' '}
            — a long history can take a few minutes. It&rsquo;s paced deliberately
            so LeetCode doesn&rsquo;t rate-limit you.
          </p>
        </Step>

        <Step n={5} title="Your file downloads automatically.">
          <p>
            When it finishes, <code>{EXPORT_FILENAME}</code> saves to your Downloads
            folder.
          </p>
        </Step>

        <Step n={6} title="Upload it here.">
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            onClick={() => inputRef.current?.click()}
            className={`flex cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed px-6 py-10 text-center text-sm transition-colors ${
              dragging
                ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/30'
                : 'border-zinc-300 hover:border-zinc-400 dark:border-zinc-700 dark:hover:border-zinc-600'
            }`}
          >
            <span className="font-medium">
              {phase === 'uploading'
                ? 'Importing…'
                : 'Drop leetcode-history.json here'}
            </span>
            <span className="text-zinc-500 dark:text-zinc-400">
              or click to choose the file
            </span>
            <input
              ref={inputRef}
              type="file"
              accept=".json,application/json"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) upload(file);
                e.target.value = '';
              }}
            />
          </div>

          {phase === 'error' && error && (
            <p className="mt-3 text-sm text-red-600 dark:text-red-400">{error}</p>
          )}
        </Step>
      </ol>

      {/* Step 7 — completion summary (§7.1 step 6). */}
      {phase === 'done' && result && (
        <section className="rounded-xl border border-emerald-300 bg-emerald-50 p-5 dark:border-emerald-800 dark:bg-emerald-950/30">
          <h2 className="text-base font-semibold">✅ Import complete</h2>
          <p className="mt-2 text-sm text-zinc-700 dark:text-zinc-200">
            Imported <strong>{result.inserted.toLocaleString()}</strong> new{' '}
            {result.inserted === 1 ? 'solve' : 'solves'} across{' '}
            <strong>{result.problems.toLocaleString()}</strong>{' '}
            {result.problems === 1 ? 'problem' : 'problems'}.
            {result.skipped > 0 && (
              <>
                {' '}
                {result.skipped.toLocaleString()} were already recorded.
              </>
            )}
          </p>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            Problem details (difficulty, tags) fill in over the next few minutes.
          </p>
          <Link
            href="/"
            className="mt-4 inline-block rounded-lg bg-zinc-900 px-3 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 dark:bg-white dark:text-zinc-900"
          >
            See my timeline →
          </Link>
        </section>
      )}

      {/* Troubleshooting + retention expectations (§7.2). */}
      <section className="text-sm text-zinc-500 dark:text-zinc-400">
        <h3 className="font-medium text-zinc-700 dark:text-zinc-300">
          Troubleshooting
        </h3>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>
            <strong>Nothing happens / errors out:</strong> usually rate-limiting.
            Wait ~10 minutes and re-run the script.
          </li>
          <li>
            <strong>Console blocks the paste:</strong> type{' '}
            <code>allow pasting</code> and press Enter, then paste again.
          </li>
          <li>
            <strong>Not logged in:</strong> sign in to LeetCode in that tab first.
          </li>
          <li>
            <strong>Short history:</strong> LeetCode only keeps so much — whatever
            the export returns is what they retained. Some accounts go back years,
            others only months. We can&rsquo;t recover what they&rsquo;ve aged out.
          </li>
        </ul>
      </section>
    </div>
  );
}

function Step({
  n,
  title,
  children,
}: {
  n: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <li className="flex gap-4">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-zinc-900 text-sm font-semibold text-white dark:bg-white dark:text-zinc-900">
        {n}
      </span>
      <div className="flex flex-col gap-2 pt-0.5">
        <h3 className="text-sm font-semibold">{title}</h3>
        <div className="space-y-2 text-sm text-zinc-600 dark:text-zinc-300">
          {children}
        </div>
      </div>
    </li>
  );
}
