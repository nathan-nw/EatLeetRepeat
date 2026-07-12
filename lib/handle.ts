import 'server-only';
import { leetcodeUserExists } from '@/lib/leetcode';

// LeetCode handles are alphanumeric plus _ and -, up to ~39 chars.
const HANDLE_RE = /^[A-Za-z0-9_-]{1,39}$/;

export type HandleCheck =
  | { ok: true; handle: string }
  | { ok: false; error: string };

// Shared validation for onboarding and settings. Trims + format-checks, then
// does a best-effort LeetCode existence probe: a positive "no such user" blocks
// a typo, but a transient probe failure (network / 429) is allowed through so we
// never hard-depend on the unofficial endpoint being up (CLAUDE.md rule #6).
export async function validateHandle(raw: string): Promise<HandleCheck> {
  const handle = raw.trim();

  if (!handle) {
    return { ok: false, error: 'Enter your LeetCode username.' };
  }
  if (!HANDLE_RE.test(handle)) {
    return { ok: false, error: 'That doesn’t look like a valid LeetCode username.' };
  }

  try {
    const exists = await leetcodeUserExists(handle);
    if (!exists) {
      return {
        ok: false,
        error: `We couldn’t find a LeetCode user named “${handle}”. Check the spelling.`,
      };
    }
  } catch {
    // transient failure — proceed
  }

  return { ok: true, handle };
}
