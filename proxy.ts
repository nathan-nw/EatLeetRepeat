import { type NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';

// Next 16's "proxy" convention (formerly middleware.ts). Runs on every matched
// request to refresh the Supabase session cookie and gate unauthenticated users.
export async function proxy(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static, _next/image (build assets)
     * - favicon.ico and common image files
     * - /api/* (the poller guards itself with CRON_SECRET; no user session)
     */
    '/((?!_next/static|_next/image|favicon.ico|api|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
