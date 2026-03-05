// services/database.ts
import { MatchData } from '@/types/match';
import * as SQLite from 'expo-sqlite';

const DB_NAME = 'frc_scout.db';

/** Detect expo-sqlite Android NullPointerException (native handle becomes invalid) */
function isConnectionInvalidError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error);
  return (
    msg.includes('prepareAsync') ||
    msg.includes('NullPointerException') ||
    msg.includes('ERR_UNEXPECTED')
  );
}

class DatabaseService {
  private db: SQLite.SQLiteDatabase | null = null;
  private initPromise: Promise<void> | null = null;

  // Initialize database (idempotent - safe to call multiple times)
  async init(): Promise<void> {
    if (this.initPromise) return this.initPromise;
    this.initPromise = (async () => {
      try {
        this.db = await SQLite.openDatabaseAsync(DB_NAME);
        await this.createTables();
        console.log('Database initialized successfully');
      } catch (error) {
        console.error('Failed to initialize database:', error);
        this.initPromise = null;
        throw error;
      }
    })();
    return this.initPromise;
  }

  /** Reset connection and invalidate initPromise (call when native handle becomes invalid) */
  private resetConnection(): void {
    this.db = null;
    this.initPromise = null;
    console.warn('[Database] Connection reset due to invalid native handle');
  }

  /** Ensure DB is ready before operations (call before saveMatch etc.) */
  async ensureReady(): Promise<void> {
    if (this.db) return;
    await this.init();
  }

  /** Run a DB operation with retry on invalid connection (Android NullPointerException) */
  private async runWithRetry<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (isConnectionInvalidError(error)) {
        this.resetConnection();
        await this.init();
        return await operation();
      }
      throw error;
    }
  }

  private async createTables(): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    await this.db.execAsync(`
      CREATE TABLE IF NOT EXISTS matches (
        id TEXT PRIMARY KEY,
        match_number INTEGER NOT NULL,
        team_number INTEGER NOT NULL,
        scouter_id TEXT NOT NULL,
        game_year INTEGER NOT NULL,
        metrics TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        synced INTEGER DEFAULT 0,
        notes TEXT,
        survey TEXT,
        alliance TEXT,
        created_at INTEGER DEFAULT (strftime('%s', 'now'))
      );

      CREATE INDEX IF NOT EXISTS idx_match_number ON matches(match_number);
      CREATE INDEX IF NOT EXISTS idx_team_number ON matches(team_number);
      CREATE INDEX IF NOT EXISTS idx_synced ON matches(synced);
    `);
    // Add alliance column if it doesn't exist (for existing DBs)
    try {
      await this.db!.execAsync(`ALTER TABLE matches ADD COLUMN alliance TEXT`);
    } catch {
      // Column already exists, ignore
    }
    // Add survey column if it doesn't exist
    try {
      await this.db!.execAsync(`ALTER TABLE matches ADD COLUMN survey TEXT`);
    } catch {
      // Column already exists, ignore
    }
  }

  // Save a match (insert or update)
  async saveMatch(match: MatchData): Promise<void> {
    await this.ensureReady();
    await this.runWithRetry(async () => {
      if (!this.db) throw new Error('Database not initialized');
      await this.db.runAsync(
        `INSERT OR REPLACE INTO matches 
         (id, match_number, team_number, scouter_id, game_year, metrics, timestamp, synced, notes, survey, alliance)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          match.id,
          match.matchNumber,
          match.teamNumber,
          match.scouterId,
          match.gameYear,
          JSON.stringify(match.metrics),
          match.timestamp,
          match.synced ? 1 : 0,
          match.notes || null,
          match.survey ? JSON.stringify(match.survey) : null,
          match.allianceColor || null
        ]
      );
    });
  }

  // Get all matches
  async getAllMatches(): Promise<MatchData[]> {
    if (!this.db) throw new Error('Database not initialized');

    const result = await this.db.getAllAsync<any>(
      'SELECT * FROM matches ORDER BY match_number DESC, timestamp DESC'
    );

    return result.map(row => this.rowToMatch(row));
  }

  // Get matches for a specific team
  async getMatchesByTeam(teamNumber: number): Promise<MatchData[]> {
    if (!this.db) throw new Error('Database not initialized');

    const result = await this.db.getAllAsync<any>(
      'SELECT * FROM matches WHERE team_number = ? ORDER BY match_number ASC',
      [teamNumber]
    );

    return result.map(row => this.rowToMatch(row));
  }

  // Get unsynced matches
  async getUnsyncedMatches(): Promise<MatchData[]> {
    if (!this.db) throw new Error('Database not initialized');

    const result = await this.db.getAllAsync<any>(
      'SELECT * FROM matches WHERE synced = 0 ORDER BY timestamp ASC'
    );

    return result.map(row => this.rowToMatch(row));
  }

  // Mark match as synced
  async markAsSynced(matchId: string): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    await this.db.runAsync(
      'UPDATE matches SET synced = 1 WHERE id = ?',
      [matchId]
    );
  }

  // Delete a match
  async deleteMatch(matchId: string): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    await this.db.runAsync('DELETE FROM matches WHERE id = ?', [matchId]);
  }

  // Get match count
  async getMatchCount(): Promise<number> {
    if (!this.db) throw new Error('Database not initialized');

    const result = await this.db.getFirstAsync<{ count: number }>(
      'SELECT COUNT(*) as count FROM matches'
    );

    return result?.count || 0;
  }

  // Get unsynced count
  async getUnsyncedCount(): Promise<number> {
    if (!this.db) throw new Error('Database not initialized');

    const result = await this.db.getFirstAsync<{ count: number }>(
      'SELECT COUNT(*) as count FROM matches WHERE synced = 0'
    );

    return result?.count || 0;
  }

  // Clear all data (for testing)
  async clearAllMatches(): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    await this.db.runAsync('DELETE FROM matches');
  }

  // Check if a match with the same match_number and team_number exists
  async checkMatchExists(matchNumber: number, teamNumber: number): Promise<boolean> {
    if (!this.db) throw new Error('Database not initialized');

    const result = await this.db.getFirstAsync<{ count: number }>(
      'SELECT COUNT(*) as count FROM matches WHERE match_number = ? AND team_number = ?',
      [matchNumber, teamNumber]
    );

    return (result?.count || 0) > 0;
  }

  // Check if current scouter has already scouted this match/team
  async checkMatchScoutedByScouter(
    matchNumber: number,
    teamNumber: number,
    scouterId: string
  ): Promise<boolean> {
    if (!this.db) throw new Error('Database not initialized');

    const result = await this.db.getFirstAsync<{ count: number }>(
      'SELECT COUNT(*) as count FROM matches WHERE match_number = ? AND team_number = ? AND scouter_id = ?',
      [matchNumber, teamNumber, scouterId]
    );

    return (result?.count || 0) > 0;
  }

  // Helper to convert DB row to MatchData
  private rowToMatch(row: any): MatchData {
    return {
      id: row.id,
      matchNumber: row.match_number,
      teamNumber: row.team_number,
      scouterId: row.scouter_id,
      gameYear: row.game_year,
      metrics: JSON.parse(row.metrics),
      timestamp: row.timestamp,
      synced: row.synced === 1,
      notes: row.notes,
      survey: row.survey ? JSON.parse(row.survey) : undefined,
      allianceColor: row.alliance === 'red' || row.alliance === 'blue' ? row.alliance : undefined
    };
  }
}

// Export singleton instance
export const db = new DatabaseService();