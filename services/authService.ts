// services/authService.ts
import { supabase as defaultSupabase } from '@/lib/supabase';
import { createClient } from '@supabase/supabase-js';

// ============================================
// AUTHENTICATION SERVICE
// ============================================

export class AuthService {
  
  // 🧪 MOCK MODE: Set to true for testing without auth
  private MOCK_MODE = false;
  private MOCK_TEAM_NUMBER = 1234;
  private MOCK_SCOUT_NAME = 'Test Scout';
  
  // Get Supabase client - use service role key to bypass RLS if needed
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
   * Search for team by team number
   * Returns team_id and team_code if team exists
   */
  async searchTeamByNumber(teamNumber: number): Promise<{ exists: boolean; teamId?: string; teamCode?: string }> {
    try {
      // Try RPC function first
      const { data: teamId, error: rpcError } = await this.getSupabaseClient()
        .rpc('get_team_id_by_number', { team_num: teamNumber });

      if (rpcError || !teamId) {
        // Fallback: direct query if RPC doesn't work
        const { data: teamData, error: queryError } = await this.getSupabaseClient()
          .from('teams')
          .select('id, team_code')
          .eq('team_number', teamNumber)
          .single();

        if (queryError || !teamData) {
          return { exists: false };
        }

        return {
          exists: true,
          teamId: teamData.id,
          teamCode: teamData.team_code || undefined,
        };
      }

      // If RPC returned team_id, fetch team_code
      const teamIdStr = typeof teamId === 'string' ? teamId : null;
      if (!teamIdStr) {
        return { exists: false };
      }

      const { data: teamData, error: codeError } = await this.getSupabaseClient()
        .from('teams')
        .select('team_code')
        .eq('id', teamIdStr)
        .single();

      if (codeError || !teamData) {
        return { exists: true, teamId: teamIdStr };
      }

      return {
        exists: true,
        teamId: teamIdStr,
        teamCode: teamData.team_code || undefined,
      };
    } catch (error) {
      console.error('Error searching team by number:', error);
      return { exists: false };
    }
  }

  /**
   * Validate team code and return team_id
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
   * Create a new team and return team_id and generated team_code
   */
  async createTeam(
    teamNumber: number,
    teamName?: string
  ): Promise<{ teamId: string; teamCode: string; adminCode: string }> {
    try {
      // Insert new team (trigger will auto-generate team_code)
      const adminCode = this.generateAdminCode();
      const { data: newTeam, error: insertError } = await this.getSupabaseClient()
        .from('teams')
        .insert({
          team_number: teamNumber,
          team_name: teamName || `Team ${teamNumber}`,
          admin_code: adminCode,
        })
        .select('id, team_code, admin_code')
        .single();

      if (insertError || !newTeam) {
        throw new Error(insertError?.message || 'Failed to create team');
      }

      // Wait a bit for trigger to generate code if it wasn't returned
      if (!newTeam.team_code) {
        // Retry fetching the team after a short delay
        await new Promise(resolve => setTimeout(resolve, 500));
        
        const { data: teamData, error: fetchError } = await this.getSupabaseClient()
          .from('teams')
          .select('team_code, admin_code')
          .eq('id', newTeam.id)
          .single();

        if (fetchError || !teamData?.team_code) {
          throw new Error('Team created but team code not generated');
        }

        return {
          teamId: newTeam.id,
          teamCode: teamData.team_code,
          adminCode: teamData.admin_code || adminCode,
        };
      }

      return {
        teamId: newTeam.id,
        teamCode: newTeam.team_code,
        adminCode: newTeam.admin_code || adminCode,
      };
    } catch (error) {
      console.error('Error creating team:', error);
      throw error;
    }
  }

  /**
   * Get team code by team_id
   */
  async getTeamCode(teamId: string): Promise<string | null> {
    try {
      const { data, error } = await this.getSupabaseClient()
        .from('teams')
        .select('team_code')
        .eq('id', teamId)
        .single();

      if (error || !data) {
        console.error('Error getting team code:', error);
        return null;
      }

      return data.team_code || null;
    } catch (error) {
      console.error('Error getting team code:', error);
      return null;
    }
  }

  /**
   * Validate admin code format (4 digits)
   */
  private validateAdminCodeFormat(adminCode: string): boolean {
    return /^[0-9]{4}$/.test(adminCode);
  }

  private generateAdminCode(): string {
    const n = Math.floor(Math.random() * 10_000);
    return String(n).padStart(4, '0');
  }

  /**
   * Set admin code for a team
   */
  async setAdminCode(teamId: string, adminCode: string): Promise<boolean> {
    try {
      // Validate format
      if (!this.validateAdminCodeFormat(adminCode)) {
        throw new Error('Admin code must be exactly 4 digits');
      }

      // Update teams table with admin_code
      const { error } = await this.getSupabaseClient()
        .from('teams')
        .update({ admin_code: adminCode })
        .eq('id', teamId);

      if (error) {
        console.error('Error setting admin code:', error);
        return false;
      }

      return true;
    } catch (error) {
      console.error('Error setting admin code:', error);
      return false;
    }
  }

  /**
   * Validate admin code for a team
   */
  async validateAdminCode(adminCode: string, teamId: string): Promise<boolean> {
    try {
      // Validate format
      if (!this.validateAdminCodeFormat(adminCode)) {
        return false;
      }

      // Check if admin code matches team's admin_code
      const { data, error } = await this.getSupabaseClient()
        .from('teams')
        .select('admin_code')
        .eq('id', teamId)
        .single();

      if (error || !data) {
        console.error('Error validating admin code:', error);
        return false;
      }

      return data.admin_code === adminCode;
    } catch (error) {
      console.error('Error validating admin code:', error);
      return false;
    }
  }

  /**
   * Check if team has an admin code set
   */
  async checkAdminCodeExists(teamId: string): Promise<boolean> {
    try {
      const { data, error } = await this.getSupabaseClient()
        .from('teams')
        .select('admin_code')
        .eq('id', teamId)
        .single();

      if (error || !data) {
        console.error('Error checking admin code:', error);
        return false;
      }

      return data.admin_code !== null && data.admin_code !== '';
    } catch (error) {
      console.error('Error checking admin code:', error);
      return false;
    }
  }
}

export const authService = new AuthService();

