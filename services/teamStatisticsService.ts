// services/teamStatisticsService.ts
import { supabase } from '@/lib/supabase';
import { getTeamYearEPABatch } from '../api/services/statbotics';
import { ACTIVE_GAME_CONFIG } from '../config/gameConfig';
import { supabaseSyncService } from './supabase.sync';

export interface TeamStatistics {
  teamNumber: number;
  eventKey: string | null;
  matchCount: number;
  avgMatchScore: number;
  stdDevScore: number;
  /** Blended stdev for betting odds: EPA + scouted (3-8 match blend) + prior events. Use this for normal distribution. */
  blendedStdDev?: number;
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

/**
 * Compute blended stdev for a team using match count rules:
 * - 0-3 matches: EPA only (prior event optional). Returns null if no EPA and no prior event.
 * - 3-8 matches: Blend scouted + EPA by confidence; fallback to scouted/prior when EPA missing
 * - 8+ matches: Scouted only
 * No default stdev fallback - returns null when data is insufficient.
 */
function computeBlendedStdDev(
  matchCount: number,
  scoutedStd: number,
  epaSd: number | null,
  priorEventStd: number | null
): number | null {
  if (matchCount <= 3) {
    const base = epaSd ?? priorEventStd;
    if (base == null || base <= 0) return null;
    if (priorEventStd !== null && priorEventStd > 0) {
      return base * 0.7 + priorEventStd * 0.3;
    }
    return base;
  }
  if (matchCount >= 8) {
    return scoutedStd;
  }
  // 3-8: Blend scouted + EPA. Fallback to scouted/prior when EPA missing
  const confidence = (matchCount - 3) / 5;
  const epaBase = epaSd ?? priorEventStd ?? scoutedStd;
  let blended = scoutedStd * confidence + epaBase * (1 - confidence);
  if (priorEventStd !== null && priorEventStd > 0) {
    blended = blended * 0.7 + priorEventStd * 0.3;
  }
  return blended;
}

class TeamStatisticsService {
  /**
   * Get prior-event std_dev_score for a team (other events, same team_id).
   * Returns average of std_dev_score across other events. Exclude when current-event matches >= 8.
   */
  async getPriorEventStdDev(
    teamNumber: number,
    excludeEventKey: string
  ): Promise<number | null> {
    try {
      const teamId = await supabaseSyncService.getTeamId();
      if (!teamId) return null;

      const { data, error } = await supabase
        .from('team_statistics')
        .select('std_dev_score, match_count')
        .eq('team_id', teamId)
        .eq('team_number', teamNumber)
        .neq('event_key', excludeEventKey)
        .not('event_key', 'is', null);

      if (error || !data || data.length === 0) return null;

      // Average stdev from events with 3+ matches
      const valid = data.filter((r: any) => (r.match_count || 0) >= 3);
      if (valid.length === 0) return null;

      const avg =
        valid.reduce((sum: number, r: any) => sum + (parseFloat(r.std_dev_score) || 0), 0) /
        valid.length;
      return avg > 0 ? avg : null;
    } catch (error) {
      console.error('Error fetching prior event stdev:', error);
      return null;
    }
  }

  /**
   * Batch fetch prior-event std_dev for multiple teams.
   */
  async getPriorEventStdDevs(
    teamNumbers: number[],
    excludeEventKey: string
  ): Promise<Map<number, number>> {
    const result = new Map<number, number>();
    if (teamNumbers.length === 0) return result;

    try {
      const teamId = await supabaseSyncService.getTeamId();
      if (!teamId) return result;

      const { data, error } = await supabase
        .from('team_statistics')
        .select('team_number, std_dev_score, match_count')
        .eq('team_id', teamId)
        .in('team_number', teamNumbers)
        .neq('event_key', excludeEventKey)
        .not('event_key', 'is', null);

      if (error || !data) return result;

      // Group by team_number, average stdev from events with 3+ matches
      const byTeam = new Map<number, number[]>();
      for (const row of data) {
        if ((row.match_count || 0) >= 3) {
          const std = parseFloat(row.std_dev_score);
          if (!isNaN(std) && std > 0) {
            const tn = row.team_number;
            if (!byTeam.has(tn)) byTeam.set(tn, []);
            byTeam.get(tn)!.push(std);
          }
        }
      }
      byTeam.forEach((stds, tn) => {
        const avg = stds.reduce((a, b) => a + b, 0) / stds.length;
        result.set(tn, avg);
      });
      return result;
    } catch (error) {
      console.error('Error batch fetching prior event stdevs:', error);
      return result;
    }
  }

