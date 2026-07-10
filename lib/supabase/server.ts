import 'server-only';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import type { Database } from '../database.types';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl) {
  throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL environment variable');
}
if (!anonKey) {
  throw new Error('Missing NEXT_PUBLIC_SUPABASE_ANON_KEY environment variable');
}

// Supabase client for Server Components, Server Actions, and Route Handlers.
// It uses the *anon* key and the request's auth cookies, so every query runs as
// the signed-in user with RLS enforced — a user reads only their own rows. This
// is distinct from `lib/db.ts`, the service-role client the poller uses to write
// (which bypasses RLS). Never use the service-role client to serve UI reads.
export async function createSupabaseServerClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(supabaseUrl!, anonKey!, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        } catch {
          // `setAll` was called from a Server Component, where cookies are
          // read-only. Safe to ignore: the middleware refreshes the session
          // cookie on every request (see lib/supabase/middleware.ts).
        }
      },
    },
  });
}
