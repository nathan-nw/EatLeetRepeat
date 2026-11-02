'use server';

import { createHash, randomBytes } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { INVITE_TOKEN, UUID, parseTeamFilters, teamQuery, type TeamFilters, type TeamData } from '@/lib/teams';

type Action = 'create' | 'join' | 'rename' | 'reset' | 'leave' | 'remove' | 'remove_reset' | 'transfer' | 'delete';
type ActionInput = { action: Action; teamId?: string; name?: string; target?: string; token?: string };
export type TeamActionResult = { id?: string; token?: string; error?: string };
const hash = (token: string) => createHash('sha256').update(token).digest('hex');

export async function manageTeam(input: ActionInput): Promise<TeamActionResult> {
  const actions: Action[] = ['create', 'join', 'rename', 'reset', 'leave', 'remove', 'remove_reset', 'transfer', 'delete'];
  if (!input || !actions.includes(input.action)) return { error: 'Invalid team action.' };
  if (input.action !== 'create' && input.action !== 'join' && !UUID.test(input.teamId ?? '')) return { error: 'Invalid team.' };
  if (['remove', 'remove_reset', 'transfer'].includes(input.action) && !UUID.test(input.target ?? '')) return { error: 'Choose a member.' };
  const name = input.name?.trim();
  if (['create', 'rename'].includes(input.action) && (!name || [...name].length > 80)) return { error: 'Use a team name of 1–80 characters.' };
  if (input.action === 'join' && !INVITE_TOKEN.test(input.token ?? '')) return { error: 'Invitation unavailable.' };
  const token = ['create', 'reset', 'remove_reset'].includes(input.action) ? randomBytes(32).toString('hex') : undefined;
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('team_manage', {
    p_action: input.action, p_team: input.teamId ?? undefined, p_name: name,
    p_target: input.target || undefined, p_hash: token ? hash(token) : input.token ? hash(input.token) : undefined,
  });
  if (error) {
    console.error('Team operation failed', { action: input.action, code: error.code });
    const allowed = ['This team is full (20 members)', 'Team or invitation unavailable', 'Team unavailable',
      'Only the owner can do this', 'Complete onboarding first', 'Choose a current member',
      'Transfer ownership or delete the team before leaving', 'The owner cannot be removed'];
    return { error: allowed.includes(error.message) ? error.message : 'Could not update the team. Please try again.' };
  }
  revalidatePath('/teams');
  if (data) revalidatePath(`/teams/${data}`);
  return { id: data, token };
}

export async function readTeam(teamId: string, filters: TeamFilters): Promise<{ data?: TeamData; error?: string }> {
  if (!UUID.test(teamId)) return { error: 'Team unavailable.' };
  const clean = parseTeamFilters(new URLSearchParams(teamQuery(filters)));
  if (filters.cursor) {
    const c = filters.cursor;
    if (!UUID.test(c.userId) || typeof c.id !== 'string' || c.id.length > 100 || !Number.isFinite(Date.parse(c.at))) return { error: 'Invalid activity cursor.' };
    clean.cursor = c;
  }
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('team_read', { p_team: teamId, p_filters: clean });
  if (error) {
    console.error('Team read failed', { code: error.code });
    return { error: 'Team unavailable. You may no longer be a member. Refresh to try again.' };
  }
  return { data: data as unknown as TeamData };
}

export async function previewTeam(token: string): Promise<{ name: string } | null> {
  if (!INVITE_TOKEN.test(token)) return null;
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('team_preview', { p_hash: hash(token) });
  if (error || !data) return null;
  return data as unknown as { name: string };
}
