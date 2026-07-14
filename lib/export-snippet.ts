// Single source of truth for the browser export snippet users paste into their
// console. Both the "Copy script" button and the "View source" disclosure on the
// import page render from EXPORT_SNIPPET verbatim (spec §7.2 — the full source
// must be readable before copying). No 'server-only' here: the string is shown in
// the client UI.
//
// HOW IT WORKS (per-problem, because LeetCode retired the global submissions
// feed — see scripts/export-snippet/query.graphql):
//   1. List the user's problems via the public-to-them `userProgressQuestionList`
//      GraphQL query.
//   2. For each, page the REST endpoint /api/submissions/{slug}/ and keep the
//      Accepted submissions (each has its own id + timestamp → re-solves survive).
//   3. Download { id, title, titleSlug, timestamp }[] as leetcode-history.json.
//
// The cookie is applied automatically by `credentials: 'include'` and is NEVER
// read, printed, or transmitted by this code. Nothing is sent anywhere; the only
// output is a file the user chooses to upload.

export const EXPORT_FILENAME = "leetcode-history.json";

// Non-negotiable pacing: delay between every request so this one burst doesn't
// get the user's own account rate-limited (spec §6.3).
export const EXPORT_PAGE_DELAY_MS = 1500;

export const EXPORT_SNIPPET = `/*
 * Eat Leet Repeat — LeetCode history export
 * ------------------------------------------------------------------
 * WHAT THIS DOES: using the LeetCode login you already have in this
 * browser tab, it lists your problems, reads YOUR OWN accepted
 * submissions for each, and downloads them as ${EXPORT_FILENAME}.
 *
 * WHAT IT DOES NOT DO: it never reads, prints, or transmits your
 * password or session cookie. The cookie stays in your browser — it is
 * applied automatically by 'credentials: include' and is never touched
 * by this code. Nothing is sent anywhere; the ONLY output is a file
 * that downloads to your computer, which you then choose to upload.
 *
 * It is paced (${EXPORT_PAGE_DELAY_MS}ms between requests) so LeetCode
 * doesn't rate-limit you — a large history can take several minutes.
 * Leave the tab open and watch the progress logs.
 *
 * Read it top to bottom before running. Paste into the DevTools Console
 * on an open, logged-in leetcode.com tab, then press Enter.
 * ------------------------------------------------------------------
 */
(async () => {
  const DELAY_MS = ${EXPORT_PAGE_DELAY_MS}; // polite pacing — do not lower
  const LIST_PAGE = 50; // problems per progress-list page
  const SUB_PAGE = 20;  // submissions per problem page
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  const PROGRESS_QUERY =
    'query userProgressQuestionList($filters: UserProgressQuestionListInput) ' +
    '{ userProgressQuestionList(filters: $filters) ' +
    '{ totalNum questions { titleSlug numSubmitted } } }';

  // 1) List the user's problems. The progress list also includes problems they
  //    only viewed, so keep only those with submissions (numSubmitted > 0).
  const slugs = [];
  let skip = 0;
  let total = Infinity;
  while (skip < total) {
    const res = await fetch('/graphql', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        operationName: 'userProgressQuestionList',
        query: PROGRESS_QUERY,
        variables: { filters: { skip: skip, limit: LIST_PAGE } },
      }),
    });
    if (!res.ok) {
      console.error('Problem list failed (HTTP ' + res.status + '). Stopping.');
      return;
    }
    const json = await res.json();
    const data = json && json.data && json.data.userProgressQuestionList;
    if (!data) {
      console.error('Unexpected problem-list response. Stopping.');
      return;
    }
    total = data.totalNum;
    for (const q of data.questions) {
      if (q.numSubmitted > 0) slugs.push(q.titleSlug);
    }
    skip += LIST_PAGE;
    console.log('problems listed: ' + Math.min(skip, total) + '/' + total);
    if (!data.questions.length) break;
    await sleep(DELAY_MS);
  }
  console.log('Found ' + slugs.length + ' problems to check.');

  // Fetch one submissions page, retrying with backoff when LeetCode throttles.
  // Its submissions API returns 403 (sometimes 429) under rate-limiting rather
  // than a clean 429 — so we wait and retry instead of dropping the problem.
  const MAX_RETRIES = 4;
  const BACKOFF_MS = 20000; // grows each attempt: 20s, 40s, 60s, 80s
  async function fetchPage(slug, offset) {
    for (let attempt = 0; ; attempt++) {
      const res = await fetch(
        '/api/submissions/' + slug + '/?offset=' + offset + '&limit=' + SUB_PAGE,
        { credentials: 'include' },
      );
      if ((res.status !== 403 && res.status !== 429) || attempt >= MAX_RETRIES) {
        return res;
      }
      const wait = BACKOFF_MS * (attempt + 1);
      console.warn(
        'throttled on ' + slug + ' (HTTP ' + res.status + '); waiting ' +
          wait / 1000 + 's then retrying (' + (attempt + 1) + '/' + MAX_RETRIES + ')',
      );
      await sleep(wait);
    }
  }

  // 2) For each problem, page its submissions and keep the Accepted ones.
  const out = [];
  const failed = [];
  for (let i = 0; i < slugs.length; i++) {
    const slug = slugs[i];
    let offset = 0;
    let hasNext = true;
    while (hasNext) {
      const res = await fetchPage(slug, offset);
      if (!res.ok) {
        console.warn('skipping ' + slug + ' (HTTP ' + res.status + ')');
        failed.push(slug);
        break;
      }
      const json = await res.json();
      const dump = (json && json.submissions_dump) || [];
      for (const s of dump) {
        if (s.status_display === 'Accepted') {
          out.push({
            id: String(s.id),
            title: s.title,
            titleSlug: s.title_slug,
            timestamp: String(s.timestamp),
          });
        }
      }
      hasNext = Boolean(json && json.has_next) && dump.length > 0;
      offset += SUB_PAGE;
      if (hasNext) await sleep(DELAY_MS);
    }
    console.log(
      'fetched ' + (i + 1) + '/' + slugs.length + ' problems, ' +
        out.length + ' accepted so far',
    );
    await sleep(DELAY_MS);
  }

  if (failed.length) {
    console.warn(
      failed.length + ' problem(s) stayed throttled and were skipped: ' +
        failed.join(', '),
    );
    console.warn(
      'Re-run this script in ~10 minutes to pick them up — re-uploading is safe ' +
        '(duplicates are ignored).',
    );
  }

  if (out.length === 0) {
    console.warn('No accepted submissions found — nothing downloaded.');
    return;
  }

  // 3) Download the file you'll upload back to Eat Leet Repeat.
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
