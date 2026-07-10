'use client';

import { useActionState } from 'react';
import { saveHandle, type OnboardingState } from './actions';

const initialState: OnboardingState = {};

export function OnboardingForm() {
  const [state, formAction, pending] = useActionState(saveHandle, initialState);

  return (
    <form action={formAction} className="mt-8 flex flex-col gap-3">
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
        placeholder="e.g. nathan-nw"
        disabled={pending}
        className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-500 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-950"
      />
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-zinc-900 px-3 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-60 dark:bg-white dark:text-zinc-900"
      >
        {pending ? 'Checking…' : 'Continue'}
      </button>
      {state.error && (
        <p className="text-sm text-red-600 dark:text-red-400">{state.error}</p>
      )}
    </form>
  );
}
