// services/supabase.sync.ts
import { edgeFunctions } from '@/lib/edgeFunctions';
import { supabase } from '@/lib/supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { MatchData } from '@/types/match';

/** A match record that includes which team did the scouting */
export interface CrossTeamMatch extends MatchData {
  scoutingTeamNumber: number;
  eventKey?: string;
}

function mapCrossTeamRow(row: any): CrossTeamMatch {
  return {
    id: row.id,
    matchNumber: row.match_number,
    teamNumber: row.team_number,
    scouterId: row.scout_name ?? '',
    gameYear: row.game_year ?? 0,
    metrics: row.metrics ?? {},
    // RPC returns match_timestamp (renamed to avoid reserved-word conflict)
    timestamp: row.match_timestamp ?? row.timestamp ?? 0,
    synced: true,
    notes: row.notes ?? undefined,
    survey: row.survey ?? undefined,
    allianceColor: row.alliance as 'red' | 'blue' | undefined,
    // RPC returns flat scouting_team_number (no nested teams object)
    scoutingTeamNumber: row.scouting_team_number ?? 0,
    eventKey: row.event_key ?? undefined,
  };
}

// ============================================
// SYNC SERVICE
// ============================================

export class SupabaseSyncService {

  // 🧪 MOCK MODE: Set to true for testing without auth
  private MOCK_MODE = false; // Disabled to use real team data from AsyncStorage
  private MOCK_TEAM_NUMBER = 1234;
  private MOCK_SCOUT_NAME = 'Test Scout';
  private MOCK_TEAM_CODE = 'ABC123'; // Mock team code for testing

  // In-memory cache — only changes on login/logout
  private _teamNumber: number | null | undefined = undefined;
  private _scoutName: string | null | undefined = undefined;
  private _teamId: string | null | undefined = undefined;

  invalidateCache(): void {
    this._teamNumber = undefined;
    this._scoutName = undefined;
    this._teamId = undefined;
  }

  /**
   * Get team number from AsyncStorage (or mock)
   */
  private async getTeamNumber(): Promise<number | null> {
    if (this.MOCK_MODE) return this.MOCK_TEAM_NUMBER;
    if (this._teamNumber !== undefined) return this._teamNumber;
    try {
      const teamNumberStr = await AsyncStorage.getItem('team_number');
      this._teamNumber = teamNumberStr ? parseInt(teamNumberStr, 10) : null;
      return this._teamNumber;
    } catch (error) {
      console.error('Error getting team number:', error);
      return null;
    }
  }

  private async getScoutName(): Promise<string | null> {
    if (this.MOCK_MODE) return this.MOCK_SCOUT_NAME;
    if (this._scoutName !== undefined) return this._scoutName;
    try {
      this._scoutName = await AsyncStorage.getItem('scout_name');
      return this._scoutName;
    } catch (error) {
      console.error('Error getting scout name:', error);
      return null;
    }
  }

  /**
   * Get team_id from team_number by looking up in teams table
   */
  async getTeamIdByNumber(teamNumber: number): Promise<string | null> {
    try {
      const result = await edgeFunctions.getTeamIdByNumber(teamNumber);
      return result.teamId;
    } catch (error) {
      console.error('Error getting team_id from team_number:', error);
      return null;
    }
  }

  /**
   * Validate team_code and return team_id
   */
  async validateTeamCode(teamCode: string): Promise<string | null> {
    try {
      const result = await edgeFunctions.validateTeamCode(teamCode);
      return result.teamId;
    } catch (error) {
      console.error('Error validating team code:', error);
      return null;
    }
  }

  /**
   * Get current team's ID from auth store (set during login with team code)
   */
  async getTeamId(): Promise<string | null> {
    if (this.MOCK_MODE) return await this.getTeamIdByNumber(this.MOCK_TEAM_NUMBER);
    if (this._teamId !== undefined) return this._teamId;
    try {
      this._teamId = await AsyncStorage.getItem('team_id');
      return this._teamId;
    } catch (error) {
      console.error('Error getting team_id:', error);
      return null;
    }
  }

