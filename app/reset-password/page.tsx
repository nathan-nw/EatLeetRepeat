'use client';

import { useState } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

// Set-a-new-password page. Reached after clicking the reset email, which lands
// on /auth/confirm (type=recovery); that verifies the token and establishes a
// short-lived recovery session, then redirects here. With that session in place
// updateUser({ password }) sets the new password. Kept outside the (app) group
// so it doesn't require an onboarded profile.
export default function ResetPasswordPage() {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }

    setBusy(true);
    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase.auth.updateUser({ password });

    if (error) {
      // Most common cause: no recovery session (link expired or opened without
      // going through /auth/confirm).
      setError(
        error.message.toLowerCase().includes('auth session missing')
          ? 'Your reset link has expired. Please request a new one.'
          : error.message,
      );
      setBusy(false);
      return;
    }

    // Password set — full navigation so the app tree re-runs its auth gate.
    window.location.assign('/');
  }

  return (
    <main className="flex flex-1 flex-col items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-semibold tracking-tight">
          Set a new password
        </h1>
        <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
          Choose a new password for your account.
        </p>

        <form onSubmit={handleSubmit} className="mt-8 flex flex-col gap-3">
          <label htmlFor="password" className="sr-only">
            New password
          </label>
          <input
            id="password"
            type="password"
            required
            minLength={6}
            autoComplete="new-password"
            placeholder="New password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={busy}
            className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-500 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-950"
          />

          <label htmlFor="confirm" className="sr-only">
            Confirm new password
          </label>
          <input
            id="confirm"
            type="password"
            required
            minLength={6}
            autoComplete="new-password"
            placeholder="Confirm new password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            disabled={busy}
            className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-500 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-950"
          />

          <button
            type="submit"
            disabled={busy}
            className="rounded-lg bg-zinc-900 px-3 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-60 dark:bg-white dark:text-zinc-900"
          >
            {busy ? 'Saving…' : 'Update password'}
          </button>

          {error && (
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          )}
        </form>
      </div>
    </main>
  );
}
