import { supabase } from '@/lib/supabase';

export type TeamContext = {
  teamId: string;
  teamNumber: number;
  teamName?: string | null;
};

export type MatchRow = {
  id: string;
  team_id: string;
  event_id?: string | null;
  match_number: number;
  team_number: number;
  scout_name?: string | null;
  game_year?: number | null;
  metrics?: Record<string, any> | null;
  calculated_points?: number | null;
  notes?: string | null;
  timestamp: number;
};

function generateAdminCode6(): string {
  const n = Math.floor(Math.random() * 1_000_000);
  return String(n).padStart(6, '0');
}

export class AdminService {
  async getTeamContext(teamNumber: number): Promise<TeamContext> {
    // Prefer RPC if it exists (matches existing app patterns)
    const { data: rpcTeamId, error: rpcError } = await supabase.rpc(
      'get_team_id_by_number' as any,
      { team_num: teamNumber } as any
    );

    if (!rpcError && rpcTeamId && typeof rpcTeamId === 'string') {
      const { data: team, error } = await supabase
        .from('teams')
        .select('id, team_number, team_name')
        .eq('id', rpcTeamId)
        .single();

      if (!error && team?.id) {
        return {
          teamId: team.id as string,
          teamNumber: (team.team_number as number) ?? teamNumber,
          teamName: (team.team_name as string) ?? null,
        };
      }

      // If fetching team meta fails, still return the ID we have.
      return { teamId: rpcTeamId, teamNumber };
    }

    // Fallback: direct lookup by team_number
    const { data: team, error } = await supabase
      .from('teams')
      .select('id, team_number, team_name')
      .eq('team_number', teamNumber)
      .single();

    if (error || !team?.id) {
      throw new Error('Unable to resolve team context.');
    }

    return {
      teamId: team.id as string,
      teamNumber: (team.team_number as number) ?? teamNumber,
      teamName: (team.team_name as string) ?? null,
    };
  }

  async verifyAdminCode(teamId: string, code: string): Promise<boolean> {
    const { data, error } = await supabase.from('teams').select('admin_code').eq('id', teamId).single();

    if (error || !data) {
      throw new Error('Unable to verify admin code.');
    }

    return String(data.admin_code || '') === code;
  }

  async listTeamMatches(teamId: string): Promise<MatchRow[]> {
    const [{ data: matchesData, error: matchesError }, { data: deletionsData, error: deletionsError }] =
      await Promise.all([
        supabase
          .from('matches')
          .select(
            'id, team_id, event_id, match_number, team_number, scout_name, game_year, metrics, calculated_points, notes, timestamp'
          )
          .eq('team_id', teamId)
          .order('timestamp', { ascending: false }),
        supabase.from('match_deletions').select('match_id').eq('team_id', teamId),
      ]);

    if (matchesError) {
      throw new Error(matchesError.message || 'Unable to fetch matches.');
    }

    if (deletionsError) {
      // If RLS blocks deletions table reads, still show matches; delete will still write tombstones.
      return (matchesData || []) as MatchRow[];
    }

    const deleted = new Set((deletionsData || []).map((d: any) => String(d.match_id)));
    return ((matchesData || []) as MatchRow[]).filter((m) => !deleted.has(String(m.id)));
  }

  async deleteMatch(teamId: string, matchId: string): Promise<void> {
    // Write tombstone first so even if the row can't be deleted (RLS), sync won't resurrect it.
    const { error: tombstoneError } = await supabase
      .from('match_deletions')
      .upsert({ team_id: teamId, match_id: matchId }, { onConflict: 'team_id,match_id' });

    if (tombstoneError) {
      throw new Error(tombstoneError.message || 'Delete failed (tombstone).');
    }

    const { error: deleteError } = await supabase.from('matches').delete().eq('id', matchId).eq('team_id', teamId);
    if (deleteError) {
      // Tombstone is already written, so treat as a failure but the entry will be filtered out by `listTeamMatches`.
      throw new Error(deleteError.message || 'Delete failed.');
    }
  }

  async resetAdminCode(teamId: string): Promise<{ newAdminCode: string }> {
    const newAdminCode = generateAdminCode6();
    const { error } = await supabase.from('teams').update({ admin_code: newAdminCode }).eq('id', teamId);
    if (error) {
      throw new Error(error.message || 'Failed to reset admin code.');
    }
    return { newAdminCode };
  }
}

export const adminService = new AdminService();


