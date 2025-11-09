// services/syncTransformer.ts
import { calculateMatchPoints } from '../config/gameConfig';
import { MatchData } from '../types/match';
import { db } from './database';
import { supabaseSyncService } from './supabase.sync';

/**
 * Transform SQLite match to Supabase format
 */
export class SyncTransformer {
  
  static transformMatch(sqliteMatch: MatchData): {
    id: string;
    match_number: number;
    team_number: number;
    game_year: number;
    metrics: Record<string, any>;
    calculated_points: number;
    notes?: string;
    timestamp: number;
    event_id?: string;
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
      event_id: undefined, // Optional: Add event tracking later
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
    eventId?: string
  ): Promise<{
    toInsert: MatchData[];
    toUpdate: MatchData[];
    toSkip: MatchData[];
  }> {
    try {
      const remoteMatches = await supabaseSyncService.getMatches(eventId);
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

      const transformed = SyncTransformer.transformMatch(match);

      if (!SyncTransformer.validateMatch(transformed)) {
        console.error('Invalid match data:', transformed);
        return false;
      }

      const success = await supabaseSyncService.insertMatch(transformed);

      if (success) {
        console.log(`✅ Match ${match.id} uploaded`);
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

      const { toInsert, toUpdate, toSkip } = await SyncTransformer.detectDuplicates(matches);

      console.log(`📊 Batch: ${toInsert.length} new, ${toUpdate.length} updates, ${toSkip.length} skipped`);

      let successCount = 0;
      let failedCount = 0;

      // Insert new matches
      if (toInsert.length > 0) {
        const transformed = toInsert.map(m => SyncTransformer.transformMatch(m));
        const result = await supabaseSyncService.batchInsertMatches(transformed);
        
        successCount += result.success;
        failedCount += result.failed;

        // Mark successful as synced
        for (let i = 0; i < toInsert.length; i++) {
          if (i < result.success) {
            await db.markAsSynced(toInsert[i].id);
          }
        }
      }

      // Update existing matches
      for (const match of toUpdate) {
        const transformed = SyncTransformer.transformMatch(match);
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