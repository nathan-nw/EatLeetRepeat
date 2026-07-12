import { ImportClient } from './import-client';

export default function ImportPage() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-8">
      <h1 className="text-lg font-semibold tracking-tight">
        Import your LeetCode history
      </h1>
      <p className="mt-2 max-w-prose text-sm text-zinc-500 dark:text-zinc-400">
        LeetCode&rsquo;s public API only exposes your last 20 solves, so we track
        forward automatically from here. To also see your <em>full</em> timeline,
        heatmap, and re-solves, export your history yourself — it runs entirely in
        your own browser and takes about two minutes.
      </p>

      <ImportClient />
    </main>
  );
}
