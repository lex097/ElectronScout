// services/authService.ts
import { edgeFunctions } from '@/lib/edgeFunctions';

// ============================================
// AUTHENTICATION SERVICE
// ============================================

export class AuthService {
  
  // 🧪 MOCK MODE: Set to true for testing without auth
  private MOCK_MODE = false;
  private MOCK_TEAM_NUMBER = 1234;
  private MOCK_SCOUT_NAME = 'Test Scout';

  /**
   * Search for team by team number
   * Returns team_id and team_code if team exists
   */
  async searchTeamByNumber(teamNumber: number): Promise<{ exists: boolean; teamId?: string; teamCode?: string }> {
    try {
      const result = await edgeFunctions.searchTeamByNumber(teamNumber);
      return result;
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
      const result = await edgeFunctions.validateTeamCode(teamCode);
      return result.teamId;
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
      const result = await edgeFunctions.createTeam(teamNumber, teamName);
      return result;
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
      const result = await edgeFunctions.getTeamCode(teamId);
      return result.teamCode;
    } catch (error) {
      console.error('Error getting team code:', error);
      return null;
    }
  }

  /**
   * Get team number by team_id
   */
  async getTeamNumberByTeamId(teamId: string): Promise<number | null> {
    try {
      const result = await edgeFunctions.getTeamNumberByTeamId(teamId);
      return result.teamNumber;
    } catch (error) {
      console.error('Error getting team number:', error);
      return null;
    }
  }

  /**
   * Validate admin code format (4 digits)
   */
  private validateAdminCodeFormat(adminCode: string): boolean {
    return /^[0-9]{4}$/.test(adminCode);
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

      const result = await edgeFunctions.setAdminCode(teamId, adminCode);
      return result.success;
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

      const result = await edgeFunctions.validateAdminCode(adminCode, teamId);
      return result.valid;
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
      const result = await edgeFunctions.checkAdminCodeExists(teamId);
      return result.exists;
    } catch (error) {
      console.error('Error checking admin code:', error);
      return false;
    }
  }
}

export const authService = new AuthService();

