'use server';

import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/auth';
import { validateHandle } from '@/lib/handle';

export type SettingsState = { error?: string; success?: boolean };

export async function updateHandle(
  _prev: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  const check = await validateHandle(String(formData.get('handle') ?? ''));
  if (!check.ok) {
    return { error: check.error };
  }

  const { supabase, user } = await requireUser();

  const { error } = await supabase
    .from('profiles')
    .update({
      leetcode_username: check.handle,
      updated_at: new Date().toISOString(),
    })
    .eq('id', user.id);

  if (error) {
    // 23505 = unique_violation on lower(leetcode_username).
    if (error.code === '23505') {
      return {
        error: 'That LeetCode handle is already connected to another account.',
      };
    }
    return { error: 'Something went wrong saving your handle. Please try again.' };
  }

  // Refresh the cached profile so the header + dashboard reflect the new handle.
  revalidatePath('/', 'layout');
  return { success: true };
}