  /**
   * Get team statistics from materialized view for a single team
   * Only returns data scouted by the current team (team_id filter)
   */
  async getTeamStatistics(
    teamNumber: number,
    eventKey?: string
  ): Promise<TeamStatistics | null> {
    try {
      const teamId = await supabaseSyncService.getTeamId();
      if (!teamId) {
        console.warn('No team context for team statistics');
        return null;
      }

      let query = supabase
        .from('team_statistics')
        .select('*')
        .eq('team_id', teamId)
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
   * Blends scouted data with Statbotics EPA when confidence is low
   */
  async getTeamStatisticsBatch(
    teamNumbers: number[],
    eventKey?: string
  ): Promise<Map<number, TeamStatistics>> {
    try {
      if (teamNumbers.length === 0) {
        return new Map();
      }

      const teamId = await supabaseSyncService.getTeamId();
      if (!teamId) {
        console.warn('No team context for team statistics batch');
        return new Map();
      }
      
      let query = supabase
        .from('team_statistics')
        .select('*')
        .eq('team_id', teamId)
        .in('team_number', teamNumbers);

      if (eventKey) {
        query = query.eq('event_key', eventKey);
      } else {
        query = query.is('event_key', null);
      }

      const { data, error } = await query;

      if (error) {
        console.error('Error querying team_statistics:', error);
        // Fallback: try to calculate from raw matches if view fails
        return await this.fallbackCalculateFromMatches(teamId, teamNumbers, eventKey);
      }

      if (!data || data.length === 0) {
        // Fallback: calculate from raw matches, then add EPA for teams with no/low data
        const fallbackStats = await this.fallbackCalculateFromMatches(teamId, teamNumbers, eventKey);
        const teamsNeedingEPA: number[] = [];
        const teamsStillMissing = teamNumbers.filter(tn => !fallbackStats.has(tn));

        fallbackStats.forEach((stats, teamNumber) => {
          const matchCount = stats.matchCount;
          const confidence = Math.min(1.0, matchCount * 0.2);
          if (confidence < 0.8 && matchCount < 4) {
            teamsNeedingEPA.push(teamNumber);
          }
        });
        teamsNeedingEPA.push(...teamsStillMissing);
        
        if (teamsNeedingEPA.length > 0) {
          try {
            const year = ACTIVE_GAME_CONFIG.year;
            const epaMap = await getTeamYearEPABatch(teamsNeedingEPA, year);

            teamsNeedingEPA.forEach((teamNumber) => {
              const stats = fallbackStats.get(teamNumber);
              const epa = epaMap.get(teamNumber);
              
              if (stats && epa) {
                // Blend EPA with scouted data
                const matchCount = stats.matchCount;
                const scoutedAvg = stats.avgMatchScore;
                const epaValue = epa.epa?.total_points?.mean || 0;
                
                const confidence = Math.min(1.0, matchCount * 0.2);
                const epaWeight = Math.max(0, 1 - (confidence / 0.8));
                const scoutedWeight = 1 - epaWeight;
                
                const blendedAvg = (scoutedAvg * scoutedWeight) + (epaValue * epaWeight);
                fallbackStats.set(teamNumber, {
                  ...stats,
                  avgMatchScore: Math.round(blendedAvg * 100) / 100,
                });
              } else if (!stats && epa) {
                const epaValue = epa.epa?.total_points?.mean || 0;
                fallbackStats.set(teamNumber, {
                  teamNumber,
                  eventKey: eventKey || null,
                  matchCount: 0,
                  avgMatchScore: Math.round(epaValue * 100) / 100,
                  stdDevScore: 0,
                  minScore: 0,
                  maxScore: 0,
                  totalPoints: 0,
                  lastMatchTimestamp: 0,
                  firstMatchTimestamp: 0,
                });
              }
            });

            // Compute blended stdev for fallback stats
            const teamsForStdev = Array.from(fallbackStats.entries()).filter(([, s]) => s.matchCount < 8).map(([tn]) => tn);
            const priorStdevs = eventKey ? await this.getPriorEventStdDevs(teamsForStdev, eventKey) : new Map<number, number>();
            fallbackStats.forEach((stats, teamNumber) => {
              const epa = epaMap.get(teamNumber);
              const epaSd = epa?.epa?.total_points?.sd ?? null;
              const priorStd = priorStdevs.get(teamNumber) ?? null;
              const blended = computeBlendedStdDev(stats.matchCount, stats.stdDevScore, epaSd, priorStd);
              if (blended != null) stats.blendedStdDev = Math.round(blended * 100) / 100;
            });
          } catch (epaError) {
            console.error('Error fetching Statbotics EPA for missing teams:', epaError);
          }
        }

        // Compute blended stdev for teams that didn't get EPA (matchCount >= 8)
        fallbackStats.forEach((stats, teamNumber) => {
          if (stats.blendedStdDev === undefined) {
            const blended = computeBlendedStdDev(stats.matchCount, stats.stdDevScore, null, null);
            if (blended != null) stats.blendedStdDev = Math.round(blended * 100) / 100;
          }
        });
        
        return fallbackStats;
      }

      const statsMap = new Map<number, TeamStatistics>();
      const teamsNeedingEPA: number[] = [];

      data.forEach((row: any) => {
        const matchCount = row.match_count || 0;
        const avgMatchScore = parseFloat(row.avg_match_score) || 0;
        const confidence = Math.min(1.0, matchCount * 0.2);
        if (confidence < 0.8 && matchCount < 4) {
          teamsNeedingEPA.push(row.team_number);
        }
        statsMap.set(row.team_number, {
          teamNumber: row.team_number,
          eventKey: row.event_key,
          matchCount,
          avgMatchScore,
          stdDevScore: parseFloat(row.std_dev_score) || 0,
          minScore: row.min_score || 0,
          maxScore: row.max_score || 0,
          totalPoints: row.total_points || 0,
          lastMatchTimestamp: row.last_match_timestamp || 0,
          firstMatchTimestamp: row.first_match_timestamp || 0,
        });
      });

      let epaMapForStdev = new Map<number, { mean: number; sd?: number }>();
      if (teamsNeedingEPA.length > 0) {
        try {
          const year = ACTIVE_GAME_CONFIG.year;
          const epaMap = await getTeamYearEPABatch(teamsNeedingEPA, year);
          epaMap.forEach((epa, tn) => {
            const tp = epa.epa?.total_points;
            epaMapForStdev.set(tn, { mean: tp?.mean ?? 0, sd: tp?.sd });
          });
          teamsNeedingEPA.forEach((teamNumber) => {
            const stats = statsMap.get(teamNumber);
            const epa = epaMap.get(teamNumber);
            
            if (stats && epa) {
              const matchCount = stats.matchCount;
              const scoutedAvg = stats.avgMatchScore;
              const epaValue = epa.epa?.total_points?.mean || 0;
              
              // Calculate confidence (0.2 per match, max 1.0)
              const confidence = Math.min(1.0, matchCount * 0.2);
              
              // Blend: at confidence 0.0 = 100% EPA, at confidence 0.8 = 100% scouted
              // Linear interpolation between 0.0 and 0.8
              const epaWeight = Math.max(0, 1 - (confidence / 0.8));
              const scoutedWeight = 1 - epaWeight;
              
              const blendedAvg = (scoutedAvg * scoutedWeight) + (epaValue * epaWeight);
              statsMap.set(teamNumber, {
                ...stats,
                avgMatchScore: Math.round(blendedAvg * 100) / 100,
              });
            } else if (!stats && epa) {
              const epaValue = epa.epa?.total_points?.mean || 0;
              statsMap.set(teamNumber, {
                teamNumber,
                eventKey: eventKey || null,
                matchCount: 0,
                avgMatchScore: Math.round(epaValue * 100) / 100,
                stdDevScore: 0,
                minScore: 0,
                maxScore: 0,
                totalPoints: 0,
                lastMatchTimestamp: 0,
                firstMatchTimestamp: 0,
              });
            }
          });
        } catch (epaError) {
          console.error('Error fetching Statbotics EPA:', epaError);
          // Continue with scouted data only if EPA fetch fails
        }
      }

      const missingTeams = teamNumbers.filter(tn => !statsMap.has(tn));
      if (missingTeams.length > 0) {
        try {
          const year = ACTIVE_GAME_CONFIG.year;
          const epaMap = await getTeamYearEPABatch(missingTeams, year);
          epaMap.forEach((epa, tn) => {
            const tp = epa.epa?.total_points;
            epaMapForStdev.set(tn, { mean: tp?.mean ?? 0, sd: tp?.sd });
          });
          missingTeams.forEach((teamNumber) => {
            const epa = epaMap.get(teamNumber);
            if (epa) {
              const epaValue = epa.epa?.total_points?.mean || 0;
              statsMap.set(teamNumber, {
                teamNumber,
                eventKey: eventKey || null,
                matchCount: 0,
                avgMatchScore: Math.round(epaValue * 100) / 100,
                stdDevScore: 0,
                minScore: 0,
                maxScore: 0,
                totalPoints: 0,
                lastMatchTimestamp: 0,
                firstMatchTimestamp: 0,
              });
            }
          });
        } catch (epaError) {
          console.error('Error fetching Statbotics EPA for missing teams:', epaError);
        }
      }

      // Compute blended stdev for betting odds (EPA + scouted blend, prior events)
      const teamsNeedingEPAForStdev = Array.from(statsMap.entries())
        .filter(([, s]) => s.matchCount < 8)
        .map(([tn]) => tn);
      const teamsToFetchEPA = teamsNeedingEPAForStdev.filter(tn => !epaMapForStdev.has(tn));
      if (teamsToFetchEPA.length > 0) {
        try {
          const year = ACTIVE_GAME_CONFIG.year;
          const epaMap = await getTeamYearEPABatch(teamsToFetchEPA, year);
          epaMap.forEach((epa, tn) => {
            const tp = epa.epa?.total_points;
            epaMapForStdev.set(tn, { mean: tp?.mean ?? 0, sd: tp?.sd });
          });
        } catch (e) {
          console.error('Error fetching EPA for stdev blend:', e);
        }
      }
      const priorStdevs = eventKey
        ? await this.getPriorEventStdDevs(teamsNeedingEPAForStdev, eventKey)
        : new Map<number, number>();

      statsMap.forEach((stats, teamNumber) => {
        const epa = epaMapForStdev.get(teamNumber);
        const epaSd = epa?.sd ?? null;
        const priorStd = priorStdevs.get(teamNumber) ?? null;
        const blended = computeBlendedStdDev(stats.matchCount, stats.stdDevScore, epaSd, priorStd);
        if (blended != null) stats.blendedStdDev = Math.round(blended * 100) / 100;
      });

      return statsMap;
    } catch (error) {
      console.error('Error fetching team statistics batch:', error);
      // Fallback: try to calculate from raw matches, then add EPA
      const teamId = await supabaseSyncService.getTeamId();
      const fallbackStats = teamId
        ? await this.fallbackCalculateFromMatches(teamId, teamNumbers, eventKey)
        : new Map();
      
      // Check which teams still have no data and fetch EPA for them
      const teamsStillMissing = teamNumbers.filter(tn => !fallbackStats.has(tn));
      const epaMapForErrorFallback = new Map<number, number | null>();
      if (teamsStillMissing.length > 0) {
        try {
          const year = ACTIVE_GAME_CONFIG.year;
          
          const epaMap = await getTeamYearEPABatch(teamsStillMissing, year);
          epaMap.forEach((epa, tn) => {
            epaMapForErrorFallback.set(tn, epa.epa?.total_points?.sd ?? null);
          });
          
          teamsStillMissing.forEach((teamNumber) => {
            const epa = epaMap.get(teamNumber);
            if (epa) {
              const epaValue = epa.epa?.total_points?.mean || 0;
              fallbackStats.set(teamNumber, {
                teamNumber,
                eventKey: eventKey || null,
                matchCount: 0,
                avgMatchScore: Math.round(epaValue * 100) / 100,
                stdDevScore: 0,
                minScore: 0,
                maxScore: 0,
                totalPoints: 0,
                lastMatchTimestamp: 0,
                firstMatchTimestamp: 0,
              });
            }
          });
        } catch (epaError) {
          console.error('Error fetching Statbotics EPA for missing teams after error:', epaError);
        }
      }

      // Compute blended stdev for error fallback (fetch EPA for 4-7 match teams if needed)
      const teamsNeedingEPAForStdevErr = Array.from(fallbackStats.entries())
        .filter(([tn, s]) => s.matchCount < 8 && !epaMapForErrorFallback.has(tn))
        .map(([tn]) => tn);
      if (teamsNeedingEPAForStdevErr.length > 0) {
        try {
          const epaMap = await getTeamYearEPABatch(teamsNeedingEPAForStdevErr, ACTIVE_GAME_CONFIG.year);
          epaMap.forEach((epa, tn) => {
            epaMapForErrorFallback.set(tn, epa.epa?.total_points?.sd ?? null);
          });
        } catch (_) {}
      }
      const teamsForPrior = Array.from(fallbackStats.entries()).filter(([, s]) => s.matchCount < 8).map(([tn]) => tn);
      const priorStdevs = eventKey ? await this.getPriorEventStdDevs(teamsForPrior, eventKey) : new Map<number, number>();
      fallbackStats.forEach((stats, teamNumber) => {
        const epaSd = epaMapForErrorFallback.get(teamNumber) ?? null;
        const priorStd = priorStdevs.get(teamNumber) ?? null;
        const blended = computeBlendedStdDev(stats.matchCount, stats.stdDevScore, epaSd, priorStd);
        if (blended != null) stats.blendedStdDev = Math.round(blended * 100) / 100;
      });
      
      return fallbackStats;
    }
  }

  /**
   * Fallback: Calculate statistics directly from matches table if view is empty
   * Only uses matches scouted by the specified team (team_id filter)
   */
  private async fallbackCalculateFromMatches(
    teamId: string,
    teamNumbers: number[],
    eventKey?: string
  ): Promise<Map<number, TeamStatistics>> {
    try {
      const statsMap = new Map<number, TeamStatistics>();

      if (teamNumbers.length === 0) {
        return statsMap;
      }

      // Single batch query for all teams (eliminates N+1) - only current team's scouted data
      let query = supabase
        .from('matches')
        .select('team_number, calculated_points, timestamp')
        .eq('team_id', teamId)
        .in('team_number', teamNumbers);

      if (eventKey) {
        query = query.eq('event_key', eventKey);
      } else {
        query = query.is('event_key', null);
      }

      const { data: allMatches, error } = await query;

      if (error) {
        return statsMap;
      }

      if (!allMatches || allMatches.length === 0) {
        return statsMap;
      }

      // Exclude admin-deleted matches
      const matchIds = allMatches.map((m: any) => m.id);
      const { data: deletedData } = await supabase
        .from('match_deletions')
        .select('match_id')
        .in('match_id', matchIds);
      const deletedIds = new Set((deletedData || []).map((d: any) => d.match_id));
      const matches = allMatches.filter((m: any) => !deletedIds.has(m.id));

      // Group matches by team_number in memory
      const matchesByTeam = new Map<number, Array<{ calculated_points: number; timestamp: number }>>();
      for (const m of matches) {
        const teamNumber = m.team_number;
        const points = parseFloat(m.calculated_points) || 0;
        const timestamp = m.timestamp || 0;
        if (!matchesByTeam.has(teamNumber)) {
          matchesByTeam.set(teamNumber, []);
        }
        matchesByTeam.get(teamNumber)!.push({ calculated_points: points, timestamp });
      }

      // Calculate stats for each team
      for (const [teamNumber, matches] of matchesByTeam) {
        const points = matches.map(m => m.calculated_points);
        const matchCount = points.length;
        const totalPoints = points.reduce((sum, p) => sum + p, 0);
        const avgMatchScore = matchCount > 0 ? totalPoints / matchCount : 0;
        
        const variance = matchCount > 0
          ? points.reduce((sum, p) => sum + Math.pow(p - avgMatchScore, 2), 0) / matchCount
          : 0;
        const stdDevScore = Math.sqrt(variance);

        const timestamps = matches.map(m => m.timestamp).filter(t => t > 0);
        const lastMatchTimestamp = timestamps.length > 0 ? Math.max(...timestamps) : 0;
        const firstMatchTimestamp = timestamps.length > 0 ? Math.min(...timestamps) : 0;

        statsMap.set(teamNumber, {
          teamNumber,
          eventKey: eventKey || null,
          matchCount,
          avgMatchScore: Math.round(avgMatchScore * 100) / 100,
          stdDevScore: Math.round(stdDevScore * 100) / 100,
          minScore: matchCount > 0 ? Math.min(...points) : 0,
          maxScore: matchCount > 0 ? Math.max(...points) : 0,
          totalPoints,
          lastMatchTimestamp,
          firstMatchTimestamp,
        });
      }

      return statsMap;
    } catch (error) {
      console.error('Error in fallback calculation:', error);
      return new Map();
    }
  }

  /**
   * Get all team statistics for an event (only current team's scouted data)
   */
  async getAllTeamStatisticsForEvent(
    eventKey: string
  ): Promise<Map<number, TeamStatistics>> {
    try {
      const teamId = await supabaseSyncService.getTeamId();
      if (!teamId) {
        return new Map();
      }

      const { data, error } = await supabase
        .from('team_statistics')
        .select('*')
        .eq('team_id', teamId)
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
   * Get league average for an event (only current team's scouted data)
   */
  async getLeagueAverage(eventKey: string): Promise<LeagueAverage | null> {
    try {
      const teamId = await supabaseSyncService.getTeamId();
      if (!teamId) {
        return null;
      }

      const { data, error } = await supabase
        .from('league_averages')
        .select('*')
        .eq('team_id', teamId)
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

      const teamId = await supabaseSyncService.getTeamId();
      if (!teamId) {
        return null;
      }

      // Fetch match metrics to calculate phase averages (only current team's scouted data)
      let query = supabase
        .from('matches')
        .select('metrics, calculated_points, id')
        .eq('team_id', teamId)
        .eq('team_number', teamNumber);

      if (eventKey) {
        query = query.eq('event_key', eventKey);
      } else {
        query = query.is('event_key', null);
      }

      const { data: matches, error } = await query;

      // Exclude admin-deleted matches
      const matchIds = (matches || []).map((m: any) => m.id);
      const { data: deletedMatchIdsData } = matchIds.length > 0
        ? await supabase
            .from('match_deletions')
            .select('match_id')
            .in('match_id', matchIds)
        : { data: [] };
      const deletedMatchIds = new Set((deletedMatchIdsData || []).map((d: any) => d.match_id));

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
      const teamId = await supabaseSyncService.getTeamId();
      if (!teamId) {
        return new Map();
      }

      // Get all team statistics for the event (only current team's data)
      const statsMap = await this.getAllTeamStatisticsForEvent(eventKey);
      
      if (statsMap.size === 0) {
        return new Map();
      }

      // Fetch all matches for all teams in the event (only current team's scouted data)
      const teamNumbers = Array.from(statsMap.keys());
      
      const { data: matches, error } = await supabase
        .from('matches')
        .select('team_number, metrics, calculated_points, id')
        .eq('team_id', teamId)
        .eq('event_key', eventKey)
        .in('team_number', teamNumbers);

      // Exclude admin-deleted matches
      const matchIds = (matches || []).map((m: any) => m.id);
      const { data: deletedMatchIdsData } = matchIds.length > 0
        ? await supabase
            .from('match_deletions')
            .select('match_id')
            .in('match_id', matchIds)
        : { data: [] };
      const deletedMatchIds = new Set((deletedMatchIdsData || []).map((d: any) => d.match_id));

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

  /** TTL in ms - skip refresh if last refresh was within this window */
  private static readonly REFRESH_TTL_MS = 30_000;
  private lastRefreshAt = 0;

  /**
   * Refresh the team_statistics materialized view.
   * Skips if refreshed within REFRESH_TTL_MS to avoid redundant work when opening multiple modals.
   */
  async refreshTeamStatistics(): Promise<boolean> {
    const now = Date.now();
    if (now - this.lastRefreshAt < TeamStatisticsService.REFRESH_TTL_MS) {
      return true;
    }
    try {
      const { error } = await supabase.rpc('refresh_team_statistics');
      if (error) {
        console.error('Error refreshing team statistics:', error);
        return false;
      }
      this.lastRefreshAt = now;
      return true;
    } catch (error) {
      console.error('Error refreshing team statistics:', error);
      return false;
    }
  }

  /**
   * Update league average for an event (uses only current team's scouted data)
   */
  async updateLeagueAverage(eventKey: string): Promise<boolean> {
    try {
      const teamId = await supabaseSyncService.getTeamId();
      if (!teamId) {
        console.warn('No team context for updating league average');
        return false;
      }

      const { error } = await supabase.rpc('update_league_average', {
        team_id_param: teamId,
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
