'use client';

import { useActionState } from 'react';
import { updateHandle, type SettingsState } from './actions';

const initialState: SettingsState = {};

export function SettingsForm({ current }: { current: string }) {
  const [state, formAction, pending] = useActionState(
    updateHandle,
    initialState,
  );

  return (
    <form action={formAction} className="mt-6 flex max-w-sm flex-col gap-3">
      <label htmlFor="handle" className="text-sm font-medium">
        LeetCode username
      </label>
      <input
        id="handle"
        name="handle"
        required
        autoComplete="off"
        autoCapitalize="none"
        spellCheck={false}
        defaultValue={current}
        className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-500 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-950"
        disabled={pending}
      />
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-zinc-900 px-3 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-60 dark:bg-white dark:text-zinc-900"
        >
          {pending ? 'Saving…' : 'Save'}
        </button>
        {state.success && (
          <span className="text-sm text-emerald-600 dark:text-emerald-400">
            Saved.
          </span>
        )}
      </div>
      {state.error && (
        <p className="text-sm text-red-600 dark:text-red-400">{state.error}</p>
      )}
    </form>
  );
}
