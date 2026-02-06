// services/syncTransformer.ts
import AsyncStorage from '@react-native-async-storage/async-storage';
import { calculateMatchPoints } from '../config/gameConfig';
import { MatchData } from '../types/match';
import { db } from './database';
import { supabaseSyncService } from './supabase.sync';

const SELECTED_EVENT_KEY = 'selected_event_key';

/**
 * Transform SQLite match to Supabase format
 */
export class SyncTransformer {
  
  static transformMatch(sqliteMatch: MatchData, eventKey?: string | null): {
    id: string;
    match_number: number;
    team_number: number;
    game_year: number;
    metrics: Record<string, any>;
    calculated_points: number;
    notes?: string;
    timestamp: number;
    event_key?: string;
  } {
    // Parse metrics if it's a JSON string
    const metrics = typeof sqliteMatch.metrics === 'string' 
      ? JSON.parse(sqliteMatch.metrics)
      : sqliteMatch.metrics;

    // Calculate points
    const calculatedPoints = calculateMatchPoints(metrics);
    
    // Debug logging
    // console.log('Transform Debug:', {
    //   matchId: sqliteMatch.id,
    //   metricsType: typeof sqliteMatch.metrics,
    //   parsedMetrics: metrics,
    //   calculatedPoints: calculatedPoints
    // });

    return {
      id: sqliteMatch.id,
      match_number: sqliteMatch.matchNumber,
      team_number: sqliteMatch.teamNumber,
      game_year: sqliteMatch.gameYear,
      metrics: metrics,
      calculated_points: calculatedPoints,
      notes: sqliteMatch.notes,
      timestamp: sqliteMatch.timestamp,
      event_key: eventKey || undefined,
    };
  }

  static validateMatch(match: any): boolean {
    if (!match.id) return false;
    if (!match.match_number || match.match_number < 1) return false;
    if (!match.team_number || match.team_number < 1 || match.team_number > 9999) return false;
    if (!match.game_year || match.game_year < 2000) return false;
    if (!match.metrics || typeof match.metrics !== 'object') return false;
    if (typeof match.calculated_points !== 'number' || match.calculated_points < 0) return false;
    return true;
  }

  /**
   * Detect duplicates by checking what exists in Supabase
   */
  static async detectDuplicates(
    localMatches: MatchData[],
    eventKey?: string
  ): Promise<{
    toInsert: MatchData[];
    toUpdate: MatchData[];
    toSkip: MatchData[];
  }> {
    try {
      const remoteMatches = await supabaseSyncService.getMatches(eventKey);
      const remoteIds = new Set(remoteMatches.map((m: any) => m.id));

      const toInsert: MatchData[] = [];
      const toUpdate: MatchData[] = [];
      const toSkip: MatchData[] = [];

      for (const localMatch of localMatches) {
        if (!remoteIds.has(localMatch.id)) {
          toInsert.push(localMatch);
        } else {
          const remoteMatch = remoteMatches.find((m: any) => m.id === localMatch.id);
          if (remoteMatch && localMatch.timestamp > remoteMatch.timestamp) {
            toUpdate.push(localMatch);
          } else {
            toSkip.push(localMatch);
          }
        }
      }

      return { toInsert, toUpdate, toSkip };
    } catch (error) {
      console.error('Duplicate detection failed:', error);
      return { toInsert: localMatches, toUpdate: [], toSkip: [] };
    }
  }
}

/**
 * Main Sync Manager
 */
export class SyncManager {
  
  /**
   * Upload a single match
   */
  async uploadMatch(match: MatchData): Promise<boolean> {
    try {
      const isAuth = await supabaseSyncService.isAuthenticated();
      if (!isAuth) {
        console.log('Not authenticated - skipping upload');
        return false;
      }

      // Get event_key from selected event
      let eventKey: string | null = null;
      try {
        eventKey = await AsyncStorage.getItem(SELECTED_EVENT_KEY);
        console.log('📅 Upload match - event_key from storage:', eventKey);
      } catch (error) {
        console.error('Error getting event_key:', error);
        // Continue without event_key if there's an error
      }

      const transformed = SyncTransformer.transformMatch(match, eventKey);
      console.log('📅 Upload match - Transformed match event_key:', transformed.event_key);

      if (!SyncTransformer.validateMatch(transformed)) {
        console.error('Invalid match data:', transformed);
        return false;
      }

      const success = await supabaseSyncService.insertMatch(transformed);

      if (success) {
        console.log(`✅ Match ${match.id} uploaded`);
        // Refresh team_statistics view after successful upload
        try {
          const { teamStatisticsService } = await import('./teamStatisticsService');
          await teamStatisticsService.refreshTeamStatistics();
          console.log('✅ Refreshed team_statistics view after single match upload');
        } catch (refreshError) {
          console.error('Error refreshing team_statistics view:', refreshError);
          // Don't fail the upload if refresh fails
        }
      }

      return success;

    } catch (error) {
      console.error('Upload failed:', error);
      return false;
    }
  }

