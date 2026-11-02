// Allowlisted local destinations only; never forward arbitrary URLs through auth.
export function safeReturnPath(value: unknown, fallback = '/dashboard'): string {
  if (typeof value !== 'string') return fallback;
  if (/^\/invite\/[0-9a-f]{64}$/.test(value)) return value;
  // Recovery may itself have a pending invitation. Accept only this exact
  // nested destination, never a generic query-controlled redirect.
  if (value.startsWith('/reset-password?next=')) {
    const nested = new URLSearchParams(value.slice(value.indexOf('?') + 1));
    const next = nested.get('next');
    if (next && /^\/invite\/[0-9a-f]{64}$/.test(next) && [...nested.keys()].length === 1) {
      return `/reset-password?next=${encodeURIComponent(next)}`;
    }
  }
  if (value === '/reset-password' || value === '/dashboard' || value === '/teams') return value;
  return fallback;
}
