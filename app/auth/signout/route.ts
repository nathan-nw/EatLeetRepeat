import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';

// Signs the user out and clears the session cookie, then returns to /login.
// POST-only so a link prefetch can't log anyone out. 303 downgrades the
// redirect to a GET.
export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  return NextResponse.redirect(new URL('/login', request.url), { status: 303 });
}
