import 'server-only';

// Thin client for LeetCode's unofficial public GraphQL endpoint. SERVER ONLY —
// the browser never calls LeetCode (CLAUDE.md rule #1). Today this powers the
// onboarding handle check; the poller will reuse `fetchRecentAcSubmissions`.

const LEETCODE_GRAPHQL = 'https://leetcode.com/graphql';

// Thrown on HTTP 429 so callers can back off / skip rather than hammer (rule #10).
export class LeetCodeRateLimitError extends Error {
  constructor() {
    super('LeetCode rate limited (HTTP 429)');
    this.name = 'LeetCodeRateLimitError';
  }
}

export type RecentAcSubmission = {
  id: string;
  title: string;
  titleSlug: string;
  timestamp: string; // Unix epoch seconds, as a string
};

async function leetcodeGraphql<T>(
  query: string,
  variables: Record<string, unknown>,
): Promise<T> {
  const res = await fetch(LEETCODE_GRAPHQL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      // A sane, browser-like UA + Referer keeps these public queries from being
      // rejected. Personal-scale, polite usage (rule #10).
      'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 EatLeetRepeat/1.0',
      Referer: 'https://leetcode.com',
    },
    body: JSON.stringify({ query, variables }),
    cache: 'no-store',
  });

  if (res.status === 429) {
    throw new LeetCodeRateLimitError();
  }
  if (!res.ok) {
    throw new Error(`LeetCode GraphQL HTTP ${res.status}`);
  }

  const json = (await res.json()) as {
    data?: T;
    errors?: { message?: string }[];
  };
  if (json.errors?.length) {
    throw new Error(
      `LeetCode GraphQL error: ${json.errors[0]?.message ?? 'unknown'}`,
    );
  }
  return json.data as T;
}

const RECENT_AC_QUERY = /* GraphQL */ `
  query recentAcSubmissions($username: String!, $limit: Int!) {
    recentAcSubmissionList(username: $username, limit: $limit) {
      id
      title
      titleSlug
      timestamp
    }
  }
`;

// LeetCode hard-caps `limit` at 20 server-side; there is no pagination.
export async function fetchRecentAcSubmissions(
  username: string,
  limit = 20,
): Promise<RecentAcSubmission[]> {
  const data = await leetcodeGraphql<{
    recentAcSubmissionList: RecentAcSubmission[] | null;
  }>(RECENT_AC_QUERY, { username, limit });
  return data.recentAcSubmissionList ?? [];
}

const USER_EXISTS_QUERY = /* GraphQL */ `
  query userExists($username: String!) {
    matchedUser(username: $username) {
      username
    }
  }
`;

// True/false when we can positively determine existence. Rethrows on transient
// failures (network, 429) so callers can distinguish "no such user" from "couldn't
// check right now" — onboarding treats the latter as best-effort (rule #6 spirit).
export async function leetcodeUserExists(username: string): Promise<boolean> {
  const data = await leetcodeGraphql<{
    matchedUser: { username: string } | null;
  }>(USER_EXISTS_QUERY, { username });
  return data.matchedUser !== null;
}
