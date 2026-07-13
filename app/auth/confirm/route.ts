import { NextResponse } from 'next/server';
import type { EmailOtpType } from '@supabase/supabase-js';
import { createSupabaseServerClient } from '@/lib/supabase/server';

// Email-link landing for password auth. Supabase's email templates point here
// with `?token_hash=…&type=…` (see the dashboard "Confirm signup" and "Reset
// password" templates). We verify the one-time token server-side, which sets the
// session cookie, then send the user on to `next`.
//
// This token_hash flow is stateless — unlike the PKCE `?code=` flow the old
// magic link used, it works even when the link is opened in a different browser
// or the mail client's in-app browser. Handles both:
//   • type=email    → signup confirmation      (next defaults to `/`)
//   • type=recovery → password reset           (next = `/reset-password`)
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const token_hash = searchParams.get('token_hash');
  const type = searchParams.get('type') as EmailOtpType | null;
  const next = searchParams.get('next') ?? '/';

  if (token_hash && type) {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash });
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth`);
}
