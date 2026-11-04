'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useRef, useState, useTransition } from 'react';
import { readTeam } from '@/app/teams-actions';
import { calendarWeeks, contributionLevel, teamQuery, type TeamData, type TeamFilters, type TeamGraph } from '@/lib/teams';
import { DifficultyBadge } from '@/components/difficulty-badge';
import { TeamManagement, teamButton, teamInput } from '@/components/team-controls';

const COLORS = ['bg-zinc-100 dark:bg-zinc-800/70', 'bg-emerald-200 dark:bg-emerald-900', 'bg-emerald-300 dark:bg-emerald-700', 'bg-emerald-500 dark:bg-emerald-600', 'bg-emerald-600 dark:bg-emerald-400'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function MemberGraph({ graph, year, selectedDay, onDay }: { graph: TeamGraph; year: number; selectedDay: string; onDay: (day: string) => void }) {
  const weeks = useMemo(() => calendarWeeks(year), [year]);
  const total = Object.values(graph.days).reduce((sum, count) => sum + count, 0);
  return <article className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><h2 className="break-all text-sm font-semibold">{graph.handle}</h2><span className="text-xs text-zinc-500">{total.toLocaleString()} submissions</span></div>
    <div className="overflow-x-auto" role="group" aria-label={`${graph.handle}'s contribution graph for ${year}, UTC`}>
      <div className="flex w-max gap-[3px] pb-1">
        {weeks.map((week, i) => {
          const monthStart = week.find((day) => day?.endsWith('-01'));
          return <div key={i} className="flex w-[11px] flex-col gap-[3px]">
            <span className="mb-1 h-4 whitespace-nowrap text-[10px] text-zinc-500">{monthStart ? MONTHS[Number(monthStart.slice(5, 7)) - 1] : ''}</span>
            {week.map((day, j) => {
              const count = day ? graph.days[day] ?? 0 : 0;
              const label = `${graph.handle}: ${count} submissions on ${day}, UTC`;
              return day && count > 0 ? <button key={day} type="button" title={label} aria-label={`${label}. Show activity.`} aria-pressed={selectedDay === day}
                onClick={() => onDay(day)} className={`h-[11px] w-[11px] rounded-[2px] ${COLORS[contributionLevel(count)]} focus-visible:outline-2 focus-visible:outline-emerald-500 ${selectedDay === day ? 'ring-2 ring-zinc-500' : ''}`} />
                : <span key={day ?? `empty-${j}`} title={day ? label : undefined} className={`h-[11px] w-[11px] rounded-[2px] ${day ? COLORS[0] : ''}`} />;
            })}
          </div>;
        })}
      </div>
    </div>
    {total === 0 && <p className="mt-2 text-xs text-zinc-500">No activity matching these filters.</p>}
  </article>;
}

export function TeamView({ initial, filters, userId }: { initial: TeamData; filters: TeamFilters; userId: string }) {
  const router = useRouter();
  const [data, setData] = useState(initial);
  const [feed, setFeed] = useState(initial.feed.slice(0, 25));
  const [hasMore, setHasMore] = useState(initial.feed.length > 25);
  const [error, setError] = useState('');
  const [pending, start] = useTransition();
  const request = useRef(0);
  const feedRef = useRef<HTMLElement>(null);
  const change = (patch: Partial<TeamFilters>, clearDay = true) => {
    request.current++;
    const next = { ...filters, ...patch, cursor: undefined };
    if (clearDay) { next.day = ''; next.dayMember = ''; }
    start(() => router.replace(`/teams/${data.id}${teamQuery(next)}`, { scroll: false }));
  };
  function refresh() {
    const version = ++request.current;
    start(async () => {
      try {
        const result = await readTeam(initial.id, filters);
        if (version !== request.current) return;
        if (!result.data) { setError(result.error ?? 'Team unavailable.'); setFeed([]); return; }
        setError(''); setData(result.data); setFeed(result.data.feed.slice(0, 25)); setHasMore(result.data.feed.length > 25);
      } catch { if (version === request.current) { setError('Could not refresh this team. Try again.'); setFeed([]); } }
    });
  }
  function loadMore() {
    const last = feed.at(-1);
    if (!last) return;
    const version = ++request.current;
    start(async () => {
      try {
        const result = await readTeam(data.id, { ...filters, cursor: { at: last.submitted_at, userId: last.user_id, id: last.id } });
        if (version !== request.current) return;
        if (!result.data) { setError(result.error ?? 'Team unavailable.'); setFeed([]); return; }
        const currentMembers = new Set(result.data.members.map((m) => m.id));
        setData(result.data);
        setFeed((previous) => [...previous.filter((entry) => currentMembers.has(entry.user_id)), ...result.data!.feed.slice(0, 25)]);
        setHasMore(result.data.feed.length > 25);
      } catch { if (version === request.current) { setError('Could not load activity. Refresh to try again.'); setFeed([]); } }
    });
  }
  if (error) return <main className="mx-auto max-w-4xl space-y-4 px-6 py-8"><p role="alert">{error}</p><button className={teamButton} disabled={pending} onClick={refresh}>Refresh</button><Link className="ml-3 underline" href="/teams">Back to teams</Link></main>;
  const dayHandle = data.members.find((m) => m.id === filters.dayMember)?.handle;
  return <main className="mx-auto w-full max-w-4xl space-y-6 px-4 py-8 sm:px-6" aria-busy={pending}>
    <div>
      <Link href="/teams" className="text-sm text-zinc-500 hover:underline">← Teams</Link>
      <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0"><h1 className="break-words text-2xl font-semibold">{data.name}</h1><p className="mt-1 text-sm text-zinc-500">Private · {data.members.length} / 20 members · All dates UTC</p></div>
        <div className="ml-auto flex shrink-0 items-center gap-2">
          <button className={teamButton} disabled={pending} onClick={refresh}>{pending ? 'Loading…' : 'Refresh'}</button>
          <TeamManagement key={data.ownerId} id={data.id} name={data.name} ownerId={data.ownerId} userId={userId} members={data.members} onChanged={refresh} />
        </div>
      </div>
      <p className="mt-3 text-xs text-zinc-500">Activity updates on the scheduled polling cycle (about every 30 minutes). Imported history is included. Every accepted submission counts, including re-solves.</p>
    </div>
    <fieldset disabled={pending} className="space-y-3 rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
      <legend className="px-1 text-sm font-medium">Filter team activity</legend>
      <div className="flex flex-wrap gap-3">
        <label className="flex flex-col gap-1 text-xs">Year<select aria-label="Year" className={teamInput} value={filters.year} onChange={(e) => change({ year: Number(e.target.value), page: 1 })}>{[...new Set([...data.years, filters.year])].sort((a, b) => b - a).map((year) => <option key={year}>{year}</option>)}</select></label>
        <label className="flex flex-col gap-1 text-xs">Difficulty<select aria-label="Difficulty" className={teamInput} value={filters.difficulty} onChange={(e) => change({ difficulty: e.target.value, page: 1 })}><option value="">All difficulties</option>{['Easy', 'Medium', 'Hard'].map((d) => <option key={d}>{d}</option>)}</select></label>
        <label className="flex min-w-0 flex-col gap-1 text-xs">Tag<select aria-label="Tag" className={`${teamInput} max-w-full`} value={filters.tag} onChange={(e) => change({ tag: e.target.value, page: 1 })}><option value="">All tags</option>{data.tags.map((tag) => <option key={tag}>{tag}</option>)}</select></label>
      </div>
      <details><summary className="cursor-pointer text-sm">Members ({filters.members.length || 'all'})</summary><div className="mt-2 flex flex-wrap gap-x-4 gap-y-2">{data.members.map((m) => <label key={m.id} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={filters.members.includes(m.id)} onChange={(e) => change({ page: 1, members: e.target.checked ? [...filters.members, m.id] : filters.members.filter((id) => id !== m.id) })} />{m.handle}</label>)}</div><p className="mt-2 text-xs text-zinc-500">No members selected means everyone.</p></details>
      <button className={teamButton} onClick={() => change({ members: [], difficulty: '', tag: '', page: 1 })}>Clear filters</button>
    </fieldset>
    <section aria-label="Member contributions" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-semibold">Member contributions · {filters.year}</h2><div className="flex items-center gap-1 text-[11px] text-zinc-500">Less {COLORS.map((color) => <span key={color} className={`h-[11px] w-[11px] rounded-[2px] ${color}`} />)} More</div></div>
      {data.graphs.map((graph) => <MemberGraph key={graph.id} graph={graph} year={filters.year} selectedDay={filters.dayMember === graph.id ? filters.day : ''} onDay={(day) => {
        change({ day, dayMember: graph.id }, false); feedRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }} />)}
      {!data.graphs.length && <p className="text-sm text-zinc-500">No members on this page. Try the previous page or clear member filters.</p>}
      <div className="flex items-center justify-between gap-2 text-xs"><button className={teamButton} disabled={pending || filters.page === 1} onClick={() => change({ page: filters.page - 1 }, false)}>Previous members</button><span>Page {filters.page} of {Math.max(1, Math.ceil(data.memberTotal / 5))}</span><button className={teamButton} disabled={pending || filters.page * 5 >= data.memberTotal} onClick={() => change({ page: filters.page + 1 }, false)}>Next members</button></div>
    </section>
    <section ref={feedRef} aria-label="Team activity" className="scroll-mt-4">
      <h2 className="font-semibold">Recent team activity · {filters.year}</h2>
      {filters.day && <button className={`${teamButton} my-3`} onClick={() => change({ day: '', dayMember: '' }, false)}>{dayHandle ?? 'Member'} · {filters.day} UTC · Clear ×</button>}
      {feed.length ? <ul className="mt-3 divide-y divide-zinc-200 dark:divide-zinc-800">{feed.map((entry) => <li key={`${entry.user_id}:${entry.id}`} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-3">
        <div className="min-w-0"><p className="text-xs font-medium text-emerald-700 dark:text-emerald-400">{entry.handle}</p><a className="break-words text-sm hover:underline" href={`https://leetcode.com/problems/${encodeURIComponent(entry.title_slug)}/`} target="_blank" rel="noopener noreferrer">{entry.frontend_id ? `#${entry.frontend_id} · ` : ''}{entry.title}</a></div>
        <div className="flex items-center gap-3"><DifficultyBadge difficulty={entry.difficulty === 'Easy' || entry.difficulty === 'Medium' || entry.difficulty === 'Hard' ? entry.difficulty : 'Unknown'} /><time dateTime={entry.submitted_at} className="text-xs text-zinc-500">{new Date(entry.submitted_at).toISOString().slice(0, 16).replace('T', ' ')} UTC</time></div>
      </li>)}</ul> : <p className="mt-3 text-sm text-zinc-500">No recorded solves match these filters. New members may need to wait for the next poll or import their history.</p>}
      {hasMore && <button className={`${teamButton} mt-4`} disabled={pending} onClick={loadMore}>{pending ? 'Loading…' : 'Load more'}</button>}
    </section>
  </main>;
}
