import 'server-only';
import { cache } from 'react';
import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { Profile } from '@/lib/database.types';

// Cached per request so multiple callers (layout + page + components) share one
// round-trip to Supabase.
export const getSessionUser = cache(async () => {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
});

// Returns the signed-in user or sends them to /login. Use in any protected
// server component / action.
export async function requireUser() {
  const user = await getSessionUser();
  if (!user) {
    redirect('/login');
  }
  const supabase = await createSupabaseServerClient();
  return { supabase, user };
}

// The signed-in user's profile row, or null if they haven't onboarded yet.
// Read under the user's session, so RLS returns only their own row.
export const getProfile = cache(async (): Promise<Profile | null> => {
  const user = await getSessionUser();
  if (!user) return null;

  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .maybeSingle();

  return data ?? null;
});
