// services/analyticsService.ts
import { MatchData } from '../types/match';
import { ACTIVE_GAME_CONFIG, calculateMatchPoints } from '../config/gameConfig';

export interface TeamAnalytics {
  teamNumber: number;
  totalMatches: number;
  averagePoints: number; // NEW: Average total points per match
  totalPoints: number; // NEW: Total points across all matches
  metrics: {
    [key: string]: {
      average: number;
      total: number;
      max: number;
      min: number;
      stdDev: number;
    };
  };
  matchHistory: MatchData[];
  lastMatch: number;
  reliability: number; // 0-1 score based on data consistency
}

export interface LeaderboardEntry {
  teamNumber: number;
  value: number;
  rank: number;
}

class AnalyticsService {
  /**
   * Calculate comprehensive analytics for all teams
   */
  calculateTeamAnalytics(matches: MatchData[]): Map<number, TeamAnalytics> {
    const teamMap = new Map<number, MatchData[]>();

    // Group matches by team
    matches.forEach(match => {
      if (!teamMap.has(match.teamNumber)) {
        teamMap.set(match.teamNumber, []);
      }
      teamMap.get(match.teamNumber)!.push(match);
    });

    // Calculate analytics for each team
    const analyticsMap = new Map<number, TeamAnalytics>();

    teamMap.forEach((teamMatches, teamNumber) => {
      const analytics = this.calculateSingleTeamAnalytics(teamNumber, teamMatches);
      analyticsMap.set(teamNumber, analytics);
    });

    return analyticsMap;
  }

  /**
   * Calculate analytics for a single team
   */
  private calculateSingleTeamAnalytics(
    teamNumber: number, 
    matches: MatchData[]
  ): TeamAnalytics {
    const sortedMatches = [...matches].sort((a, b) => a.matchNumber - b.matchNumber);
    
    // Calculate points for each match
    const matchPoints = matches.map(match => calculateMatchPoints(match.metrics));
    const totalPoints = matchPoints.reduce((sum, pts) => sum + pts, 0);
    const averagePoints = matches.length > 0 ? totalPoints / matches.length : 0;
    
    // Get all numeric metrics
    const metricKeys = new Set<string>();
    matches.forEach(match => {
      Object.keys(match.metrics).forEach(key => {
        if (typeof match.metrics[key] === 'number') {
          metricKeys.add(key);
        }
      });
    });

    // Calculate stats for each metric
    const metrics: TeamAnalytics['metrics'] = {};

    metricKeys.forEach(key => {
      const values = matches
        .map(m => m.metrics[key])
        .filter(v => typeof v === 'number') as number[];

      if (values.length > 0) {
        const total = values.reduce((sum, val) => sum + val, 0);
        const average = total / values.length;
        const max = Math.max(...values);
        const min = Math.min(...values);
        
        // Standard deviation
        const variance = values.reduce((sum, val) => 
          sum + Math.pow(val - average, 2), 0
        ) / values.length;
        const stdDev = Math.sqrt(variance);

        metrics[key] = {
          average: Math.round(average * 100) / 100,
          total,
          max,
          min,
          stdDev: Math.round(stdDev * 100) / 100,
        };
      }
    });

    // Calculate reliability score (lower stdDev = more reliable)
    const avgStdDev = Object.values(metrics)
      .reduce((sum, m) => sum + m.stdDev, 0) / Object.keys(metrics).length;
    const reliability = Math.max(0, 1 - (avgStdDev / 10)); // Normalize to 0-1

    return {
      teamNumber,
      totalMatches: matches.length,
      averagePoints: Math.round(averagePoints * 100) / 100,
      totalPoints,
      metrics,
      matchHistory: sortedMatches,
      lastMatch: Math.max(...matches.map(m => m.matchNumber)),
      reliability: Math.round(reliability * 100) / 100,
    };
  }

  /**
   * Generate leaderboard for a specific metric
   */
  generateLeaderboard(
    analytics: Map<number, TeamAnalytics>,
    metricId: string,
    minMatches: number = 3
  ): LeaderboardEntry[] {
    const entries: LeaderboardEntry[] = [];

    analytics.forEach((teamAnalytics, teamNumber) => {
      // Only include teams with enough matches
      if (teamAnalytics.totalMatches < minMatches) return;

      const metricData = teamAnalytics.metrics[metricId];
      if (metricData) {
        entries.push({
          teamNumber,
          value: metricData.average,
          rank: 0, // Will be set after sorting
        });
      }
    });

    // Sort by value (descending) and assign ranks
    entries.sort((a, b) => b.value - a.value);
    entries.forEach((entry, index) => {
      entry.rank = index + 1;
    });

    return entries;
  }

