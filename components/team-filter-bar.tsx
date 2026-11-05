'use client';

import { useEffect, useRef, useState } from 'react';
import type { TeamFilters, TeamMember } from '@/lib/teams';

const control = 'rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 disabled:opacity-50 dark:border-zinc-800 dark:bg-zinc-950';

export function TeamFilterBar({ filters, years, tags, members, pending, onChange }: {
  filters: TeamFilters;
  years: number[];
  tags: string[];
  members: TeamMember[];
  pending: boolean;
  onChange: (patch: Partial<TeamFilters>) => void;
}) {
  const dropdown = useRef<HTMLDetailsElement>(null);
  const [tag, setTag] = useState(filters.tag);
  const [selected, setSelected] = useState(filters.members);
  const [newOnly, setNewOnly] = useState(filters.newOnly);
  const extraCount = Number(Boolean(filters.tag)) + Number(filters.members.length > 0) + Number(filters.newOnly);
  const active = Boolean(filters.difficulty || extraCount);

  useEffect(() => {
    const outside = (event: PointerEvent) => {
      if (dropdown.current && !dropdown.current.contains(event.target as Node)) dropdown.current.open = false;
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && dropdown.current?.open) {
        dropdown.current.open = false;
        dropdown.current.querySelector('summary')?.focus();
      }
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', escape);
    };
  }, []);

  return <div aria-label="Filter team activity" role="group" className="flex flex-wrap items-center gap-2">
    <select aria-label="Year" className={control} disabled={pending} value={filters.year}
      onChange={(e) => onChange({ year: Number(e.target.value), page: 1 })}>
      {[...new Set([...years, filters.year])].sort((a, b) => b - a).map((year) => <option key={year}>{year}</option>)}
    </select>
    <select aria-label="Difficulty" className={control} disabled={pending} value={filters.difficulty}
      onChange={(e) => onChange({ difficulty: e.target.value, page: 1 })}>
      <option value="">All difficulties</option>
      {['Easy', 'Medium', 'Hard'].map((difficulty) => <option key={difficulty}>{difficulty}</option>)}
    </select>
    <details ref={dropdown} className="relative ml-auto" onToggle={(event) => {
      if (event.currentTarget.open) { setTag(filters.tag); setSelected(filters.members); setNewOnly(filters.newOnly); }
    }} onBlur={(event) => {
      if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget as Node)) event.currentTarget.open = false;
    }}>
      <summary className={`${control} flex cursor-pointer list-none items-center gap-1.5 text-zinc-600 dark:text-zinc-300 [&::-webkit-details-marker]:hidden`}>
        <svg aria-hidden="true" width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M2 4h12M4 8h8M6 12h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
        Filters{extraCount > 0 && <span className="rounded bg-emerald-50 px-1.5 text-xs text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">{extraCount}</span>}
      </summary>
      <form className="absolute right-0 top-full z-20 mt-2 w-[min(20rem,calc(100vw-2rem))] space-y-4 rounded-xl border border-zinc-200 bg-white p-4 shadow-lg dark:border-zinc-700 dark:bg-zinc-950" onSubmit={(event) => {
        event.preventDefault();
        onChange({ tag, members: selected, newOnly, page: 1 });
        if (dropdown.current) dropdown.current.open = false;
      }}>
        <fieldset disabled={pending} className="space-y-4">
          <legend className="sr-only">More activity filters</legend>
          <label className="flex flex-col gap-1.5 text-xs font-medium">Solves
            <select aria-label="Solve type" className={`${control} w-full`} value={newOnly ? 'new' : 'all'} onChange={(e) => setNewOnly(e.target.value === 'new')}>
              <option value="all">All solves</option>
              <option value="new">New problems only</option>
            </select>
            <span className="font-normal text-zinc-500">Each member’s first recorded solve, including imported history.</span>
          </label>
          <label className="flex flex-col gap-1.5 text-xs font-medium">Topic
            <select aria-label="Tag" className={`${control} w-full`} value={tag} onChange={(e) => setTag(e.target.value)}>
              <option value="">All tags</option>
              {tags.map((value) => <option key={value}>{value}</option>)}
            </select>
          </label>
          <div>
            <div className="mb-2 flex items-center justify-between text-xs"><span className="font-medium">Members</span><button type="button" className="text-zinc-500 hover:underline" onClick={() => setSelected([])}>Everyone</button></div>
            <div className="max-h-44 space-y-1 overflow-y-auto">
              {members.map((member) => <label key={member.id} className="flex cursor-pointer items-center gap-2 rounded px-1 py-1.5 text-sm hover:bg-zinc-50 dark:hover:bg-zinc-900">
                <input type="checkbox" className="accent-emerald-600" checked={selected.includes(member.id)} onChange={(e) => setSelected(e.target.checked ? [...selected, member.id] : selected.filter((id) => id !== member.id))} />
                <span className="break-all">{member.handle}</span>
              </label>)}
            </div>
            <p className="mt-2 text-xs text-zinc-500">{selected.length ? `${selected.length} selected` : 'Showing everyone'}</p>
          </div>
          <button className="w-full rounded-lg bg-zinc-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-zinc-900" type="submit">Apply filters</button>
        </fieldset>
      </form>
    </details>
    {active && <button disabled={pending} type="button" className="rounded-lg px-2 py-1.5 text-xs text-zinc-500 hover:underline disabled:opacity-50" onClick={() => onChange({ members: [], difficulty: '', tag: '', newOnly: false, page: 1 })}>Clear filters</button>}
    {extraCount > 0 && <p className="w-full text-xs text-zinc-500">{[filters.newOnly ? 'New problems only' : '', filters.tag, filters.members.length ? `${filters.members.length} member${filters.members.length === 1 ? '' : 's'}` : ''].filter(Boolean).join(' · ')}</p>}
  </div>;
}
