// services/picklistService.ts
import { supabase as defaultSupabase } from '@/lib/supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

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
  
  // Get Supabase client - use service role key to bypass RLS
  private getSupabaseClient() {
    const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.EXPO_PUBLIC_SUPABASE_SERVICE_ROLE_KEY;
    
    if (!serviceRoleKey) {
      console.warn('No service role key found. Using anon key (may fail with RLS).');
      return defaultSupabase;
    }
    
    // Create client with service role key (bypasses RLS)
    return createClient(supabaseUrl!, serviceRoleKey);
  }

  /**
   * Get event_id from event_key by querying events table
   */
  async getEventIdByKey(eventKey: string): Promise<string | null> {
    try {
      const { data, error } = await this.getSupabaseClient()
        .from('events')
        .select('id')
        .eq('event_key', eventKey)
        .maybeSingle(); // Use maybeSingle() to handle 0 rows gracefully

      if (error) {
        console.error('Failed to get event_id:', error);
        return null;
      }

      // If no event found, return null (this is not an error condition)
      return data?.id || null;
    } catch (error) {
      console.error('Error getting event_id from event_key:', error);
      return null;
    }
  }

  /**
   * Fetch picklists from Supabase
   * Returns null on error or timeout
   */
  async fetchPicklistsFromSupabase(teamId: string, eventId: string | null): Promise<Picklists | null> {
    try {
      // Create timeout promise
      const timeoutPromise = new Promise<null>((resolve) => {
        setTimeout(() => resolve(null), DB_TIMEOUT_MS);
      });

      // Create fetch promise
      const fetchPromise = (async () => {
        try {
          // Build query - now we only expect 1 row per team+event
          let query = this.getSupabaseClient()
            .from('picklists')
            .select('team_rankings')
            .eq('team_id', teamId);

          // Add event_id filter (or IS NULL if eventId is null)
          if (eventId) {
            query = query.eq('event_id', eventId);
          } else {
            query = query.is('event_id', null);
          }

          const { data, error } = await query.maybeSingle();

          if (error) {
            console.error('Error fetching picklists from Supabase:', error);
            return null;
          }

          if (!data || !data.team_rankings) {
            // No picklists found, return default empty structure
            return {
              firstPick: [],
              secondPick: [],
              doNotPick: [],
            };
          }

          // team_rankings is now a JSON object with firstPick, secondPick, doNotPick
          const rankings = data.team_rankings as any;
          return {
            firstPick: Array.isArray(rankings.firstPick) ? rankings.firstPick : [],
            secondPick: Array.isArray(rankings.secondPick) ? rankings.secondPick : [],
            doNotPick: Array.isArray(rankings.doNotPick) ? rankings.doNotPick : [],
          };
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
    eventId: string | null,
    picklists: Picklists
  ): Promise<boolean> {
    try {
      // Get profile ID for created_by field (only set on insert, not update)
      const createdById = await this.getProfileIdByTeamId(teamId);

      // Build the team_rankings JSON object
      const teamRankingsJson = {
        firstPick: picklists.firstPick,
        secondPick: picklists.secondPick,
        doNotPick: picklists.doNotPick,
      };

      // Build base query for finding existing record
      let existingQuery = this.getSupabaseClient()
        .from('picklists')
        .select('id')
        .eq('team_id', teamId);

      if (eventId) {
        existingQuery = existingQuery.eq('event_id', eventId);
      } else {
        existingQuery = existingQuery.is('event_id', null);
      }

      const { data: existing, error: selectError } = await existingQuery.maybeSingle();

      if (selectError && selectError.code !== 'PGRST116') {
        console.error('Error checking existing picklist:', selectError);
        return false;
      }

      const updateData: any = {
        team_rankings: teamRankingsJson,
        updated_at: new Date().toISOString(),
      };

      if (existing) {
        // Update existing record
        let updateQuery = this.getSupabaseClient()
          .from('picklists')
          .update(updateData)
          .eq('team_id', teamId);

        if (eventId) {
          updateQuery = updateQuery.eq('event_id', eventId);
        } else {
          updateQuery = updateQuery.is('event_id', null);
        }

        const { error: updateError } = await updateQuery;

        if (updateError) {
          console.error('Error updating picklists:', updateError);
          return false;
        }
      } else {
        // Insert new record
        const insertData: any = {
          team_id: teamId,
          event_id: eventId,
          team_rankings: teamRankingsJson,
          created_by: createdById,
        };

        const { error: insertError } = await this.getSupabaseClient()
          .from('picklists')
          .insert(insertData);

        if (insertError) {
          console.error('Error inserting picklists:', insertError);
          return false;
        }
      }

      return true;
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

    // Try to get event_id from event_key
    const eventId = await this.getEventIdByKey(eventKey);
    // eventId can be null if event doesn't exist in DB yet, that's okay

    // Try Supabase first
    const supabasePicklists = await this.fetchPicklistsFromSupabase(teamId, eventId);
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

      const eventId = await this.getEventIdByKey(eventKey);
      // eventId can be null, that's okay

      // Save to Supabase (non-blocking)
      this.savePicklistsToSupabase(teamId, eventId, picklists).catch((error) => {
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

      const { data, error } = await this.getSupabaseClient()
        .rpc('get_team_id_by_number', { team_num: teamNum });

      if (error || !data) {
        // Fallback: direct query if RPC doesn't work
        const { data: teamData, error: queryError } = await this.getSupabaseClient()
          .from('teams')
          .select('id')
          .eq('team_number', teamNum)
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
   * Get profile ID for a team (for created_by field)
   * Returns the first active profile for the team, or null if none exists
   */
  private async getProfileIdByTeamId(teamId: string): Promise<string | null> {
    try {
      const { data, error } = await this.getSupabaseClient()
        .from('profiles')
        .select('id')
        .eq('team_id', teamId)
        .eq('is_active', true)
        .limit(1)
        .maybeSingle();

      if (error) {
        // Silently fail - not having a profile is okay
        return null;
      }

      return data?.id || null;
    } catch (error) {
      // Silently fail - not having a profile is okay
      return null;
    }
  }
}

export const picklistService = new PicklistService();
