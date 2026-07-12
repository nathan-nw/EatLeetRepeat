// Single source of truth for the browser export snippet users paste into their
// console. Both the "Copy script" button and the "View source" disclosure on the
// import page render from EXPORT_SNIPPET verbatim (spec §7.2 — the full source
// must be readable before copying). No 'server-only' here: the string is shown in
// the client UI.
//
// ⚠️ STUB. The real fetch/pagination loop is finished once the authenticated
// query is captured — see scripts/export-snippet/query.graphql (spec §6.2). The
// OUTPUT CONTRACT is already final: a downloaded `leetcode-history.json` that is a
// JSON array of { id, title, titleSlug, timestamp } (timestamp = Unix seconds).
// /api/import and the UI depend only on that contract, not on this body.

export const EXPORT_FILENAME = 'leetcode-history.json';

// Non-negotiable pacing: 1500ms between pages so the user's own account isn't
// rate-limited during the one burst of requests this makes (spec §6.3).
export const EXPORT_PAGE_DELAY_MS = 1500;

export const EXPORT_SNIPPET = `/*
 * Eat Leet Repeat — LeetCode history export
 * ------------------------------------------------------------------
 * WHAT THIS DOES: reads YOUR OWN accepted-submissions list from
 * leetcode.com using the login you already have in this browser tab,
 * and downloads it as a file (${EXPORT_FILENAME}).
 *
 * WHAT IT DOES NOT DO: it never reads, prints, or transmits your
 * password or session cookie. The cookie stays in your browser — it is
 * applied automatically by 'credentials: include' and is never touched
 * by this code. Nothing is sent anywhere; the ONLY output is a file
 * that downloads to your computer, which you then choose to upload.
 *
 * Read it top to bottom before running. Paste into the DevTools Console
 * on an open, logged-in leetcode.com tab, then press Enter.
 * ------------------------------------------------------------------
 */
(async () => {
  const PAGE_DELAY_MS = ${EXPORT_PAGE_DELAY_MS}; // polite pacing — do not lower
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // Only ever the fields we need. Everything else is dropped.
  const pick = (s) => ({
    id: String(s.id),
    title: s.title,
    titleSlug: s.titleSlug,
    timestamp: String(s.timestamp), // Unix epoch SECONDS
  });

  const out = [];
  let offset = 0;
  const PAGE = 20;

  // TODO(nathan): replace with the captured authenticated query + response
  // paths from scripts/export-snippet/query.graphql. Structure the loop per the
  // captured shape (global feed = simple paginate; per-problem = list solved
  // problems then paginate each). Filter to ACCEPTED before pushing.
  /*
  while (true) {
    const res = await fetch('/graphql', {
      method: 'POST',
      credentials: 'include',            // browser attaches your cookie; we never read it
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: QUERY,                    // from query.graphql
        variables: { offset, limit: PAGE },
      }),
    });
    const json = await res.json();
    const page = json.data.<submissions-array-path>;    // e.g. submissionList.submissions
    const accepted = page.filter((s) => s.<statusField> === '<acceptedValue>');
    out.push(...accepted.map(pick));
    console.log('fetched ' + out.length + ', hasNext=' + json.data.<hasNextPath>);
    if (!json.data.<hasNextPath>) break;
    offset += PAGE;
    await sleep(PAGE_DELAY_MS);
  }
  */

  if (out.length === 0) {
    console.warn(
      'Export snippet is not finished yet (awaiting the captured query). ' +
        'No file was downloaded.',
    );
    return;
  }

  // Trigger the download of ${EXPORT_FILENAME}.
  const blob = new Blob([JSON.stringify(out)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = '${EXPORT_FILENAME}';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  console.log('Done — downloaded ' + out.length + ' accepted submissions.');
})();
`;
