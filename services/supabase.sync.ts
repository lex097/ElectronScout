// services/supabase.sync.ts
import { supabase as defaultSupabase } from '@/lib/supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

// ============================================
// SYNC SERVICE
// ============================================

export class SupabaseSyncService {
  
  // 🧪 MOCK MODE: Set to true for testing without auth
  private MOCK_MODE = false; // Disabled to use real team data from AsyncStorage
  private MOCK_TEAM_NUMBER = 1234;
  private MOCK_SCOUT_NAME = 'Test Scout';
  private MOCK_TEAM_CODE = 'ABC123'; // Mock team code for testing
  
  // Get Supabase client - use service role key to bypass RLS
  private getSupabaseClient() {
    const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.EXPO_PUBLIC_SUPABASE_SERVICE_ROLE_KEY;
    
    if (!serviceRoleKey) {
      console.warn('No service role key found. Using anon key (may fail with RLS).');
      // Fallback to regular client if service role key not available
      return defaultSupabase;
    }
    
    // Create client with service role key (bypasses RLS)
    return createClient(supabaseUrl!, serviceRoleKey);
  }

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
      const { data, error } = await this.getSupabaseClient()
        .rpc('get_team_id_by_number', { team_num: teamNumber });

      if (error || !data) {
        // Fallback: direct query if RPC doesn't work
        const { data: teamData, error: queryError } = await this.getSupabaseClient()
          .from('teams')
          .select('id')
          .eq('team_number', teamNumber)
          .single();

        if (queryError) {
          console.error('Failed to get team_id:', queryError);
          return null;
        }

        return teamData?.id || null;
      }

      // RPC returns the UUID directly
      return typeof data === 'string' ? data : null;
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
      const { data, error } = await this.getSupabaseClient()
        .rpc('validate_team_code_and_get_id', { code: teamCode });

      if (error || !data) {
        // Fallback: direct query if RPC doesn't work
        const { data: teamData, error: queryError } = await this.getSupabaseClient()
          .from('teams')
          .select('id')
          .eq('team_code', teamCode)
          .single();

        if (queryError) {
          console.error('Invalid team code:', queryError);
          return null;
        }

        return teamData?.id || null;
      }