  /**
   * Compare two teams side-by-side
   */
  compareTeams(
    team1Number: number,
    team2Number: number,
    analytics: Map<number, TeamAnalytics>
  ): {
    team1: TeamAnalytics | null;
    team2: TeamAnalytics | null;
    winner: { [metricId: string]: number }; // team number
  } {
    const team1 = analytics.get(team1Number) || null;
    const team2 = analytics.get(team2Number) || null;

    const winner: { [metricId: string]: number } = {};

    if (team1 && team2) {
      // Determine winner for each metric
      Object.keys(team1.metrics).forEach(metricId => {
        if (team2.metrics[metricId]) {
          winner[metricId] = 
            team1.metrics[metricId].average > team2.metrics[metricId].average
              ? team1Number
              : team2Number;
        }
      });
    }

    return { team1, team2, winner };
  }

  /**
   * Calculate match predictions (simple average-based)
   */
  predictMatchScore(
    teamNumbers: number[],
    analytics: Map<number, TeamAnalytics>
  ): { predicted: number; confidence: number } {
    let totalScore = 0;
    let totalReliability = 0;
    let validTeams = 0;

    teamNumbers.forEach(teamNumber => {
      const teamAnalytics = analytics.get(teamNumber);
      if (teamAnalytics) {
        // Sum all average metrics
        const teamScore = Object.values(teamAnalytics.metrics)
          .reduce((sum, metric) => sum + metric.average, 0);
        
        totalScore += teamScore;
        totalReliability += teamAnalytics.reliability;
        validTeams++;
      }
    });

    return {
      predicted: validTeams > 0 ? Math.round(totalScore) : 0,
      confidence: validTeams > 0 ? totalReliability / validTeams : 0,
    };
  }

  /**
   * Get top performers across all metrics
   */
  getTopPerformers(
    analytics: Map<number, TeamAnalytics>,
    limit: number = 10
  ): Array<{ teamNumber: number; score: number }> {
    const scores: Array<{ teamNumber: number; score: number }> = [];

    analytics.forEach((teamAnalytics, teamNumber) => {
      // Use average points as the score
      scores.push({ 
        teamNumber, 
        score: teamAnalytics.averagePoints 
      });
    });

    return scores
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  /**
   * Detect outliers in match data
   */
  detectOutliers(
    teamNumber: number,
    analytics: Map<number, TeamAnalytics>
  ): { matchId: string; metricId: string; value: number; zScore: number }[] {
    const teamAnalytics = analytics.get(teamNumber);
    if (!teamAnalytics) return [];

    const outliers: any[] = [];

    teamAnalytics.matchHistory.forEach(match => {
      Object.entries(match.metrics).forEach(([metricId, value]) => {
        if (typeof value !== 'number') return;

        const metricStats = teamAnalytics.metrics[metricId];
        if (!metricStats) return;

        // Calculate z-score
        const zScore = metricStats.stdDev > 0
          ? Math.abs((value - metricStats.average) / metricStats.stdDev)
          : 0;

        // Flag if z-score > 2 (outside 95% confidence interval)
        if (zScore > 2) {
          outliers.push({
            matchId: match.id,
            matchNumber: match.matchNumber,
            metricId,
            value,
            zScore: Math.round(zScore * 100) / 100,
          });
        }
      });
    });

    return outliers;
  }

  /**
   * Generate match performance trend data
   */
  getPerformanceTrend(
    teamNumber: number,
    metricId: string,
    analytics: Map<number, TeamAnalytics>
  ): Array<{ matchNumber: number; value: number }> {
    const teamAnalytics = analytics.get(teamNumber);
    if (!teamAnalytics) return [];

    return teamAnalytics.matchHistory
      .filter(match => typeof match.metrics[metricId] === 'number')
      .map(match => ({
        matchNumber: match.matchNumber,
        value: match.metrics[metricId] as number,
      }))
      .sort((a, b) => a.matchNumber - b.matchNumber);
  }
}

export const analyticsService = new AnalyticsService();