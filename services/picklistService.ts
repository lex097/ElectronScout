// services/picklistService.ts
import { edgeFunctions } from '@/lib/edgeFunctions';
import AsyncStorage from '@react-native-async-storage/async-storage';

// ============================================
// PICKLIST SERVICE
// ============================================

export interface Picklists {
  firstPick: number[];
  secondPick: number[];
  doNotPick: number[];
}

const DB_TIMEOUT_MS = 5000;
const OLD_STORAGE_KEY = 'picklists';

export class PicklistService {

  /**
   * Fetch picklists from Supabase
   * Returns null on error or timeout
   */
  async fetchPicklistsFromSupabase(teamId: string, eventKey: string | null): Promise<Picklists | null> {
    try {
      // Get team_number from teamId first
      const teamNumber = await this.getTeamNumberFromTeamId(teamId);
      if (!teamNumber) {
        return null;
      }

      // Create timeout promise
      const timeoutPromise = new Promise<null>((resolve) => {
        setTimeout(() => resolve(null), DB_TIMEOUT_MS);
      });

      // Create fetch promise
      const fetchPromise = (async () => {
        try {
          const result = await edgeFunctions.fetchPicklists(teamNumber, eventKey);
          return result.picklists;
        } catch (error) {
          console.error('Error in fetchPicklistsFromSupabase:', error);
          return null;
        }
      })();

      // Race between fetch and timeout
      return await Promise.race([fetchPromise, timeoutPromise]);
    } catch (error) {
      console.error('Error fetching picklists from Supabase:', error);
      return null;
    }
  }

  /**
   * Save picklists to Supabase
   * Uses upsert pattern: check if exists, then update or insert
   */
  async savePicklistsToSupabase(
    teamId: string,
    eventKey: string | null,
    picklists: Picklists
  ): Promise<boolean> {
    try {
      const teamNumber = await this.getTeamNumberFromTeamId(teamId);
      if (!teamNumber) {
        return false;
      }

      const result = await edgeFunctions.savePicklists(teamNumber, eventKey, picklists);
      return result.success;
    } catch (error) {
      console.error('Error saving picklists to Supabase:', error);
      return false;
    }
  }

  /**
   * Get local storage key for picklists (team-scoped)
   */
  private getLocalStorageKey(teamNumber: string, eventKey: string): string {
    return `picklists_${teamNumber}_${eventKey}`;
  }

  /**
   * Fetch picklists from local storage
   */
  async fetchPicklistsFromLocal(teamNumber: string, eventKey: string): Promise<Picklists | null> {
    try {
      const key = this.getLocalStorageKey(teamNumber, eventKey);
      const stored = await AsyncStorage.getItem(key);
      if (!stored) {
        return null;
      }
      return JSON.parse(stored) as Picklists;
    } catch (error) {
      console.error('Error fetching picklists from local storage:', error);
      return null;
    }
  }

  /**
   * Save picklists to local storage
   */
  async savePicklistsToLocal(teamNumber: string, eventKey: string, picklists: Picklists): Promise<void> {
    try {
      const key = this.getLocalStorageKey(teamNumber, eventKey);
      await AsyncStorage.setItem(key, JSON.stringify(picklists));
    } catch (error) {
      console.error('Error saving picklists to local storage:', error);
      // Don't throw - local storage errors shouldn't block the app
    }
  }

  /**
   * Migrate old picklists format to new team-scoped format
   */
  async migrateOldPicklists(teamNumber: string, eventKey: string): Promise<void> {
    try {
      const oldData = await AsyncStorage.getItem(OLD_STORAGE_KEY);
      if (!oldData) {
        return; // No old data to migrate
      }

      const picklists = JSON.parse(oldData) as Picklists;
      
      // Save to new team-scoped key
      await this.savePicklistsToLocal(teamNumber, eventKey, picklists);
      
      // Delete old key
      await AsyncStorage.removeItem(OLD_STORAGE_KEY);
      
      console.log(`Migrated picklists to team-scoped format for team ${teamNumber}`);
    } catch (error) {
      console.error('Error migrating old picklists:', error);
      // Don't throw - migration errors shouldn't block the app
    }
  }

  /**
   * Load picklists (try Supabase first, fallback to local storage)
   */
  async loadPicklists(teamNumber: string, eventKey: string): Promise<Picklists> {
    // First, try to migrate old format if it exists
    await this.migrateOldPicklists(teamNumber, eventKey);

    // Try to get team_id from team_number
    const teamId = await this.getTeamIdByNumber(teamNumber);
    if (!teamId) {
      console.warn('Could not get team_id, falling back to local storage');
      const local = await this.fetchPicklistsFromLocal(teamNumber, eventKey);
      return local || { firstPick: [], secondPick: [], doNotPick: [] };
    }

    // Try Supabase first (use event_key directly)
    const supabasePicklists = await this.fetchPicklistsFromSupabase(teamId, eventKey);
    if (supabasePicklists !== null) {
      // Save to local storage as backup
      await this.savePicklistsToLocal(teamNumber, eventKey, supabasePicklists);
      return supabasePicklists;
    }

    // Fallback to local storage
    const localPicklists = await this.fetchPicklistsFromLocal(teamNumber, eventKey);
    return localPicklists || { firstPick: [], secondPick: [], doNotPick: [] };
  }

  /**
   * Save picklists (save to both Supabase and local storage)
   */
  async savePicklists(teamNumber: string, eventKey: string, picklists: Picklists): Promise<void> {
    // Save to local storage first (non-blocking backup)
    await this.savePicklistsToLocal(teamNumber, eventKey, picklists);

    // Try to save to Supabase (non-blocking, catch errors)
    try {
      const teamId = await this.getTeamIdByNumber(teamNumber);
      if (!teamId) {
        console.warn('Could not get team_id, skipping Supabase save');
        return;
      }

      // Save to Supabase (non-blocking, use event_key directly)
      this.savePicklistsToSupabase(teamId, eventKey, picklists).catch((error) => {
        console.error('Error saving picklists to Supabase (non-blocking):', error);
      });
    } catch (error) {
      console.error('Error preparing Supabase save:', error);
      // Continue - local storage is already saved
    }
  }

  /**
   * Get team_id from team_number by looking up in teams table
   */
  private async getTeamIdByNumber(teamNumber: number | string): Promise<string | null> {
    try {
      const teamNum = typeof teamNumber === 'string' ? parseInt(teamNumber, 10) : teamNumber;
      if (isNaN(teamNum)) {
        return null;
      }

      const result = await edgeFunctions.getTeamIdByNumber(teamNum);
      return result.teamId;
    } catch (error) {
      console.error('Error getting team_id from team_number:', error);
      return null;
    }
  }

  /**
   * Get team_number from teamId (using Edge Function)
   */
  private async getTeamNumberFromTeamId(teamId: string): Promise<number | null> {
    try {
      const result = await edgeFunctions.getTeamNumberByTeamId(teamId);
      return result.teamNumber;
    } catch (error) {
      console.error('Error getting team number from team ID:', error);
      return null;
    }
  }
}

export const picklistService = new PicklistService();
