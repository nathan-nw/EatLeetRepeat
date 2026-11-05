// Shared, serializable team contracts. No credentials or private profile fields.
export type TeamSummary = { id: string; name: string; ownerId: string; memberCount: number };
export type TeamMember = { id: string; handle: string };
export type TeamGraph = TeamMember & { days: Record<string, number> };
export type TeamEntry = {
  id: string; user_id: string; handle: string; title_slug: string; title: string;
  frontend_id: string | null; difficulty: string | null; submitted_at: string;
};
export type TeamData = {
  newOnlySupported?: boolean;
  id: string; name: string; ownerId: string; members: TeamMember[];
  memberTotal: number; graphs: TeamGraph[]; years: number[]; tags: string[]; feed: TeamEntry[];
};
export type TeamCursor = { at: string; userId: string; id: string };
export type TeamFilters = {
  year: number; page: number; members: string[]; difficulty: string; tag: string;
  day: string; dayMember: string; newOnly: boolean; cursor?: TeamCursor;
};
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const INVITE_TOKEN = /^[0-9a-f]{64}$/;

export function parseTeamFilters(params: URLSearchParams): TeamFilters {
  const year = Number(params.get('year'));
  const page = Number(params.get('page'));
  const day = params.get('day') ?? '';
  const dayMember = params.get('dayMember') ?? '';
  const validDay = /^\d{4}-\d{2}-\d{2}$/.test(day) &&
    Number.isFinite(Date.parse(day)) && new Date(day).toISOString().slice(0, 10) === day;
  return {
    newOnly: params.get('newOnly') === 'true',
    year: Number.isInteger(year) && year >= 1970 && year <= 9998 ? year : new Date().getUTCFullYear(),
    page: Number.isInteger(page) && page >= 1 && page <= 4 ? page : 1,
    members: [...new Set(params.getAll('member').filter((id) => UUID.test(id)))].slice(0, 20),
    difficulty: ['Easy', 'Medium', 'Hard'].includes(params.get('difficulty') ?? '') ? params.get('difficulty')! : '',
    tag: (params.get('tag') ?? '').slice(0, 100),
    day: validDay && UUID.test(dayMember) ? day : '',
    dayMember: validDay && UUID.test(dayMember) ? dayMember : '',
  };
}

export function teamQuery(filters: TeamFilters): string {
  const params = new URLSearchParams({ year: String(filters.year) });
  if (filters.newOnly) params.set('newOnly', 'true');
  if (filters.page > 1) params.set('page', String(filters.page));
  filters.members.forEach((id) => params.append('member', id));
  if (filters.difficulty) params.set('difficulty', filters.difficulty);
  if (filters.tag) params.set('tag', filters.tag);
  if (filters.day && filters.dayMember) {
    params.set('day', filters.day);
    params.set('dayMember', filters.dayMember);
  }
  return `?${params}`;
}

export function calendarWeeks(year: number): (string | null)[][] {
  const weeks: (string | null)[][] = [];
  const date = new Date(Date.UTC(year, 0, 1));
  let week: (string | null)[] = Array(date.getUTCDay()).fill(null);
  while (date.getUTCFullYear() === year) {
    week.push(date.toISOString().slice(0, 10));
    if (week.length === 7) { weeks.push(week); week = []; }
    date.setUTCDate(date.getUTCDate() + 1);
  }
  if (week.length) weeks.push([...week, ...Array(7 - week.length).fill(null)]);
  return weeks;
}

export function contributionLevel(count: number): number {
  return count <= 0 ? 0 : count <= 2 ? 1 : count <= 4 ? 2 : count <= 7 ? 3 : 4;
}
