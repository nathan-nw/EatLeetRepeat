// Injected only into the browser-test server, never the application build.
// Keep handle validation deterministic and avoid real LeetCode requests.
const originalFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  if (url === 'https://leetcode.com/graphql') {
    const body = JSON.parse(init?.body ?? '{}');
    return Response.json({ data: { matchedUser: { username: body.variables?.username }, recentAcSubmissionList: [], question: null } });
  }
  return originalFetch(input, init);
};