      // RPC returns the UUID directly
      return typeof data === 'string' ? data : null;
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
    event_id?: string;
    scout_name?: string;
  }): Promise<boolean> {
    try {
      const teamId = await this.getTeamId();
      if (!teamId) {
        console.error('Cannot insert: No team context');
        return false;
      }

      const scoutName = match.scout_name || await this.getScoutName();
      if (!scoutName) {
        console.error('Cannot insert: No scout name');
        return false;
      }

      const insertData = {
        id: match.id,
        team_id: teamId, // team_id = the scouting team (team that submitted this data)
        event_id: match.event_id || null,
        match_number: match.match_number,
        team_number: match.team_number, // team_number = the team being scouted
        scout_name: scoutName,
        game_year: match.game_year,
        metrics: match.metrics,
        calculated_points: match.calculated_points,
        notes: match.notes,
        timestamp: match.timestamp,
      };
      
      console.log('Inserting match with team_id:', teamId, 'for scouted team:', match.team_number);
      
      // console.log('Inserting to Supabase:', {
      //   id: insertData.id,
      //   calculated_points: insertData.calculated_points,
      //   calculated_points_type: typeof insertData.calculated_points
      // });

      const { error } = await this.getSupabaseClient()
        .from('matches')
        .insert(insertData);

      if (error) {
        console.error('Insert error:', error);
        return false;
      }

      return true;
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
    event_id?: string;
    scout_name?: string;
  }>): Promise<{ success: number; failed: number }> {
    try {
      const teamId = await this.getTeamId();
      if (!teamId) {
        console.error('Cannot batch insert: No team context');
        return { success: 0, failed: matches.length };
      }

      const scoutName = await this.getScoutName();
      if (!scoutName) {
        console.error('Cannot batch insert: No scout name');
        return { success: 0, failed: matches.length };
      }

      const batchSize = 100;
      let successCount = 0;
      let failedCount = 0;

      for (let i = 0; i < matches.length; i += batchSize) {
        const batch = matches.slice(i, i + batchSize);
        
        const insertData = batch.map(m => ({
          id: m.id,
          team_id: teamId, // team_id = the scouting team (team that submitted this data)
          event_id: m.event_id || null,
          match_number: m.match_number,
          team_number: m.team_number, // team_number = the team being scouted
          scout_name: m.scout_name || scoutName,
          game_year: m.game_year,
          metrics: m.metrics,
          calculated_points: m.calculated_points,
          notes: m.notes,
          timestamp: m.timestamp,
        }));
        
        console.log(`Batch inserting ${batch.length} matches with team_id:`, teamId);
        
      // console.log('Batch inserting to Supabase:', 
      //   insertData.map(d => ({ 
      //     id: d.id, 
      //     calculated_points: d.calculated_points,
      //     type: typeof d.calculated_points
      //   }))
      // );
      
      // Log the full first item to see everything being sent
      // console.log('Full insert data (first item):', JSON.stringify(insertData[0], null, 2));

      const { data, error } = await this.getSupabaseClient()
        .from('matches')
        .insert(insertData)
        .select('id, calculated_points');

        if (error) {
          console.error('Batch insert error:', error);
          failedCount += batch.length;
        } else {
          // console.log('Supabase returned:', data);
          // console.log('Inserted calculated_points:', data?.map(d => ({ id: d.id, calculated_points: d.calculated_points })));
          successCount += batch.length;
        }
      }

      return { success: successCount, failed: failedCount };
    } catch (error) {
      console.error('Batch insert failed:', error);
      return { success: 0, failed: matches.length };
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
      const { error } = await this.getSupabaseClient()
        .from('matches')
        .update(updates)
        .eq('id', matchId);

      if (error) {
        console.error('Update error:', error);
        return false;
      }

      return true;
    } catch (error) {
      console.error('Update failed:', error);
      return false;
    }
  }

  /**
   * Fetch all matches for current team
   */
  async getMatches(eventId?: string): Promise<any[]> {
    try {
      const teamId = await this.getTeamId();
      if (!teamId) {
        console.error('Cannot fetch matches: No team context');
        return [];
      }

      let query = this.getSupabaseClient()
        .from('matches')
        .select('*')
        .eq('team_id', teamId)
        .order('match_number', { ascending: true });

      if (eventId) {
        query = query.eq('event_id', eventId);
      }

      const { data, error } = await query;

      if (error) {
        console.error('Fetch error:', error);
        return [];
      }

      return data || [];
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
      const teamId = await this.getTeamId();
      if (!teamId) {
        return false;
      }

      const { data, error } = await this.getSupabaseClient()
        .from('matches')
        .select('id')
        .eq('team_id', teamId)
        .eq('match_number', matchNumber)
        .eq('team_number', teamNumber)
        .limit(1);

      if (error) {
        console.error('Error checking for duplicate match:', error);
        return false;
      }

      return (data?.length || 0) > 0;
    } catch (error) {
      console.error('Failed to check for duplicate match:', error);
      return false;
    }
  }

  /**
   * Fetch all matches submitted by the current team (filtered by team_id)
   * Only returns matches where team_id matches the logged-in user's team
   * Returns matches in MatchData format for analytics
   */
  async getAllTeamMatches(): Promise<Array<{
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
      const teamId = await this.getTeamId();
      if (!teamId) {
        console.log('No team context for fetching team matches');
        return [];
      }
      
      console.log('Fetching matches for team_id:', teamId);
      
      const { data, error } = await this.getSupabaseClient()
        .from('matches')
        .select('*')
        .eq('team_id', teamId) // Only get matches submitted by this team
        .order('timestamp', { ascending: false });
      
      if (error) {
        console.error('Failed to fetch team matches:', error);
        return [];
      }
      
      if (!data) return [];
      
      // Transform Supabase format to MatchData format
      return data.map(match => ({
        id: match.id,
        matchNumber: match.match_number,
        teamNumber: match.team_number,
        scouterId: match.scout_name || 'Unknown', // Use scout_name as scouterId
        gameYear: match.game_year,
        metrics: match.metrics,
        notes: match.notes || '',
        timestamp: match.timestamp,
        synced: true, // All Supabase data is synced
      }));
    } catch (error) {
      console.error('Failed to fetch team matches:', error);
      return [];
    }
  }
}

export const supabaseSyncService = new SupabaseSyncService();