  /**
   * Check if user is authenticated (has team_number and scout_name)
   */
  async isAuthenticated(): Promise<boolean> {
    if (this.MOCK_MODE) {
      return true;
    }

    try {
      const teamNumber = await this.getTeamNumber();
      const scoutName = await this.getScoutName();
      if (teamNumber === null) console.error('[Sync] Not authenticated: team_number missing from storage');
      if (scoutName === null) console.error('[Sync] Not authenticated: scout_name missing from storage');
      return teamNumber !== null && scoutName !== null;
    } catch (error) {
      console.error('Error checking authentication:', error);
      return false;
    }
  }

  /**
   * Insert a single match
   */
  async insertMatch(match: {
    id: string;
    match_number: number;
    team_number: number;
    game_year: number;
    metrics: Record<string, any>;
    calculated_points: number;
    notes?: string;
    timestamp: number;
    event_key?: string;
    scout_name?: string;
  }): Promise<boolean> {
    try {
      const teamNumber = await this.getTeamNumber();
      if (!teamNumber) {
        console.error('Cannot insert: No team context');
        return false;
      }

      const scoutName = match.scout_name || await this.getScoutName();
      if (!scoutName) {
        console.error('Cannot insert: No scout name');
        return false;
      }

      console.log('📥 Inserting match to Supabase:', {
        match_id: match.id,
        scouting_team_number: teamNumber,
        event_key: match.event_key,
        match_number: match.match_number,
        team_number: match.team_number,
      });

      const result = await edgeFunctions.insertMatch(teamNumber, match, scoutName);
      return result.success;
    } catch (error) {
      console.error('Insert failed:', error);
      return false;
    }
  }

  /**
   * Batch insert matches (up to 100 at once)
   */
  async batchInsertMatches(matches: Array<{
    id: string;
    match_number: number;
    team_number: number;
    game_year: number;
    metrics: Record<string, any>;
    calculated_points: number;
    notes?: string;
    timestamp: number;
    event_key?: string;
    scout_name?: string;
  }>): Promise<{ insertedIds: string[]; skippedDeletedIds: string[]; failedIds: string[] }> {
    try {
      const teamNumber = await this.getTeamNumber();
      if (!teamNumber) {
        console.error('Cannot batch insert: No team context');
        return { insertedIds: [], skippedDeletedIds: [], failedIds: matches.map(m => m.id) };
      }

      const scoutName = await this.getScoutName();
      if (!scoutName) {
        console.error('Cannot batch insert: No scout name');
        return { insertedIds: [], skippedDeletedIds: [], failedIds: matches.map(m => m.id) };
      }

      console.log('📥 Batch inserting to Supabase:', {
        batch_size: matches.length,
        team_number: teamNumber,
        event_key: matches[0]?.event_key || null,
        first_match_id: matches[0]?.id,
      });

      const result = await edgeFunctions.batchInsertMatches(teamNumber, matches, scoutName);
      if (result.failedIds.length > 0) {
        console.error('[Sync] Batch insert partial failure:', result.failedIds.length, 'failed IDs:', result.failedIds);
      }
      return result;
    } catch (error) {
      console.error('[Sync] Batch insert failed, all', matches.length, 'matches unsynced. Error:', error);
      return { insertedIds: [], skippedDeletedIds: [], failedIds: matches.map(m => m.id) };
    }
  }

  /**
   * Update an existing match
   */
  async updateMatch(matchId: string, updates: {
    metrics?: Record<string, any>;
    calculated_points?: number;
    notes?: string;
    survey?: Record<string, any>;
  }): Promise<boolean> {
    try {
      const result = await edgeFunctions.updateMatch(matchId, updates);
      return result.success;
    } catch (error) {
      console.error('Update failed:', error);
      return false;
    }
  }

