'use server';

import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { leetcodeUserExists } from '@/lib/leetcode';

export type OnboardingState = { error?: string };

// LeetCode handles are alphanumeric plus _ and -, up to ~39 chars.
const HANDLE_RE = /^[A-Za-z0-9_-]{1,39}$/;

export async function saveHandle(
  _prev: OnboardingState,
  formData: FormData,
): Promise<OnboardingState> {
  const handle = String(formData.get('handle') ?? '').trim();

  if (!handle) {
    return { error: 'Enter your LeetCode username.' };
  }
  if (!HANDLE_RE.test(handle)) {
    return { error: 'That doesn’t look like a valid LeetCode username.' };
  }

  const { supabase, user } = await requireUser();

  // Best-effort existence probe (PRD §9). If LeetCode positively reports "no
  // such user", block the typo. If the probe itself fails (network / 429), let
  // them proceed — the poller will just find nothing until the handle is right
  // (rule #6 spirit: never hard-block on the unofficial endpoint being up).
  try {
    const exists = await leetcodeUserExists(handle);
    if (!exists) {
      return {
        error: `We couldn’t find a LeetCode user named “${handle}”. Check the spelling.`,
      };
    }
  } catch {
    // transient failure — proceed
  }

  const { error } = await supabase
    .from('profiles')
    .insert({ id: user.id, leetcode_username: handle });

  if (error) {
    // 23505 = unique_violation. On lower(leetcode_username) it means the handle
    // is taken; on the pk (id) it means this user already onboarded (race).
    if (error.code === '23505') {
      if (error.message.includes('leetcode_username')) {
        return {
          error: 'That LeetCode handle is already connected to another account.',
        };
      }
      // Already onboarded — just move on.
      redirect('/');
    }
    return { error: 'Something went wrong saving your handle. Please try again.' };
  }

  redirect('/');
}
