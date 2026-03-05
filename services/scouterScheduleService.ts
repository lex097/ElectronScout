import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '@/lib/supabase';
import { getEventMatches } from '@/api/services/matches';

export interface ScouterAssignment {
  id: string;
  team_id: string;
  event_key: string;
  match_key: string;
  match_number: number;
  team_number: number;
  alliance: 'red' | 'blue';
  scouter_name: string;
}

export interface ScouterAssignmentRow {
  match_key: string;
  match_number: number;
  team_number: number;
  alliance: 'red' | 'blue';
  scouter_name: string;
}

class ScouterScheduleService {
  async getAssignments(
    teamId: string,
    eventKey: string
  ): Promise<ScouterAssignment[]> {
    const { data, error } = await supabase
      .from('scouter_assignments')
      .select('*')
      .eq('team_id', teamId)
      .eq('event_key', eventKey);

    if (error) {
      console.error('Error fetching scouter assignments:', error);
      return [];
    }

    return (data || []).map((row: any) => ({
      id: row.id,
      team_id: row.team_id,
      event_key: row.event_key,
      match_key: row.match_key,
      match_number: row.match_number,
      team_number: row.team_number,
      alliance: row.alliance as 'red' | 'blue',
      scouter_name: row.scouter_name,
    }));
  }

  async upsertAssignment(
    teamId: string,
    eventKey: string,
    matchKey: string,
    matchNumber: number,
    teamNumber: number,
    alliance: 'red' | 'blue',
    scouterName: string
  ): Promise<void> {
    const { error } = await supabase.from('scouter_assignments').upsert(
      {
        team_id: teamId,
        event_key: eventKey,
        match_key: matchKey,
        match_number: matchNumber,
        team_number: teamNumber,
        alliance,
        scouter_name: scouterName,
      },
      {
        onConflict: 'team_id,event_key,match_key,team_number',
      }
    );

    if (error) {
      throw new Error(error.message || 'Failed to save assignment');
    }
  }

  async deleteAssignment(
    teamId: string,
    eventKey: string,
    matchKey: string,
    teamNumber: number
  ): Promise<void> {
    const { error } = await supabase
      .from('scouter_assignments')
      .delete()
      .eq('team_id', teamId)
      .eq('event_key', eventKey)
      .eq('match_key', matchKey)
      .eq('team_number', teamNumber);

    if (error) {
      throw new Error(error.message || 'Failed to delete assignment');
    }
  }

  async getAssignmentsForScouter(
    teamId: string,
    eventKey: string,
    scouterName: string
  ): Promise<ScouterAssignmentRow[]> {
    const { data, error } = await supabase
      .from('scouter_assignments')
      .select('match_key, match_number, team_number, alliance, scouter_name')
      .eq('team_id', teamId)
      .eq('event_key', eventKey)
      .eq('scouter_name', scouterName);

    if (error) {
      console.error('Error fetching scouter assignments:', error);
      return [];
    }

    return (data || []).map((row: any) => ({
      match_key: row.match_key,
      match_number: row.match_number,
      team_number: row.team_number,
      alliance: row.alliance as 'red' | 'blue',
      scouter_name: row.scouter_name,
    }));
  }

  async getTeamScouters(teamId: string): Promise<string[]> {
    const scoutNames = new Set<string>();

    const scoutName = await AsyncStorage.getItem('scout_name');
    if (scoutName?.trim()) {
      scoutNames.add(scoutName.trim());
    }

    const { data: ebucksData } = await supabase
      .from('user_ebucks_balance')
      .select('user_identifier')
      .eq('team_id', teamId);

    if (ebucksData) {
      for (const row of ebucksData) {
        const uid = row.user_identifier as string;
        if (uid && uid.includes(':')) {
          const name = uid.split(':')[0]?.trim();
          if (name) scoutNames.add(name);
        }
      }
    }

    const { adminService } = await import('./adminService');
    const matches = await adminService.listTeamMatches(teamId);
    for (const m of matches) {
      if (m.scout_name?.trim()) {
        scoutNames.add(m.scout_name.trim());
      }
    }

    return Array.from(scoutNames).sort();
  }

