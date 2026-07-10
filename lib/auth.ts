import 'server-only';
import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { Profile } from '@/lib/database.types';

// Returns the signed-in user or sends them to /login. Use in any protected
// server component / action. (Middleware already gates routes, but calling this
// gives you the typed user and a hard guarantee at the point of use.)
export async function requireUser() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect('/login');
  }
  return { supabase, user };
}

// The signed-in user's profile row, or null if they haven't onboarded yet.
// Read under the user's session, so RLS returns only their own row.
export async function getProfile(): Promise<Profile | null> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .maybeSingle();

  return data ?? null;
}