  /**
   * Get set of match IDs that have been admin-deleted for the current team.
   * Used to exclude deleted matches from local analytics and other calculations.
   */
  async getDeletedMatchIds(): Promise<Set<string>> {
    try {
      const teamId = await this.getTeamId();
      if (!teamId) return new Set();

      const { data } = await supabase
        .from('match_deletions')
        .select('match_id')
        .eq('team_id', teamId);

      return new Set((data || []).map((d: { match_id: string }) => String(d.match_id)));
    } catch (error) {
      console.error('Failed to fetch deleted match IDs:', error);
      return new Set();
    }
  }

  /**
   * Fetch all matches for current team
   * Filters out admin-deleted matches using match_deletions tombstone table
   */
  async getMatches(eventKey?: string): Promise<any[]> {
    try {
      const teamNumber = await this.getTeamNumber();
      if (!teamNumber) {
        console.error('Cannot fetch matches: No team context');
        return [];
      }

      const result = await edgeFunctions.getMatches(teamNumber, eventKey);
      return result.matches || [];
    } catch (error) {
      console.error('Fetch failed:', error);
      return [];
    }
  }

  /**
   * Fetch all matches for a given event_key across ALL scouting teams.
   * Uses a SECURITY DEFINER RPC to bypass the teams table RLS restriction
   * that would otherwise limit the JOIN to the current team only.
   * Used for 'teams_at_event' visibility scope.
   */
  async getEventMatches(eventKey: string): Promise<CrossTeamMatch[]> {
    try {
      const { data, error } = await supabase
        .rpc('get_event_matches_cross_team', { p_event_key: eventKey });

      if (error) {
        console.error('Failed to fetch event matches:', error);
        return [];
      }

      return (data || []).map((row: any) => mapCrossTeamRow(row));
    } catch (error) {
      console.error('getEventMatches error:', error);
      return [];
    }
  }

  /**
   * Fetch all matches for a specific scouted team_number regardless of who scouted them.
   * Optionally filter by event_key. Used for 'all_teams' scope and Team Lookup.
   * Uses a SECURITY DEFINER RPC to bypass the teams table RLS restriction.
   */
  async getMatchesForTeamNumber(teamNumber: number, eventKey?: string): Promise<CrossTeamMatch[]> {
    try {
      const { data, error } = await supabase
        .rpc('get_team_number_matches_cross_team', {
          p_team_number: teamNumber,
          p_event_key: eventKey ?? null,
        });

      if (error) {
        console.error('Failed to fetch matches for team number:', error);
        return [];
      }

      return (data || []).map((row: any) => mapCrossTeamRow(row));
    } catch (error) {
      console.error('getMatchesForTeamNumber error:', error);
      return [];
    }
  }

  /**
   * Check if a match with the same match_number and team_number exists for the current team
   */
  async checkMatchExists(matchNumber: number, teamNumber: number): Promise<boolean> {
    try {
      const currentTeamNumber = await this.getTeamNumber();
      if (!currentTeamNumber) {
        return false;
      }

      const result = await edgeFunctions.checkMatchExists(currentTeamNumber, matchNumber, teamNumber);
      return result.exists;
    } catch (error) {
      console.error('Failed to check for duplicate match:', error);
      return false;
    }
  }

  /**
   * Fetch all matches submitted by the current team (filtered by team_id)
   * Only returns matches where team_id matches the logged-in user's team
   * Returns matches in MatchData format for analytics
   * Filters out admin-deleted matches using match_deletions tombstone table
   * Optionally filters by event_key if provided
   */
  async getAllTeamMatches(eventKey?: string): Promise<Array<{
    id: string;
    matchNumber: number;
    teamNumber: number;
    scouterId: string;
    gameYear: number;
    metrics: Record<string, any>;
    timestamp: number;
    synced: boolean;
    notes?: string;
  }>> {
    try {
      const teamNumber = await this.getTeamNumber();
      if (!teamNumber) {
        console.log('No team context for fetching team matches');
        return [];
      }
      
      console.log('Fetching matches for team_number:', teamNumber, 'event_key:', eventKey);

      const result = await edgeFunctions.getAllTeamMatches(teamNumber, eventKey);
      return result.matches || [];
    } catch (error) {
      console.error('Failed to fetch team matches:', error);
      return [];
    }
  }
}

export const supabaseSyncService = new SupabaseSyncService();
