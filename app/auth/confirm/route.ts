import { NextResponse } from 'next/server';
import type { EmailOtpType } from '@supabase/supabase-js';
import { createSupabaseServerClient } from '@/lib/supabase/server';

// Email-link landing for password auth. Supports both Supabase email flows so it
// works whether or not the dashboard email templates have been customised
// (template editing requires custom SMTP, so the default templates are the
// out-of-the-box path):
//
//   • Default templates (no SMTP): the link hits Supabase's verify endpoint,
//     which redirects here with `?code=…`; we exchange it for a session.
//   • Custom templates (token_hash pattern): the link arrives with
//     `?token_hash=…&type=…`; we verify the one-time token directly. This one is
//     stateless, so it also survives being opened in a different browser.
//
// Either way we set the session cookie, then forward to `next`:
//   signup confirmation → `/`      password recovery → `/reset-password`
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const token_hash = searchParams.get('token_hash');
  const type = searchParams.get('type') as EmailOtpType | null;
  const next = searchParams.get('next') ?? '/';

  const supabase = await createSupabaseServerClient();

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  } else if (token_hash && type) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash });
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth`);
}
