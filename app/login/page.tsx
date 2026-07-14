'use client';

import { useState } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

type Mode = 'signin' | 'signup' | 'forgot';

// Map Supabase's raw auth errors to friendlier copy.
function friendlyError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes('invalid login credentials')) {
    return 'Incorrect email or password.';
  }
  if (m.includes('email not confirmed')) {
    return 'Please confirm your email first — check your inbox for the link.';
  }
  if (m.includes('user already registered')) {
    return 'An account with this email already exists. Try signing in instead.';
  }
  if (m.includes('password should be')) {
    return 'Password must be at least 6 characters.';
  }
  return message;
}

export default function LoginPage() {
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // After signup / reset request we show a "check your email" card instead of
  // the form. `sentKind` distinguishes the wording.
  const [sentKind, setSentKind] = useState<'confirm' | 'reset' | null>(null);

  function switchMode(next: Mode) {
    setMode(next);
    setError(null);
    setPassword('');
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);

    const supabase = createSupabaseBrowserClient();

    try {
      if (mode === 'signin') {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
        // Full navigation so the server sees the freshly-set session cookie.
        // The (app) tree routes to /onboarding if this user has no handle yet.
        window.location.assign('/');
        return;
      }

      if (mode === 'signup') {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/auth/confirm?next=/`,
          },
        });
        if (error) throw error;
        // Email confirmation is on, so no session yet — tell them to confirm.
        setSentKind('confirm');
        return;
      }

      // mode === 'forgot'
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth/confirm?next=/reset-password`,
      });
      if (error) throw error;
      setSentKind('reset');
    } catch (err) {
      setError(friendlyError((err as Error).message));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex flex-1 flex-col items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-semibold tracking-tight">Eat Leet Repeat</h1>
        <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
          Sign in to track your LeetCode activity over time.
        </p>

        {sentKind ? (
          <div className="mt-8 rounded-lg border border-zinc-200 bg-zinc-50 p-4 text-sm dark:border-zinc-800 dark:bg-zinc-900">
            <p className="font-medium">Check your email</p>
            <p className="mt-1 text-zinc-500 dark:text-zinc-400">
              {sentKind === 'confirm' ? (
                <>
                  We sent a confirmation link to{' '}
                  <span className="font-medium text-zinc-700 dark:text-zinc-300">
                    {email}
                  </span>
                  . Click it to activate your account, then come back and sign
                  in.
                </>
              ) : (
                <>
                  If an account exists for{' '}
                  <span className="font-medium text-zinc-700 dark:text-zinc-300">
                    {email}
                  </span>
                  , we sent a link to reset your password.
                </>
              )}
            </p>
            <button
              type="button"
              onClick={() => {
                setSentKind(null);
                switchMode('signin');
              }}
              className="mt-3 text-sm font-medium underline underline-offset-2"
            >
              Back to sign in
            </button>
          </div>
        ) : (
          <>
            <form onSubmit={handleSubmit} className="mt-8 flex flex-col gap-3">
              <label htmlFor="email" className="sr-only">
                Email address
              </label>
              <input
                id="email"
                type="email"
                required
                autoComplete="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={busy}
                className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-500 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-950"
              />

              {mode !== 'forgot' && (
                <>
                  <label htmlFor="password" className="sr-only">
                    Password
                  </label>
                  <input
                    id="password"
                    type="password"
                    required
                    minLength={6}
                    autoComplete={
                      mode === 'signup' ? 'new-password' : 'current-password'
                    }
                    placeholder="Password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={busy}
                    className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-500 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-950"
                  />
                </>
              )}

              <button
                type="submit"
                disabled={busy}
                className="rounded-lg bg-zinc-900 px-3 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-60 dark:bg-white dark:text-zinc-900"
              >
                {busy
                  ? 'Please wait…'
                  : mode === 'signin'
                    ? 'Sign in'
                    : mode === 'signup'
                      ? 'Create account'
                      : 'Send reset link'}
              </button>

              {error && (
                <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
              )}
            </form>

            <div className="mt-4 flex flex-col gap-2 text-sm text-zinc-500 dark:text-zinc-400">
              {mode === 'signin' && (
                <>
                  <button
                    type="button"
                    onClick={() => switchMode('forgot')}
                    className="self-start underline-offset-2 hover:underline"
                  >
                    Forgot password?
                  </button>
                  <p>
                    Need an account?{' '}
                    <button
                      type="button"
                      onClick={() => switchMode('signup')}
                      className="font-medium text-zinc-700 underline underline-offset-2 dark:text-zinc-300"
                    >
                      Create one
                    </button>
                  </p>
                </>
              )}
              {mode === 'signup' && (
                <p>
                  Already have an account?{' '}
                  <button
                    type="button"
                    onClick={() => switchMode('signin')}
                    className="font-medium text-zinc-700 underline underline-offset-2 dark:text-zinc-300"
                  >
                    Sign in
                  </button>
                </p>
              )}
              {mode === 'forgot' && (
                <button
                  type="button"
                  onClick={() => switchMode('signin')}
                  className="self-start underline-offset-2 hover:underline"
                >
                  Back to sign in
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </main>
  );
}
