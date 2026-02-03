// services/teamStatisticsService.ts
import { ACTIVE_GAME_CONFIG } from '../config/gameConfig';
import { supabaseSyncService } from './supabase.sync';

export interface TeamStatistics {
  teamNumber: number;
  eventKey: string | null;
  matchCount: number;
  avgMatchScore: number;
  stdDevScore: number;
  minScore: number;
  maxScore: number;
  totalPoints: number;
  lastMatchTimestamp: number;
  firstMatchTimestamp: number;
}

export interface LeagueAverage {
  eventKey: string;
  avgMatchScore: number | null;
  avgAutoScore: number | null;
  avgTeleopScore: number | null;
  avgEndgameScore: number | null;
  qualifyingTeamCount: number;
  totalTeams: number;
  coverageRatio: number;
  isActive: boolean;
  lastUpdated: string;
}

export interface TeamAverageWithPhases extends TeamStatistics {
  avgAutoScore: number;
  avgTeleopScore: number;
  avgEndgameScore: number;
  confidence: number; // 0-1, based on match count (0.2 per match, max 1.0)
}

class TeamStatisticsService {
  /**
   * Get team statistics from materialized view for a single team
   */
  async getTeamStatistics(
    teamNumber: number,
    eventKey?: string
  ): Promise<TeamStatistics | null> {
    try {
      const supabase = supabaseSyncService.getClient();
      
      let query = supabase
        .from('team_statistics')
        .select('*')
        .eq('team_number', teamNumber);

      if (eventKey) {
        query = query.eq('event_key', eventKey);
      } else {
        query = query.is('event_key', null);
      }

      const { data, error } = await query.single();

      if (error || !data) {
        return null;
      }

      return {
        teamNumber: data.team_number,
        eventKey: data.event_key,
        matchCount: data.match_count,
        avgMatchScore: parseFloat(data.avg_match_score) || 0,
        stdDevScore: parseFloat(data.std_dev_score) || 0,
        minScore: data.min_score || 0,
        maxScore: data.max_score || 0,
        totalPoints: data.total_points || 0,
        lastMatchTimestamp: data.last_match_timestamp || 0,
        firstMatchTimestamp: data.first_match_timestamp || 0,
      };
    } catch (error) {
      console.error('Error fetching team statistics:', error);
      return null;
    }
  }

  /**
   * Get team statistics for multiple teams in a single query
   */
  async getTeamStatisticsBatch(
    teamNumbers: number[],
    eventKey?: string
  ): Promise<Map<number, TeamStatistics>> {
    try {
      if (teamNumbers.length === 0) {
        return new Map();
      }

      const supabase = supabaseSyncService.getClient();
      
      let query = supabase
        .from('team_statistics')
        .select('*')
        .in('team_number', teamNumbers);

      if (eventKey) {
        query = query.eq('event_key', eventKey);
      } else {
        query = query.is('event_key', null);
      }

      const { data, error } = await query;

      if (error || !data) {
        return new Map();
      }

      const statsMap = new Map<number, TeamStatistics>();
      data.forEach((row: any) => {
        statsMap.set(row.team_number, {
          teamNumber: row.team_number,
          eventKey: row.event_key,
          matchCount: row.match_count,
          avgMatchScore: parseFloat(row.avg_match_score) || 0,
          stdDevScore: parseFloat(row.std_dev_score) || 0,
          minScore: row.min_score || 0,
          maxScore: row.max_score || 0,
          totalPoints: row.total_points || 0,
          lastMatchTimestamp: row.last_match_timestamp || 0,
          firstMatchTimestamp: row.first_match_timestamp || 0,
        });
      });

      return statsMap;
    } catch (error) {
      console.error('Error fetching team statistics batch:', error);
      return new Map();
    }
  }

  /**
   * Get all team statistics for an event
   */
  async getAllTeamStatisticsForEvent(
    eventKey: string
  ): Promise<Map<number, TeamStatistics>> {
    try {
      const supabase = supabaseSyncService.getClient();
      
      const { data, error } = await supabase
        .from('team_statistics')
        .select('*')
        .eq('event_key', eventKey);

      if (error || !data) {
        return new Map();
      }

      const statsMap = new Map<number, TeamStatistics>();
      data.forEach((row: any) => {
        statsMap.set(row.team_number, {
          teamNumber: row.team_number,
          eventKey: row.event_key,
          matchCount: row.match_count,
          avgMatchScore: parseFloat(row.avg_match_score) || 0,
          stdDevScore: parseFloat(row.std_dev_score) || 0,
          minScore: row.min_score || 0,
          maxScore: row.max_score || 0,
          totalPoints: row.total_points || 0,
          lastMatchTimestamp: row.last_match_timestamp || 0,
          firstMatchTimestamp: row.first_match_timestamp || 0,
        });
      });

      return statsMap;
    } catch (error) {
      console.error('Error fetching all team statistics for event:', error);
      return new Map();
    }
  }