  getAssignmentMap(
    assignments: ScouterAssignment[]
  ): Map<string, string> {
    const map = new Map<string, string>();
    for (const a of assignments) {
      map.set(`${a.match_key}:${a.team_number}`, a.scouter_name);
    }
    return map;
  }

  /**
   * Generate automated scouting schedule.
   * Requires at least 6 scouters.
   * Uses least-assigned-first rotation for fairness, with rotating slot positions.
   * Uses bulk upsert for fast execution (1–2 network calls instead of hundreds).
   * @param scoutersToInclude - Optional list of scouter names to include. If omitted, fetches all team scouters.
   */
  async generateSchedule(
    teamId: string,
    eventKey: string,
    scoutersToInclude?: string[]
  ): Promise<{ success: true } | { success: false; error: string }> {
    console.warn('[GenerateSchedule] Started', { teamId, eventKey });

    const scouters = scoutersToInclude ?? (await this.getTeamScouters(teamId));
    console.warn('[GenerateSchedule] Fetched scouters:', scouters.length, scouters);

    if (scouters.length < 6) {
      console.warn('[GenerateSchedule] Not enough scouters, aborting');
      return {
        success: false,
        error: `Need at least 6 scouters registered. You have ${scouters.length}.`,
      };
    }

    const matches = await getEventMatches(eventKey);
    console.warn('[GenerateSchedule] Fetched matches:', matches.length);
    const assignmentCount = new Map<string, number>();
    scouters.forEach((s) => assignmentCount.set(s, 0));

    const rows: Array<{
      team_id: string;
      event_key: string;
      match_key: string;
      match_number: number;
      team_number: number;
      alliance: 'red' | 'blue';
      scouter_name: string;
    }> = [];

    for (let matchIdx = 0; matchIdx < matches.length; matchIdx++) {
      const match = matches[matchIdx];
      const redTeams = match.alliances.red.team_keys.map((k) => ({
        tn: parseInt(k.replace('frc', ''), 10),
        alliance: 'red' as const,
      }));
      const blueTeams = match.alliances.blue.team_keys.map((k) => ({
        tn: parseInt(k.replace('frc', ''), 10),
        alliance: 'blue' as const,
      }));
      const teams = [...redTeams, ...blueTeams];
      if (teams.length !== 6) continue;

      const sorted = [...scouters].sort(
        (a, b) => (assignmentCount.get(a) ?? 0) - (assignmentCount.get(b) ?? 0)
      );
      const scoutsForMatch = sorted.slice(0, 6);

      for (let scoutIdx = 0; scoutIdx < 6; scoutIdx++) {
        const slot = (matchIdx + scoutIdx) % 6;
        const { tn, alliance } = teams[slot];
        const scouterName = scoutsForMatch[scoutIdx];
        rows.push({
          team_id: teamId,
          event_key: eventKey,
          match_key: match.key,
          match_number: match.match_number,
          team_number: tn,
          alliance,
          scouter_name: scouterName,
        });
        assignmentCount.set(
          scouterName,
          (assignmentCount.get(scouterName) ?? 0) + 1
        );
      }
    }

    if (rows.length === 0) {
      console.warn('[GenerateSchedule] No assignments to save, done');
      return { success: true };
    }

    console.warn('[GenerateSchedule] Built', rows.length, 'assignment rows');

    console.warn('[GenerateSchedule] Deleting existing assignments...');
    const { error: deleteError } = await supabase
      .from('scouter_assignments')
      .delete()
      .eq('team_id', teamId)
      .eq('event_key', eventKey);

    if (deleteError) {
      throw new Error(deleteError.message || 'Failed to clear existing schedule');
    }
    console.warn('[GenerateSchedule] Deleted existing assignments');

    console.warn('[GenerateSchedule] Upserting', rows.length, 'rows...');
    const { error: upsertError } = await supabase
      .from('scouter_assignments')
      .upsert(rows, {
        onConflict: 'team_id,event_key,match_key,team_number',
      });

    if (upsertError) {
      throw new Error(upsertError.message || 'Failed to save schedule');
    }
    console.warn('[GenerateSchedule] Upsert complete');

    console.warn('[GenerateSchedule] Done');
    return { success: true };
  }
}

export const scouterScheduleService = new ScouterScheduleService();
