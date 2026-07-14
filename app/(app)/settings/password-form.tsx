'use client';

import { useActionState } from 'react';
import { updatePassword, type PasswordState } from './actions';

const initialState: PasswordState = {};

// Change-password form. When the account already has a password
// (`requiresCurrent`), we show and require a "current password" field; the
// server action re-checks this authoritatively. Legacy magic-link accounts with
// no password yet skip that field and set one directly.
export function PasswordForm({ requiresCurrent }: { requiresCurrent: boolean }) {
  const [state, formAction, pending] = useActionState(
    updatePassword,
    initialState,
  );

  return (
    <form action={formAction} className="mt-6 flex max-w-sm flex-col gap-3">
      {requiresCurrent && (
        <>
          <label htmlFor="current" className="text-sm font-medium">
            Current password
          </label>
          <input
            id="current"
            name="current"
            type="password"
            required
            autoComplete="current-password"
            placeholder="Current password"
            disabled={pending}
            className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-500 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-950"
          />
        </>
      )}

      <label htmlFor="password" className="text-sm font-medium">
        New password
      </label>
      <input
        id="password"
        name="password"
        type="password"
        required
        minLength={6}
        autoComplete="new-password"
        placeholder="New password"
        disabled={pending}
        className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-500 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-950"
      />

      <label htmlFor="confirm" className="text-sm font-medium">
        Confirm new password
      </label>
      <input
        id="confirm"
        name="confirm"
        type="password"
        required
        minLength={6}
        autoComplete="new-password"
        placeholder="Confirm new password"
        disabled={pending}
        className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-500 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-950"
      />

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-zinc-900 px-3 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-60 dark:bg-white dark:text-zinc-900"
        >
          {pending ? 'Saving…' : 'Update password'}
        </button>
        {state.success && (
          <span className="text-sm text-emerald-600 dark:text-emerald-400">
            Password updated.
          </span>
        )}
      </div>
      {state.error && (
        <p className="text-sm text-red-600 dark:text-red-400">{state.error}</p>
      )}
    </form>
  );
}