  /**
   * Get league average for an event
   */
  async getLeagueAverage(eventKey: string): Promise<LeagueAverage | null> {
    try {
      const supabase = supabaseSyncService.getClient();
      
      const { data, error } = await supabase
        .from('league_averages')
        .select('*')
        .eq('event_key', eventKey)
        .single();

      if (error || !data) {
        return null;
      }

      return {
        eventKey: data.event_key,
        avgMatchScore: data.avg_match_score ? parseFloat(data.avg_match_score) : null,
        avgAutoScore: data.avg_auto_score ? parseFloat(data.avg_auto_score) : null,
        avgTeleopScore: data.avg_teleop_score ? parseFloat(data.avg_teleop_score) : null,
        avgEndgameScore: data.avg_endgame_score ? parseFloat(data.avg_endgame_score) : null,
        qualifyingTeamCount: data.qualifying_team_count || 0,
        totalTeams: data.total_teams || 0,
        coverageRatio: parseFloat(data.coverage_ratio) || 0,
        isActive: data.is_active || false,
        lastUpdated: data.last_updated,
      };
    } catch (error) {
      console.error('Error fetching league average:', error);
      return null;
    }
  }

  /**
   * Calculate phase-specific averages (auto, teleop, endgame) for a team
   * This requires fetching the actual match metrics since phase scores
   * need to be calculated from the game config
   */
  async getTeamAverageWithPhases(
    teamNumber: number,
    eventKey?: string
  ): Promise<TeamAverageWithPhases | null> {
    try {
      // Get basic statistics from materialized view
      const stats = await this.getTeamStatistics(teamNumber, eventKey);
      if (!stats) {
        return null;
      }

      // Fetch match metrics to calculate phase averages
      const supabase = supabaseSyncService.getClient();
      
      let query = supabase
        .from('matches')
        .select('metrics, calculated_points, id')
        .eq('team_number', teamNumber);

      if (eventKey) {
        query = query.eq('event_key', eventKey);
      } else {
        query = query.is('event_key', null);
      }

      // Exclude admin-deleted matches
      const { data: deletedMatchIdsData } = await supabase
        .from('match_deletions')
        .select('match_id')
        .eq('team_id', await supabaseSyncService.getTeamId());

      const deletedMatchIds = new Set((deletedMatchIdsData || []).map(d => d.match_id));

      const { data: matches, error } = await query;

      if (error || !matches || matches.length === 0) {
        return {
          ...stats,
          avgAutoScore: 0,
          avgTeleopScore: 0,
          avgEndgameScore: 0,
          confidence: Math.min(1.0, stats.matchCount * 0.2),
        };
      }

      // Filter out deleted matches
      const filteredMatches = matches.filter((m: any) => !deletedMatchIds.has(m.id));

      // Calculate phase averages from metrics
      const autoScores: number[] = [];
      const teleopScores: number[] = [];
      const endgameScores: number[] = [];

      filteredMatches.forEach((match: any) => {
        const metrics = match.metrics || {};
        const autoScore = this.calculatePhaseScore(metrics, 'auto');
        const teleopScore = this.calculatePhaseScore(metrics, 'teleop');
        const endgameScore = this.calculatePhaseScore(metrics, 'endgame');

        if (autoScore !== null) autoScores.push(autoScore);
        if (teleopScore !== null) teleopScores.push(teleopScore);
        if (endgameScore !== null) endgameScores.push(endgameScore);
      });

      const avgAuto = autoScores.length > 0
        ? autoScores.reduce((sum, s) => sum + s, 0) / autoScores.length
        : 0;
      const avgTeleop = teleopScores.length > 0
        ? teleopScores.reduce((sum, s) => sum + s, 0) / teleopScores.length
        : 0;
      const avgEndgame = endgameScores.length > 0
        ? endgameScores.reduce((sum, s) => sum + s, 0) / endgameScores.length
        : 0;

      return {
        ...stats,
        avgAutoScore: Math.round(avgAuto * 100) / 100,
        avgTeleopScore: Math.round(avgTeleop * 100) / 100,
        avgEndgameScore: Math.round(avgEndgame * 100) / 100,
        confidence: Math.min(1.0, stats.matchCount * 0.2),
      };
    } catch (error) {
      console.error('Error calculating team average with phases:', error);
      return null;
    }
  }

  /**
   * Calculate phase-specific score from metrics
   */
  private calculatePhaseScore(metrics: Record<string, any>, phaseId: string): number | null {
    const phase = ACTIVE_GAME_CONFIG.phases.find(p => p.id === phaseId);
    if (!phase) {
      console.warn(`[TeamStats] Phase not found: ${phaseId}`);
      return null;
    }

    let phaseScore = 0;
    let hasData = false;

    phase.metrics.forEach(metric => {
      const value = metrics[metric.id];
      let points = 0;

      switch (metric.type) {
        case 'counter':
        case 'rapidCounter':
          if (typeof value === 'number' && metric.points) {
            points = value * metric.points;
            phaseScore += points;
            hasData = true;
          }
          break;

        case 'boolean':
          if (value === true && metric.points) {
            points = metric.points;
            phaseScore += points;
            hasData = true;
          }
          break;

        case 'select':
          if (metric.pointsMap && typeof value === 'string') {
            points = metric.pointsMap[value] || 0;
            phaseScore += points;
            hasData = true;
          }
          break;
      }
    });

    // Return 0 if phase exists but no data (instead of null) to distinguish from missing phase
    // This allows us to average across matches even if some have 0 for a phase
    return phaseScore;
  }

