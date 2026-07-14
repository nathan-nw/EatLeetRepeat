import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import type { Database } from '../database.types';

// Public routes reachable while signed out. Everything else requires a session.
// (`/api/*` is excluded from the middleware matcher entirely — the poller guards
// itself with CRON_SECRET.)
const PUBLIC_PREFIXES = ['/login', '/auth'];
// The landing page. Exact-match only — a prefix of '/' would match every path.
const PUBLIC_EXACT = new Set(['/']);

// Runs on every matched request. It (1) refreshes the Supabase auth cookie so
// server components always see a valid session, and (2) gates unauthenticated
// users to /login. Onboarding (does the user have a LeetCode handle yet?) is
// enforced in the app tree, not here, to avoid a DB round-trip per request.
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // IMPORTANT: getUser() revalidates the token with Supabase — do not trust
  // getSession() here. Do nothing between creating the client and this call.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const isPublic =
    PUBLIC_EXACT.has(path) ||
    PUBLIC_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`));

  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  // Signed-in users belong in the app, not on the landing or login pages.
  if (user && (path === '/' || path === '/login')) {
    const url = request.nextUrl.clone();
    url.pathname = '/dashboard';
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