  /**
   * Batch upload with duplicate detection
   */
  async batchUpload(matches: MatchData[]): Promise<{
    success: number;
    failed: number;
    skipped: number;
  }> {
    try {
      const isAuth = await supabaseSyncService.isAuthenticated();
      if (!isAuth) {
        console.log('Not authenticated - cannot upload');
        return { success: 0, failed: matches.length, skipped: 0 };
      }

      // Get event_key from selected event
      let eventKey: string | null = null;
      try {
        eventKey = await AsyncStorage.getItem(SELECTED_EVENT_KEY);
        console.log('📅 Batch upload - event_key from storage:', eventKey);
      } catch (error) {
        console.error('Error getting event_key:', error);
        // Continue without event_key if there's an error
      }

      const { toInsert, toUpdate, toSkip } = await SyncTransformer.detectDuplicates(matches, eventKey || undefined);

      console.log(`📊 Batch: ${toInsert.length} new, ${toUpdate.length} updates, ${toSkip.length} skipped`);

      let successCount = 0;
      let failedCount = 0;

      // Insert new matches
      if (toInsert.length > 0) {
        const transformed = toInsert.map(m => SyncTransformer.transformMatch(m, eventKey));
        console.log('📅 Batch upload - Inserting', transformed.length, 'matches with event_key:', eventKey);
        if (transformed.length > 0) {
          console.log('📅 Batch upload - First match event_key:', transformed[0].event_key);
        }
        const result = await supabaseSyncService.batchInsertMatches(transformed);
        
        const successIds = new Set([...result.insertedIds, ...result.skippedDeletedIds]);
        const failedIds = new Set(result.failedIds);

        successCount += successIds.size;
        failedCount += failedIds.size;

        // Mark successful (including admin-deleted) as synced so they clear from local DB
        for (const match of toInsert) {
          if (successIds.has(match.id)) {
            await db.markAsSynced(match.id);
          }
        }
      }

      // Update existing matches
      for (const match of toUpdate) {
        const transformed = SyncTransformer.transformMatch(match, eventKey);
        const success = await supabaseSyncService.updateMatch(match.id, {
          metrics: transformed.metrics,
          calculated_points: transformed.calculated_points,
          notes: transformed.notes,
        });

        if (success) {
          await db.markAsSynced(match.id);
          successCount++;
        } else {
          failedCount++;
        }
      }

      // Mark skipped as synced
      for (const match of toSkip) {
        await db.markAsSynced(match.id);
      }

      // Refresh team_statistics materialized view after successful sync
      if (successCount > 0) {
        try {
          const { teamStatisticsService } = await import('./teamStatisticsService');
          await teamStatisticsService.refreshTeamStatistics();
          console.log('✅ Refreshed team_statistics view after sync');
        } catch (refreshError) {
          console.error('Error refreshing team_statistics view:', refreshError);
          // Don't fail the sync if refresh fails
        }
      }

      return {
        success: successCount,
        failed: failedCount,
        skipped: toSkip.length,
      };

    } catch (error) {
      console.error('Batch upload failed:', error);
      return { success: 0, failed: matches.length, skipped: 0 };
    }
  }

  /**
   * Full sync: Upload all unsynced matches
   */
  async fullSync(): Promise<{
    success: number;
    failed: number;
    skipped: number;
  }> {
    try {
      const unsyncedMatches = await db.getUnsyncedMatches();
      
      if (unsyncedMatches.length === 0) {
        console.log('No matches to sync');
        return { success: 0, failed: 0, skipped: 0 };
      }

      console.log(`Starting sync of ${unsyncedMatches.length} matches`);
      const result = await this.batchUpload(unsyncedMatches);

      const allMatches = await db.getAllMatches();
      const syncedMatches = allMatches.filter(match => match.synced);

      if (syncedMatches.length > 0) {
        await Promise.all(syncedMatches.map(match => db.deleteMatch(match.id)));
        console.log(`🧹 Removed ${syncedMatches.length} synced matches from local DB`);
      }

      return result;

    } catch (error) {
      console.error('Full sync failed:', error);
      return { success: 0, failed: 0, skipped: 0 };
    }
  }

  /**
   * Verify sync integrity
   */
  async verifySyncIntegrity(): Promise<{
    local: number;
    remote: number;
    synced: number;
    unsynced: number;
  }> { 
    try {
      const localMatches = await db.getAllMatches();
      const remoteMatches = await supabaseSyncService.getMatches();

      const syncedCount = localMatches.filter(m => m.synced).length;
      const unsyncedCount = localMatches.filter(m => !m.synced).length;

      return {
        local: localMatches.length,
        remote: remoteMatches.length,
        synced: syncedCount,
        unsynced: unsyncedCount,
      };
    } catch (error) {
      console.error('Verify sync failed:', error);
      const localMatches = await db.getAllMatches();
      return {
        local: localMatches.length,
        remote: 0,
        synced: 0,
        unsynced: localMatches.length,
      };
    }
  }
}

export const syncManager = new SyncManager();