  /**
   * Get all team averages with phases for an event
   * This is optimized to batch fetch statistics and then calculate phases
   */
  async getAllTeamAveragesWithPhasesForEvent(
    eventKey: string
  ): Promise<Map<number, TeamAverageWithPhases>> {
    try {
      // Get all team statistics for the event
      const statsMap = await this.getAllTeamStatisticsForEvent(eventKey);
      
      if (statsMap.size === 0) {
        return new Map();
      }

      // Fetch all matches for all teams in the event
      const supabase = supabaseSyncService.getClient();
      const teamNumbers = Array.from(statsMap.keys());
      
      let query = supabase
        .from('matches')
        .select('team_number, metrics, calculated_points, id')
        .eq('event_key', eventKey)
        .in('team_number', teamNumbers);

      // Exclude admin-deleted matches
      const { data: deletedMatchIdsData } = await supabase
        .from('match_deletions')
        .select('match_id')
        .eq('team_id', await supabaseSyncService.getTeamId());

      const deletedMatchIds = new Set((deletedMatchIdsData || []).map(d => d.match_id));

      const { data: matches, error } = await query;

      if (error) {
        console.error('Error fetching matches for phase calculation:', error);
        // Return stats without phases
        const result = new Map<number, TeamAverageWithPhases>();
        statsMap.forEach((stats, teamNumber) => {
          result.set(teamNumber, {
            ...stats,
            avgAutoScore: 0,
            avgTeleopScore: 0,
            avgEndgameScore: 0,
            confidence: Math.min(1.0, stats.matchCount * 0.2),
          });
        });
        return result;
      }

      // Filter out deleted matches and group by team
      const matchesByTeam = new Map<number, any[]>();
      (matches || []).forEach((match: any) => {
        if (!deletedMatchIds.has(match.id)) {
          const teamNum = match.team_number;
          if (!matchesByTeam.has(teamNum)) {
            matchesByTeam.set(teamNum, []);
          }
          matchesByTeam.get(teamNum)!.push(match);
        }
      });

      // Calculate phase averages for each team
      const result = new Map<number, TeamAverageWithPhases>();
      statsMap.forEach((stats, teamNumber) => {
        const teamMatches = matchesByTeam.get(teamNumber) || [];
        
        const autoScores: number[] = [];
        const teleopScores: number[] = [];
        const endgameScores: number[] = [];

        teamMatches.forEach((match: any) => {
          const metrics = match.metrics || {};
          const autoScore = this.calculatePhaseScore(metrics, 'auto');
          const teleopScore = this.calculatePhaseScore(metrics, 'teleop');
          const endgameScore = this.calculatePhaseScore(metrics, 'endgame');

          if (autoScore !== null) autoScores.push(autoScore);
          if (teleopScore !== null) teleopScores.push(teleopScore);
          if (endgameScore !== null) endgameScores.push(endgameScore);
        });

        const avgAuto = autoScores.length > 0
          ? autoScores.reduce((sum, s) => sum + s, 0) / autoScores.length
          : 0;
        const avgTeleop = teleopScores.length > 0
          ? teleopScores.reduce((sum, s) => sum + s, 0) / teleopScores.length
          : 0;
        const avgEndgame = endgameScores.length > 0
          ? endgameScores.reduce((sum, s) => sum + s, 0) / endgameScores.length
          : 0;

        result.set(teamNumber, {
          ...stats,
          avgAutoScore: Math.round(avgAuto * 100) / 100,
          avgTeleopScore: Math.round(avgTeleop * 100) / 100,
          avgEndgameScore: Math.round(avgEndgame * 100) / 100,
          confidence: Math.min(1.0, stats.matchCount * 0.2),
        });
      });

      return result;
    } catch (error) {
      console.error('Error getting all team averages with phases:', error);
      return new Map();
    }
  }

  /**
   * Refresh the team_statistics materialized view
   */
  async refreshTeamStatistics(): Promise<boolean> {
    try {
      const supabase = supabaseSyncService.getClient();
      
      const { error } = await supabase.rpc('refresh_team_statistics');

      if (error) {
        console.error('Error refreshing team statistics:', error);
        return false;
      }

      return true;
    } catch (error) {
      console.error('Error refreshing team statistics:', error);
      return false;
    }
  }

  /**
   * Update league average for an event
   */
  async updateLeagueAverage(eventKey: string): Promise<boolean> {
    try {
      const supabase = supabaseSyncService.getClient();
      
      const { error } = await supabase.rpc('update_league_average', {
        event_key_param: eventKey,
      });

      if (error) {
        console.error('Error updating league average:', error);
        return false;
      }

      return true;
    } catch (error) {
      console.error('Error updating league average:', error);
      return false;
    }
  }
}

export const teamStatisticsService = new TeamStatisticsService();
