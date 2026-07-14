'use server';

import { createClient } from '@supabase/supabase-js';
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

export type PasswordState = { error?: string; success?: boolean };

// Change the signed-in user's password. If they already have a password
// (profiles.has_password), they must supply and correctly confirm the current
// one; users with no password yet (legacy magic-link accounts) can set one
// directly. The has_password flag is authoritative on the server — the client's
// version is never trusted.
export async function updatePassword(
  _prev: PasswordState,
  formData: FormData,
): Promise<PasswordState> {
  const current = String(formData.get('current') ?? '');
  const next = String(formData.get('password') ?? '');
  const confirm = String(formData.get('confirm') ?? '');

  if (next.length < 6) {
    return { error: 'Password must be at least 6 characters.' };
  }
  if (next !== confirm) {
    return { error: 'Passwords do not match.' };
  }

  const { supabase, user } = await requireUser();

  const { data: profile } = await supabase
    .from('profiles')
    .select('has_password')
    .eq('id', user.id)
    .maybeSingle();

  if (profile?.has_password) {
    if (!current) {
      return { error: 'Please enter your current password.' };
    }
    // Verify the current password with a throwaway client that never persists a
    // session, so the signed-in user's cookies are left untouched.
    const probe = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    const { error: signInError } = await probe.auth.signInWithPassword({
      email: user.email!,
      password: current,
    });
    if (signInError) {
      return { error: 'Your current password is incorrect.' };
    }
  }

  const { error: updateError } = await supabase.auth.updateUser({
    password: next,
  });
  if (updateError) {
    return { error: 'Something went wrong updating your password.' };
  }

  // Mark that this account now has a password (idempotent for repeat changes).
  if (!profile?.has_password) {
    await supabase
      .from('profiles')
      .update({ has_password: true, updated_at: new Date().toISOString() })
      .eq('id', user.id);
    revalidatePath('/settings');
  }

  return { success: true };
}
