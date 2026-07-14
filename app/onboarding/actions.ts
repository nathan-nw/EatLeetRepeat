'use server';

import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { validateHandle } from '@/lib/handle';

export type OnboardingState = { error?: string };

export async function saveHandle(
  _prev: OnboardingState,
  formData: FormData,
): Promise<OnboardingState> {
  const check = await validateHandle(String(formData.get('handle') ?? ''));
  if (!check.ok) {
    return { error: check.error };
  }

  const { supabase, user } = await requireUser();

  // New users reach onboarding via the email+password signup flow, so they
  // already have a password — record that so the settings change-password form
  // requires confirming the current one.
  const { error } = await supabase
    .from('profiles')
    .insert({ id: user.id, leetcode_username: check.handle, has_password: true });

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
      redirect('/dashboard');
    }
    return { error: 'Something went wrong saving your handle. Please try again.' };
  }

  redirect('/dashboard');
}
