// services/supabase.sync.ts
import { edgeFunctions } from '@/lib/edgeFunctions';
import AsyncStorage from '@react-native-async-storage/async-storage';

// ============================================
// SYNC SERVICE
// ============================================

export class SupabaseSyncService {
  
  // 🧪 MOCK MODE: Set to true for testing without auth
  private MOCK_MODE = false; // Disabled to use real team data from AsyncStorage
  private MOCK_TEAM_NUMBER = 1234;
  private MOCK_SCOUT_NAME = 'Test Scout';
  private MOCK_TEAM_CODE = 'ABC123'; // Mock team code for testing

  /**
   * Get team number from AsyncStorage (or mock)
   */
  private async getTeamNumber(): Promise<number | null> {
    if (this.MOCK_MODE) {
      return this.MOCK_TEAM_NUMBER;
    }
    
    try {
      const teamNumberStr = await AsyncStorage.getItem('team_number');
      if (!teamNumberStr) return null;
      return parseInt(teamNumberStr, 10);
    } catch (error) {
      console.error('Error getting team number:', error);
      return null;
    }
  }

  /**
   * Get scout name from AsyncStorage (or mock)
   */
  private async getScoutName(): Promise<string | null> {
    if (this.MOCK_MODE) {
      return this.MOCK_SCOUT_NAME;
    }
    
    try {
      return await AsyncStorage.getItem('scout_name');
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
   * Get current team's ID from team_number stored in AsyncStorage
   */
  async getTeamId(): Promise<string | null> {
    if (this.MOCK_MODE) {
      // In mock mode, lookup team_id from mock team_number
      return await this.getTeamIdByNumber(this.MOCK_TEAM_NUMBER);
    }

    try {
      const teamNumber = await this.getTeamNumber();
      if (!teamNumber) {
        console.error('No team number found');
        return null;
      }

      return await this.getTeamIdByNumber(teamNumber);
    } catch (error) {
      console.error('Error getting team context:', error);
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
      return teamNumber !== null && scoutName !== null;
    } catch (error) {
      console.error('Error checking authentication:', error);
      return false;
    }
  }

  /**
   * Check which match IDs have been admin-deleted (tombstoned) for this team.
   * Note: This is now handled by Edge Functions, but kept for compatibility
   */
  private async getDeletedMatchIds(teamId: string, matchIds: string[]): Promise<Set<string>> {
    // Edge Functions handle deletion filtering internally
    return new Set();
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
      return result;
    } catch (error) {
      console.error('Batch insert failed:', error);
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
