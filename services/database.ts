// services/database.ts
import { MatchData } from '@/types/match';
import * as SQLite from 'expo-sqlite';

const DB_NAME = 'frc_scout.db';

class DatabaseService {
  private db: SQLite.SQLiteDatabase | null = null;

  // Initialize database
  async init(): Promise<void> {
    try {
      this.db = await SQLite.openDatabaseAsync(DB_NAME);
      await this.createTables();
      console.log('Database initialized successfully');
    } catch (error) {
      console.error('Failed to initialize database:', error);
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
        created_at INTEGER DEFAULT (strftime('%s', 'now'))
      );

      CREATE INDEX IF NOT EXISTS idx_match_number ON matches(match_number);
      CREATE INDEX IF NOT EXISTS idx_team_number ON matches(team_number);
      CREATE INDEX IF NOT EXISTS idx_synced ON matches(synced);
    `);
  }

  // Save a match (insert or update)
  async saveMatch(match: MatchData): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    await this.db.runAsync(
      `INSERT OR REPLACE INTO matches 
       (id, match_number, team_number, scouter_id, game_year, metrics, timestamp, synced, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        match.id,
        match.matchNumber,
        match.teamNumber,
        match.scouterId,
        match.gameYear,
        JSON.stringify(match.metrics),
        match.timestamp,
        match.synced ? 1 : 0,
        match.notes || null
      ]
    );
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
      notes: row.notes
    };
  }
}

// Export singleton instance
export const db = new DatabaseService();