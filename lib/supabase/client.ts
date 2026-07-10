'use client';
import { createBrowserClient } from '@supabase/ssr';
import type { Database } from '../database.types';

// Supabase client for the browser (Client Components). Uses the anon key and
// runs under the signed-in user's session with RLS enforced. Used for auth
// actions like sending a magic link; UI data reads should prefer server
// components (see lib/supabase/server.ts).
export function createSupabaseBrowserClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
