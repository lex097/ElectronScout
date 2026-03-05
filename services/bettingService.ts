// services/bettingService.ts
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { useDemoStore } from '@/stores/demoStore';
import AsyncStorage from '@react-native-async-storage/async-storage';
import tbaClient from '../api/client';
import { TBAMatch } from '../api/types';
import { db } from './database';
import { LeagueAverage, TeamStatistics, teamStatisticsService } from './teamStatisticsService';
import { supabaseSyncService } from './supabase.sync';

/** Normal CDF approximation (Abramowitz & Stegun). Returns P(X <= x) for N(mean, std). */
function normalCDF(x: number, mean: number, std: number): number {
  if (std <= 0) return x >= mean ? 1 : 0;
  const z = (x - mean) / std;
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d =
    0.3989423 *
    Math.exp((-z * z) / 2) *
    (0.3193815 * t - 0.3565638 * t * t + 1.781478 * t * t * t - 1.821256 * t * t * t * t + 1.330274 * t * t * t * t * t);
  const p = z >= 0 ? 1 - d : d;
  return Math.max(0, Math.min(1, p));
}

/** P(lower <= X <= upper) for N(mean, std) */
function normalCDFRange(lower: number, upper: number, mean: number, std: number): number {
  if (std <= 0) return lower <= mean && mean <= upper ? 1 : 0;
  return normalCDF(upper, mean, std) - normalCDF(lower, mean, std);
}

export interface BetData {
  matchKey: string;
  matchNumber: number;
  eventKey: string;
  betType: 'winner' | 'margin' | 'over_under' | 'parlay';
  betDetails: {
    alliance?: 'red' | 'blue';
    margin?: number; // Legacy: threshold in points
    marginRange?: string;
    expectedMarginAtBet?: number;
    lowerBound?: number | null; // Stdev-based margin range
    upperBound?: number | null;
    threshold?: number;
    overUnder?: 'over' | 'under';
    parlayBets?: Array<{
      type: 'winner' | 'margin' | 'over_under';
      details: any;
      odds: number;
    }>;
  };
  betAmount: number;
  odds: number;
  potentialPayout: number;
}

export interface Bet {
  id: string;
  userIdentifier: string;
  matchKey: string;
  matchNumber: number;
  eventKey: string;
  betType: 'winner' | 'margin' | 'over_under' | 'parlay';
  betDetails: any;
  betAmount: number;
  odds: number;
  potentialPayout: number;
  status: 'pending' | 'won' | 'lost' | 'cancelled';
  payout: number;
  resolvedAt?: string;
  createdAt: string;
  isDemoMode?: boolean;
}

export interface AllianceData {
  teams: number[];
  average: number;
  confidence: number;
  /** Combined stdev = sqrt(var1 + var2 + var3) for 3-team alliance. No default fallback. */
  stdDev?: number;
  /** Count of teams with valid betting data (avg + stdev). Used for eligibility. */
  teamsWithValidData: number;
}

export interface MatchOdds {
  redWinProbability: number;
  blueWinProbability: number;
  redOdds: number;
  blueOdds: number;
  expectedMargin: number;
  expectedTotal: number;
  matchConfidence: number;
  leagueAverage?: LeagueAverage;
  redAverage: number;
  blueAverage: number;
  /** Stdev of margin (Red - Blue) for normal distribution odds */
  marginStd: number;
  /** Stdev of total (Red + Blue) for over/under odds */
  totalStd: number;
}

const ODDS_CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes max

/** 50/50 odds when insufficient data for calculated odds */
const FALLBACK_50_50_ODDS: MatchOdds = {
  redWinProbability: 0.5,
  blueWinProbability: 0.5,
  redOdds: 2, blueOdds: 2,
  expectedMargin: 0, expectedTotal: 0,
  matchConfidence: 0,
  redAverage: 0, blueAverage: 0,
  marginStd: 0, totalStd: 0,
};

export type BettingDataResult = { hasFullOdds: boolean; odds: MatchOdds };

class BettingService {
  private oddsCache = new Map<string, { odds: MatchOdds; fetchedAt: number }>();
  private eligibilityCache = new Map<string, { canBet: boolean; reason?: string; fetchedAt: number }>();
  private oddsInFlight = new Map<string, Promise<MatchOdds>>();
  private bettingDataInFlight = new Map<string, Promise<BettingDataResult>>();

  private getOddsCacheKey(redTeams: number[], blueTeams: number[], eventKey: string, matchKey?: string): string {
    return matchKey ?? `${eventKey}:${redTeams.join(',')}:${blueTeams.join(',')}`;
  }

  /**
   * Get cached eligibility (sync). Same TTL as odds cache.
   */
  getCachedEligibility(
    redTeams: number[],
    blueTeams: number[],
    eventKey: string,
    matchKey?: string
  ): { canBet: boolean; reason?: string } | null {
    const cacheKey = this.getOddsCacheKey(redTeams, blueTeams, eventKey, matchKey);
    const cached = this.eligibilityCache.get(cacheKey);
    if (cached && Date.now() - cached.fetchedAt < ODDS_CACHE_TTL_MS) {
      return { canBet: cached.canBet, reason: cached.reason };
    }
    return null;
  }

  /**
   * Check if betting is allowed for a match. Requires at least 2 teams with valid data
   * (manually scouted or Statbotics) per alliance. Uses cache when valid (same TTL as odds).
   */
  async checkBettingEligibility(
    redTeams: number[],
    blueTeams: number[],
    eventKey: string,
    matchKey?: string
  ): Promise<{ canBet: boolean; reason?: string }> {
    const cacheKey = this.getOddsCacheKey(redTeams, blueTeams, eventKey, matchKey);
    const cached = this.eligibilityCache.get(cacheKey);
    if (cached && Date.now() - cached.fetchedAt < ODDS_CACHE_TTL_MS) {
      return { canBet: cached.canBet, reason: cached.reason };
    }

    try {
      await teamStatisticsService.refreshTeamStatistics();
      const allTeams = [...redTeams, ...blueTeams];
      const allStats = await teamStatisticsService.getTeamStatisticsBatch(allTeams, eventKey);
      const redAlliance = this.buildAllianceDataFromStats(redTeams, allStats);
      const blueAlliance = this.buildAllianceDataFromStats(blueTeams, allStats);

      const redOk = redAlliance.teamsWithValidData >= 2;
      const blueOk = blueAlliance.teamsWithValidData >= 2;
      let result: { canBet: boolean; reason?: string };
      if (!redOk || !blueOk) {
        result = {
          canBet: false,
          reason: 'Insufficient data for accurate odds. Need at least 2 teams with data per alliance (manually scouted or Statbotics).',
        };
      } else {
        const redVar = (redAlliance.stdDev ?? 0) ** 2;
        const blueVar = (blueAlliance.stdDev ?? 0) ** 2;
        const marginStd = Math.sqrt(redVar + blueVar);
        result = marginStd <= 0
          ? { canBet: false, reason: 'Insufficient data for accurate odds.' }
          : { canBet: true };
      }
      this.eligibilityCache.set(cacheKey, { ...result, fetchedAt: Date.now() });
      return result;
    } catch (error) {
      console.error('Error checking betting eligibility:', error);
      return { canBet: false, reason: 'Insufficient data for accurate odds.' };
    }
  }

  /**
   * Preload odds for a match (call when user taps Place Bet, before modal opens).
   * Populates cache so modal open is near-instant.
   */
  preloadOdds(redTeams: number[], blueTeams: number[], eventKey: string, matchKey?: string): void {
    this.calculateMatchOdds(redTeams, blueTeams, eventKey, matchKey).catch(() => {
      // Silently ignore; modal will retry when it opens
    });
  }

  /**
   * Get cached odds synchronously (for instant display when reopening same match).
   */
  getCachedOdds(redTeams: number[], blueTeams: number[], eventKey: string, matchKey?: string): MatchOdds | null {
    const cacheKey = this.getOddsCacheKey(redTeams, blueTeams, eventKey, matchKey);
    const cached = this.oddsCache.get(cacheKey);
    if (cached && Date.now() - cached.fetchedAt < ODDS_CACHE_TTL_MS) {
      return cached.odds;
    }
    return null;
  }

  /**
   * Get betting data with full odds or 50/50 fallback. Single refresh + parallel fetches for speed.
   * Returns { hasFullOdds: true, odds } when 2+ teams per alliance have data; else { hasFullOdds: false, odds: 50/50 }.
   */
  async getBettingDataOrFallback(
    redTeams: number[],
    blueTeams: number[],
    eventKey: string,
    matchKey?: string
  ): Promise<BettingDataResult> {
    const cacheKey = this.getOddsCacheKey(redTeams, blueTeams, eventKey, matchKey);
    const now = Date.now();

    const cachedOdds = this.oddsCache.get(cacheKey);
    if (cachedOdds && now - cachedOdds.fetchedAt < ODDS_CACHE_TTL_MS) {
      return { hasFullOdds: true, odds: cachedOdds.odds };
    }

    const inFlight = this.bettingDataInFlight.get(cacheKey);
    if (inFlight) return inFlight;

    const promise = this.computeBettingDataOrFallback(redTeams, blueTeams, eventKey, cacheKey, now);
    this.bettingDataInFlight.set(cacheKey, promise);
    try {
      return await promise;
    } finally {
      this.bettingDataInFlight.delete(cacheKey);
    }
  }

  private async computeBettingDataOrFallback(
    redTeams: number[],
    blueTeams: number[],
    eventKey: string,
    cacheKey: string,
    now: number
  ): Promise<BettingDataResult> {
    const cachedEligibility = this.eligibilityCache.get(cacheKey);
    if (cachedEligibility && now - cachedEligibility.fetchedAt < ODDS_CACHE_TTL_MS && !cachedEligibility.canBet) {
      return { hasFullOdds: false, odds: FALLBACK_50_50_ODDS };
    }

    await teamStatisticsService.refreshTeamStatistics();
    const allTeams = [...redTeams, ...blueTeams];
    const [allStats, leagueAverage] = await Promise.all([
      teamStatisticsService.getTeamStatisticsBatch(allTeams, eventKey),
      this.getLeagueAverage(eventKey),
    ]);

    const redAlliance = this.buildAllianceDataFromStats(redTeams, allStats);
    const blueAlliance = this.buildAllianceDataFromStats(blueTeams, allStats);

    const redOk = redAlliance.teamsWithValidData >= 2;
    const blueOk = blueAlliance.teamsWithValidData >= 2;
    const redVar = (redAlliance.stdDev ?? 0) ** 2;
    const blueVar = (blueAlliance.stdDev ?? 0) ** 2;
    const marginStd = Math.sqrt(redVar + blueVar);
    const hasFullOdds = redOk && blueOk && marginStd > 0;

    if (!hasFullOdds) {
      this.eligibilityCache.set(cacheKey, { canBet: false, reason: 'Insufficient data', fetchedAt: now });
      return { hasFullOdds: false, odds: FALLBACK_50_50_ODDS };
    }

    const matchConf = this.calculateMatchConfidence(redAlliance.confidence, blueAlliance.confidence);
    const winnerOdds = this.calculateWinnerOdds(
      redAlliance.average,
      blueAlliance.average,
      redAlliance.confidence,
      blueAlliance.confidence,
      matchConf
    );
    const redAvg = redAlliance.average;
    const blueAvg = blueAlliance.average;
    const expectedMargin = Math.abs(redAvg - blueAvg);
    const expectedTotal = redAvg + blueAvg;
    const totalStd = marginStd;

    const odds: MatchOdds = {
      redWinProbability: winnerOdds.redWinProb,
      blueWinProbability: winnerOdds.blueWinProb,
      redOdds: winnerOdds.redOdds,
      blueOdds: winnerOdds.blueOdds,
      expectedMargin,
      expectedTotal,
      matchConfidence: matchConf,
      leagueAverage: leagueAverage || undefined,
      redAverage: redAvg,
      blueAverage: blueAvg,
      marginStd,
      totalStd,
    };
    this.oddsCache.set(cacheKey, { odds, fetchedAt: now });
    this.eligibilityCache.set(cacheKey, { canBet: true, fetchedAt: now });
    return { hasFullOdds: true, odds };
  }

  /**
   * Get user identifier (scout_name:team_number)
   */
  private async getUserIdentifier(): Promise<string | null> {
    try {
      const scoutName = await AsyncStorage.getItem('scout_name');
      const teamNumber = await AsyncStorage.getItem('team_number');
      
      if (!scoutName || !teamNumber) {
        return null;
      }
      
      return `${scoutName}:${teamNumber}`;
    } catch (error) {
      console.error('Error getting user identifier:', error);
      return null;
    }
  }

  /**
   * Calculate team confidence (0.2 per match, max 1.0 at 5 matches)
   */
  async calculateTeamConfidence(teamNumber: number, eventKey: string): Promise<number> {
    try {
      const stats = await teamStatisticsService.getTeamStatistics(teamNumber, eventKey);
      if (!stats) {
        return 0.0;
      }
      
      return Math.min(1.0, stats.matchCount * 0.2);
    } catch (error) {
      console.error('Error calculating team confidence:', error);
      return 0.0;
    }
  }

  /**
   * Build AllianceData from pre-fetched team statistics (sync, no I/O).
   * No default stdev - only teams with valid blendedStdDev or stdDevScore contribute to variance.
   */
  private buildAllianceDataFromStats(
    teams: number[],
    teamStats: Map<number, TeamStatistics>
  ): AllianceData {
    if (teams.length === 0) {
      return { teams: [], average: 0, confidence: 0.0, stdDev: 0, teamsWithValidData: 0 };
    }
    let totalAverage = 0;
    let totalConfidence = 0;
    let validTeams = 0;
    let teamsWithValidData = 0;
    teams.forEach((teamNumber) => {
      const stats = teamStats.get(teamNumber);
      if (stats) {
        const confidence = Math.min(1.0, stats.matchCount * 0.2);
        totalAverage += stats.avgMatchScore;
        totalConfidence += confidence;
        validTeams++;
        const sd = stats.blendedStdDev ?? stats.stdDevScore;
        const hasValidSd = typeof sd === 'number' && sd > 0;
        const hasValidAvg = stats.avgMatchScore > 0 || stats.matchCount > 0;
        if (hasValidSd && hasValidAvg) teamsWithValidData++;
      }
    });
    const average = validTeams > 0 ? totalAverage / validTeams : 0;
    const confidence = validTeams > 0 ? totalConfidence / validTeams : 0.0;
    const totalVariance = teams.reduce((sum, tn) => {
      const stats = teamStats.get(tn);
      if (!stats) return sum;
      const sd = stats.blendedStdDev ?? stats.stdDevScore;
      if (typeof sd === 'number' && sd > 0) return sum + sd * sd;
      return sum;
    }, 0);
    const stdDev = Math.sqrt(totalVariance);
    return { teams, average, confidence, stdDev, teamsWithValidData };
  }

  /**
   * Calculate alliance averages and confidence (fetches data; use for single-alliance needs)
   */
  async calculateAllianceAverages(
    teams: number[],
    eventKey: string
  ): Promise<AllianceData> {
    try {
      if (teams.length === 0) {
        return { teams: [], average: 0, confidence: 0.0, stdDev: 0, teamsWithValidData: 0 };
      }
      await teamStatisticsService.refreshTeamStatistics();
      const teamStats = await teamStatisticsService.getTeamStatisticsBatch(teams, eventKey);
      return this.buildAllianceDataFromStats(teams, teamStats);
    } catch (error) {
      console.error('Error calculating alliance averages:', error);
      return { teams, average: 0, confidence: 0.0, stdDev: 0, teamsWithValidData: 0 };
    }
  }

  /**
   * Calculate match confidence (average of alliance confidences)
   */
  calculateMatchConfidence(redConf: number, blueConf: number): number {
    return (redConf + blueConf) / 2;
  }

  /**
   * Check if league average threshold is met (50% of teams with 3+ matches)
   */
  async checkLeagueAverageThreshold(eventKey: string): Promise<boolean> {
    try {
      // Get total teams from TBA API
      const totalTeams = await this.getEventTeamsCount(eventKey);
      if (totalTeams === 0) {
        return false;
      }

      // Get all team statistics for event
      const allStats = await teamStatisticsService.getAllTeamStatisticsForEvent(eventKey);
      
      // Count teams with 3+ matches
      let qualifyingCount = 0;
      allStats.forEach(stats => {
        if (stats.matchCount >= 3) {
          qualifyingCount++;
        }
      });

      const coverage = qualifyingCount / totalTeams;
      return coverage >= 0.5;
    } catch (error) {
      console.error('Error checking league average threshold:', error);
      return false;
    }
  }

  /**
   * Get league average for event
   */
  async getLeagueAverage(eventKey: string): Promise<LeagueAverage | null> {
    try {
      return await teamStatisticsService.getLeagueAverage(eventKey);
    } catch (error) {
      console.error('Error getting league average:', error);
      return null;
    }
  }

  /**
   * Calculate winner odds (Red vs Blue)
   */
  calculateWinnerOdds(
    redAvg: number,
    blueAvg: number,
    redConf: number,
    blueConf: number,
    matchConf: number
  ): { redWinProb: number; blueWinProb: number; redOdds: number; blueOdds: number } {
    // Calculate data-driven win probability
    let redWinProbData = 0.5; // Default 50/50

    if (redAvg > 0 && blueAvg > 0) {
      // Both alliances have data
      const totalScore = redAvg + blueAvg;
      
      // Calculate relative contribution percentages
      const redContribution = redAvg / totalScore; // 0.0 to 1.0 (percentage of total)
      const blueContribution = blueAvg / totalScore;
      
      // Use raw contribution percentage directly as win probability
      // If red contributes 60% of total score, red's win probability is 60%
      redWinProbData = redContribution;
      
      // Clamp to [0.2, 0.8] for safety
      redWinProbData = Math.max(0.2, Math.min(0.8, redWinProbData));
    } else if (redAvg > 0 && blueAvg === 0) {
      // Only red has data
      redWinProbData = 0.5 + (redAvg / 200) * redConf;
      redWinProbData = Math.max(0.3, Math.min(0.7, redWinProbData));
    } else if (redAvg === 0 && blueAvg > 0) {
      // Only blue has data
      redWinProbData = 0.5 - (blueAvg / 200) * blueConf;
      redWinProbData = Math.max(0.3, Math.min(0.7, redWinProbData));
    }


    // Blend with neutral (50/50) based on match confidence
    // Reduced impact: even low confidence has minimal blending toward 50/50
    // Use a small factor (0.1) so that low confidence only slightly adjusts probabilities
    const neutralWeight = (1 - matchConf) * 0.1; // Max 10% blending even at confidence 0
    const dataWeight = 1 - neutralWeight;
    const finalRedWinProb = (0.5 * neutralWeight) + (redWinProbData * dataWeight);
    const finalBlueWinProb = 1 - finalRedWinProb;

    // Calculate odds
    let redOdds = 1 / finalRedWinProb;
    let blueOdds = 1 / finalBlueWinProb;

    // Round to 2 decimal places
    redOdds = Math.round(redOdds * 100) / 100;
    blueOdds = Math.round(blueOdds * 100) / 100;

    // Ensure minimum odds of 1.1 and maximum of 10.0
    redOdds = Math.max(1.1, Math.min(10.0, redOdds));
    blueOdds = Math.max(1.1, Math.min(10.0, blueOdds));

    return {
      redWinProb: finalRedWinProb,
      blueWinProb: finalBlueWinProb,
      redOdds,
      blueOdds,
    };
  }

  /** Legacy margin ranges (for resolving old bets) */
  static readonly MARGIN_RANGES: Array<{ rangeKey: string; minMult: number; maxMult: number | null }> = [
    { rangeKey: '0-0.5', minMult: 0, maxMult: 0.5 },
    { rangeKey: '0.5-0.75', minMult: 0.5, maxMult: 0.75 },
    { rangeKey: '0.75-1', minMult: 0.75, maxMult: 1 },
    { rangeKey: '1-1.25', minMult: 1, maxMult: 1.25 },
    { rangeKey: '1.25-1.5', minMult: 1.25, maxMult: 1.5 },
    { rangeKey: '1.5+', minMult: 1.5, maxMult: null },
  ];

  /** Mean bucket: ±(0.75–1)σ, using 0.85σ (midpoint of 0.05 increments) */
  private static readonly MEAN_SIGMA = 0.85;
  /** 1above/1below outer bound: 1.75–2.25σ, using 2.0σ */
  private static readonly OUTER_SIGMA = 2.0;

  /**
   * Get margin options (stdev-based) for an alliance.
   * Mean bucket: mean ± 0.85σ (or one-sided if other side goes below 0).
   * 1above: mean+0.85σ to mean+2σ. 1below: mean-2σ to mean-0.85σ.
   * 2above/2below removed. Excludes options that go below 0 except mean one-sided case.
   */
  getMarginOptions(
    expectedMargin: number,
    marginStd: number,
    alliance: 'red' | 'blue'
  ): Array<{ rangeKey: string; lowerBound: number | null; upperBound: number | null; label: string }> {
    if (expectedMargin <= 0 || marginStd <= 0) return [];
    const mean = alliance === 'red' ? expectedMargin : -expectedMargin;
    const ms = BettingService.MEAN_SIGMA;
    const os = BettingService.OUTER_SIGMA;

    // Mean bucket: mean ± 0.85σ. Special case: if mean - 0.85σ < 0 (Red) or mean + 0.85σ > 0 (Blue), use one-sided only.
    let meanLower: number | null;
    let meanUpper: number | null;
    if (alliance === 'red' && mean - ms * marginStd < 0) {
      meanLower = mean;
      meanUpper = mean + ms * marginStd;
    } else if (alliance === 'blue' && mean + ms * marginStd > 0) {
      meanLower = mean - ms * marginStd;
      meanUpper = mean;
    } else {
      meanLower = mean - ms * marginStd;
      meanUpper = mean + ms * marginStd;
    }

    const options: Array<{ rangeKey: string; lowerBound: number | null; upperBound: number | null }> = [
      { rangeKey: '1above', lowerBound: mean + ms * marginStd, upperBound: mean + os * marginStd },
      { rangeKey: 'mean', lowerBound: meanLower, upperBound: meanUpper },
      { rangeKey: '1below', lowerBound: mean - os * marginStd, upperBound: mean - ms * marginStd },
    ];

    const filtered = options.filter((opt) => {
      const minVal = opt.lowerBound ?? -1e9;
      const maxVal = opt.upperBound ?? 1e9;
      if (alliance === 'red') return minVal >= 0;
      return maxVal <= 0;
    });

    return filtered.map((opt) => {
      const lo = opt.lowerBound;
      const hi = opt.upperBound;
      let label: string;
      if (hi === null && lo !== null) {
        label = `${Math.round(Math.abs(lo))}+ pts`;
      } else if (lo === null && hi !== null) {
        label = `${Math.round(Math.abs(hi))}+ pts`;
      } else if (lo !== null && hi !== null) {
        const a = Math.round(Math.abs(lo));
        const b = Math.round(Math.abs(hi));
        label = `${Math.min(a, b)}-${Math.max(a, b)} pts`;
      } else {
        label = '';
      }
      return { ...opt, label };
    });
  }

  /**
   * Calculate margin bet odds using normal distribution (stdev-based ranges).
   */
  calculateMarginOdds(
    expectedMargin: number,
    rangeKey: string,
    alliance: 'red' | 'blue',
    marginStd: number,
    matchConf: number,
    lowerBound?: number | null,
    upperBound?: number | null
  ): number {
    const opts = this.getMarginOptions(expectedMargin, marginStd, alliance);
    const opt = opts.find((o) => o.rangeKey === rangeKey);
    const lower = lowerBound !== undefined ? lowerBound : opt?.lowerBound ?? 0;
    const upper = upperBound !== undefined ? upperBound : opt?.upperBound;

    if (expectedMargin <= 0 || marginStd <= 0) return 2.0;

    const signedMean = alliance === 'red' ? expectedMargin : -expectedMargin;

    let dataProb: number;
    if (upper == null && lower != null && typeof lower === 'number') {
      dataProb = 1 - normalCDF(lower, signedMean, marginStd);
    } else if (lower == null && upper != null && typeof upper === 'number') {
      dataProb = normalCDF(upper, signedMean, marginStd);
    } else if (lower != null && upper != null && typeof lower === 'number' && typeof upper === 'number') {
      dataProb = normalCDFRange(Math.min(lower, upper), Math.max(lower, upper), signedMean, marginStd);
    } else {
      return 2.0;
    }

    dataProb = Math.max(0.05, Math.min(0.95, dataProb));
    const neutralWeight = (1 - matchConf) * 0.1;
    const dataWeight = 1 - neutralWeight;
    const finalProb = (0.5 * neutralWeight) + (dataProb * dataWeight);
    const clampedProb = Math.max(0.1, Math.min(0.9, finalProb));
    let odds = 1 / clampedProb;
    odds = Math.round(odds * 100) / 100;
    return Math.max(1.1, Math.min(20.0, odds));
  }

  /**
   * Get over/under options using same distribution constants as margin (MEAN_SIGMA, OUTER_SIGMA).
   * Rows: outer (±2σ), middle (±0.85σ), center (mean).
   * Excludes options where threshold < 0.
   */
  getOverUnderOptions(
    expectedTotal: number,
    totalStd: number
  ): Array<{ over: { threshold: number; label: string } | null; under: { threshold: number; label: string } | null }> {
    if (expectedTotal <= 0 || totalStd <= 0) return [];
    const ms = BettingService.MEAN_SIGMA;
    const os = BettingService.OUTER_SIGMA;
    const overOuter = Math.round(expectedTotal + os * totalStd);
    const overMiddle = Math.round(expectedTotal + ms * totalStd);
    const mean = Math.round(expectedTotal);
    const underMiddle = Math.round(expectedTotal - ms * totalStd);
    const underOuter = Math.round(expectedTotal - os * totalStd);
    return [
      {
        over: overOuter >= 0 ? { threshold: overOuter, label: `Over ${overOuter}` } : null,
        under: underOuter >= 0 ? { threshold: underOuter, label: `Under ${underOuter}` } : null,
      },
      {
        over: overMiddle >= 0 ? { threshold: overMiddle, label: `Over ${overMiddle}` } : null,
        under: underMiddle >= 0 ? { threshold: underMiddle, label: `Under ${underMiddle}` } : null,
      },
      {
        over: mean >= 0 ? { threshold: mean, label: `Over ${mean}` } : null,
        under: mean >= 0 ? { threshold: mean, label: `Under ${mean}` } : null,
      },
    ];
  }

  /**
   * Calculate over/under odds using normal distribution.
   * Total ~ N(expectedTotal, totalStd)
   */
  calculateOverUnderOdds(
    expectedTotal: number,
    threshold: number,
    overUnder: 'over' | 'under',
    matchConf: number,
    totalStd: number,
    leagueAvg?: LeagueAverage
  ): number {
    let dataProb = 0.5;

    if (expectedTotal > 0 && totalStd > 0) {
      if (overUnder === 'over') {
        dataProb = 1 - normalCDF(threshold, expectedTotal, totalStd);
      } else {
        dataProb = normalCDF(threshold, expectedTotal, totalStd);
      }
      dataProb = Math.max(0.05, Math.min(0.95, dataProb));
    }

    const neutralWeight = (1 - matchConf) * 0.1;
    const dataWeight = 1 - neutralWeight;
    const finalProb = (0.5 * neutralWeight) + (dataProb * dataWeight);
    const clampedProb = Math.max(0.1, Math.min(0.9, finalProb));

    let odds = 1 / clampedProb;
    odds = Math.round(odds * 100) / 100;
    return Math.max(1.1, Math.min(10.0, odds));
  }

  /**
   * Calculate all match odds. Uses cache for instant reopen of same match.
   */
  async calculateMatchOdds(
    redTeams: number[],
    blueTeams: number[],
    eventKey: string,
    matchKey?: string
  ): Promise<MatchOdds> {
    const cacheKey = this.getOddsCacheKey(redTeams, blueTeams, eventKey, matchKey);
    const now = Date.now();

    const cached = this.oddsCache.get(cacheKey);
    if (cached && now - cached.fetchedAt < ODDS_CACHE_TTL_MS) {
      return cached.odds;
    }

    const inFlight = this.oddsInFlight.get(cacheKey);
    if (inFlight) {
      return inFlight;
    }

    const promise = this.computeMatchOdds(redTeams, blueTeams, eventKey);
    this.oddsInFlight.set(cacheKey, promise);
    try {
      const odds = await promise;
      this.oddsCache.set(cacheKey, { odds, fetchedAt: now });
      return odds;
    } finally {
      this.oddsInFlight.delete(cacheKey);
    }
  }

  private async computeMatchOdds(
    redTeams: number[],
    blueTeams: number[],
    eventKey: string
  ): Promise<MatchOdds> {
    await teamStatisticsService.refreshTeamStatistics();
    const allTeams = [...redTeams, ...blueTeams];
    const [allStats, leagueAverage] = await Promise.all([
      teamStatisticsService.getTeamStatisticsBatch(allTeams, eventKey),
      this.getLeagueAverage(eventKey),
    ]);

    const redAlliance = this.buildAllianceDataFromStats(redTeams, allStats);
    const blueAlliance = this.buildAllianceDataFromStats(blueTeams, allStats);

    const matchConf = this.calculateMatchConfidence(redAlliance.confidence, blueAlliance.confidence);
    const winnerOdds = this.calculateWinnerOdds(
      redAlliance.average,
      blueAlliance.average,
      redAlliance.confidence,
      blueAlliance.confidence,
      matchConf
    );

    const redOk = redAlliance.teamsWithValidData >= 2;
    const blueOk = blueAlliance.teamsWithValidData >= 2;
    if (!redOk || !blueOk) {
      throw new Error('Insufficient data for odds: need at least 2 teams with data per alliance');
    }

    const redAvg = redAlliance.average;
    const blueAvg = blueAlliance.average;
    const expectedMargin = Math.abs(redAvg - blueAvg);
    const expectedTotal = redAvg + blueAvg;

    const redVar = (redAlliance.stdDev ?? 0) ** 2;
    const blueVar = (blueAlliance.stdDev ?? 0) ** 2;
    const marginStd = Math.sqrt(redVar + blueVar);
    const totalStd = Math.sqrt(redVar + blueVar);
    if (marginStd <= 0 || totalStd <= 0) {
      throw new Error('Insufficient data for odds: no valid stdev');
    }

    return {
      redWinProbability: winnerOdds.redWinProb,
      blueWinProbability: winnerOdds.blueWinProb,
      redOdds: winnerOdds.redOdds,
      blueOdds: winnerOdds.blueOdds,
      expectedMargin,
      expectedTotal,
      matchConfidence: matchConf,
      leagueAverage: leagueAverage || undefined,
      redAverage: redAvg,
      blueAverage: blueAvg,
      marginStd,
      totalStd,
    };
  }

  /**
   * Get event teams count from TBA API
   */
  async getEventTeamsCount(eventKey: string): Promise<number> {
    try {
      const response = await tbaClient.get(`/event/${eventKey}/teams`);
      const teams = response.data;
      return Array.isArray(teams) ? teams.length : 0;
    } catch (error) {
      console.error('Error fetching event teams:', error);
      return 0;
    }
  }

  /**
   * Get match result from TBA API
   */
  async getMatchResult(matchKey: string): Promise<TBAMatch | null> {
    try {
      const response = await tbaClient.get<TBAMatch>(`/match/${matchKey}`);
      return response.data;
    } catch (error) {
      console.error('Error fetching match result:', error);
      return null;
    }
  }

  /**
   * Check if a match has already ended (scores posted). Uses TBA API.
   * Fastest check: winning_alliance or alliance scores indicate match completion.
   */
  async isMatchEnded(matchKey: string): Promise<boolean> {
    try {
      const match = await this.getMatchResult(matchKey);
      const redScore = match?.alliances?.red?.score;
      const blueScore = match?.alliances?.blue?.score;
      const winningAlliance = match?.winning_alliance;
      console.warn('[TBA Match]', matchKey, JSON.stringify({
        redScore,
        blueScore,
        winningAlliance,
        alliances: match?.alliances ? { red: match.alliances.red, blue: match.alliances.blue } : undefined,
      }));
      if (!match?.alliances) return false;
      // A match is ended if its score is >= 0, it is -1 if not yet played
      const hasScores = typeof redScore === 'number' && typeof blueScore === 'number' && redScore >= 0 && blueScore >= 0;
      const hasWinningAlliance = winningAlliance === 'red' || winningAlliance === 'blue';
      return hasScores && hasWinningAlliance;
    } catch (error) {
      console.error('Error checking if match ended:', error);
      return false;
    }
  }

  /**
   * Place a bet
   */
  async placeBet(betData: BetData): Promise<string | null> {
    try {
      const [userIdentifier, teamId] = await Promise.all([
        this.getUserIdentifier(),
        useAuthStore.getState().getTeamId(),
      ]);
      if (!userIdentifier || !teamId) {
        throw new Error('No user identifier or team');
      }

      const isDemoMode = useDemoStore.getState().isDemoMode;
      const { data, error } = await supabase
        .from('bets')
        .insert({
          team_id: teamId,
          user_identifier: userIdentifier,
          match_key: betData.matchKey,
          match_number: betData.matchNumber,
          event_key: betData.eventKey,
          bet_type: betData.betType,
          bet_details: betData.betDetails,
          bet_amount: betData.betAmount,
          odds: betData.odds,
          potential_payout: betData.potentialPayout,
          status: 'pending',
          is_demo_mode: isDemoMode,
        })
        .select('id')
        .single();

      if (error) {
        console.error('Error placing bet:', error);
        return null;
      }

      return data.id;
    } catch (error) {
      console.error('Error placing bet:', error);
      return null;
    }
  }

  /**
   * Resolve a bet
   */
  async resolveBet(betId: string, won: boolean, payout: number): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('bets')
        .update({
          status: won ? 'won' : 'lost',
          payout: won ? payout : 0,
          resolved_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', betId);

      if (error) {
        console.error('Error resolving bet:', error);
        return false;
      }

      // Update user balance if bet won
      if (won && payout > 0) {
        const userIdentifier = await this.getUserIdentifier();
        if (userIdentifier) {
          // Get current balance first
          const { data: currentData } = await supabase
            .from('user_ebucks_balance')
            .select('balance')
            .eq('user_identifier', userIdentifier)
            .single();
          
          const newBalance = (currentData?.balance || 0) + payout;
          
          const { error: balanceError } = await supabase
            .from('user_ebucks_balance')
            .update({
              balance: newBalance,
              updated_at: new Date().toISOString(),
            })
            .eq('user_identifier', userIdentifier);

          if (balanceError) {
            console.error('Error updating balance after bet win:', balanceError);
          }
        }
      }

      return true;
    } catch (error) {
      console.error('Error resolving bet:', error);
      return false;
    }
  }

  /**
   * Get user bets
   */
  async getUserBets(status?: 'pending' | 'won' | 'lost'): Promise<Bet[]> {
    try {
      const userIdentifier = await this.getUserIdentifier();
      if (!userIdentifier) {
        return [];
      }
      
      let query = supabase
        .from('bets')
        .select('*')
        .eq('user_identifier', userIdentifier)
        .order('created_at', { ascending: false });

      if (status) {
        query = query.eq('status', status);
      }

      const { data, error } = await query;

      if (error) {
        console.error('Error fetching user bets:', error);
        return [];
      }

      return (data || []).map((row: any) => ({
        id: row.id,
        userIdentifier: row.user_identifier,
        matchKey: row.match_key,
        matchNumber: row.match_number,
        eventKey: row.event_key,
        betType: row.bet_type,
        betDetails: row.bet_details,
        betAmount: row.bet_amount,
        odds: parseFloat(row.odds),
        potentialPayout: parseFloat(row.potential_payout),
        status: row.status,
        payout: row.payout || 0,
        resolvedAt: row.resolved_at,
        createdAt: row.created_at,
        isDemoMode: row.is_demo_mode ?? false,
      }));
    } catch (error) {
      console.error('Error fetching user bets:', error);
      return [];
    }
  }

  /**
   * Get bets for a match
   */
  async getMatchBets(matchKey: string): Promise<Bet[]> {
    try {
      const { data, error } = await supabase
        .from('bets')
        .select('*')
        .eq('match_key', matchKey)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching match bets:', error);
        return [];
      }

      return (data || []).map((row: any) => ({
        id: row.id,
        userIdentifier: row.user_identifier,
        matchKey: row.match_key,
        matchNumber: row.match_number,
        eventKey: row.event_key,
        betType: row.bet_type,
        betDetails: row.bet_details,
        betAmount: row.bet_amount,
        odds: parseFloat(row.odds),
        potentialPayout: parseFloat(row.potential_payout),
        status: row.status,
        payout: row.payout || 0,
        resolvedAt: row.resolved_at,
        createdAt: row.created_at,
        isDemoMode: row.is_demo_mode ?? false,
      }));
    } catch (error) {
      console.error('Error fetching match bets:', error);
      return [];
    }
  }

  /**
   * Check if anyone has scouted this match (local or team's Supabase).
   * Used to block betting when the match has scouting data from any team member.
   */
  async hasMatchBeenScoutedByAnyone(matchResult: TBAMatch): Promise<boolean> {
    const teamNumbers = [
      ...matchResult.alliances.red.team_keys.map((k) => parseInt(k.replace('frc', ''), 10)),
      ...matchResult.alliances.blue.team_keys.map((k) => parseInt(k.replace('frc', ''), 10)),
    ];

    await db.init();
    for (const tn of teamNumbers) {
      const inLocal = await db.checkMatchExists(matchResult.match_number, tn);
      if (inLocal) return true;
    }

    const eventKey = matchResult.event_key || matchResult.key.split('_')[0];
    const remoteMatches = await supabaseSyncService.getMatches(eventKey);
    const inRemote = remoteMatches?.some(
      (m: { match_number?: number; team_number?: number }) =>
        m.match_number === matchResult.match_number &&
        teamNumbers.includes(m.team_number ?? 0)
    );
    return !!inRemote;
  }

  /**
   * Check if the current user has scouted this match (local or synced to Supabase).
   * Used to delay bet resolution until the user has submitted their scouting data.
   */
  async hasCurrentUserScoutedMatch(matchResult: TBAMatch): Promise<boolean> {
    const scoutName = await AsyncStorage.getItem('scout_name');
    if (!scoutName?.trim()) return false;

    const teamNumbers = [
      ...matchResult.alliances.red.team_keys.map((k) => parseInt(k.replace('frc', ''), 10)),
      ...matchResult.alliances.blue.team_keys.map((k) => parseInt(k.replace('frc', ''), 10)),
    ];

    await db.init();
    for (const tn of teamNumbers) {
      const inLocal = await db.checkMatchScoutedByScouter(
        matchResult.match_number,
        tn,
        scoutName
      );
      if (inLocal) return true;
    }

    const eventKey = matchResult.event_key || matchResult.key.split('_')[0];
    const remoteMatches = await supabaseSyncService.getMatches(eventKey);
    const inRemote = remoteMatches?.some(
      (m: { match_number?: number; team_number?: number; scout_name?: string }) =>
        m.match_number === matchResult.match_number &&
        teamNumbers.includes(m.team_number ?? 0) &&
        (m.scout_name || '').trim() === scoutName.trim()
    );
    return !!inRemote;
  }

  /**
   * Check and resolve bets for a match.
   * Returns resolutions for the current user (for notifications).
   * Only resolves after the current user has scouted and submitted the match.
   */
  async checkAndResolveBets(matchKey: string): Promise<Array<{ matchNumber: number; won: boolean; payout: number }>> {
    try {
      console.log(`[Betting] Checking bets for match: ${matchKey}`);
      
      // Get match result from TBA
      const matchResult = await this.getMatchResult(matchKey);
      
      if (!matchResult) {
        console.log(`[Betting] No match data found for: ${matchKey}`);
        return [];
      }
      
      // Check if match has been played - winning_alliance must be 'red' or 'blue'
      const winningAlliance = matchResult.winning_alliance;
      if (!winningAlliance || (winningAlliance !== 'red' && winningAlliance !== 'blue')) {
        console.log(`[Betting] Match ${matchKey} not completed yet. winning_alliance: ${winningAlliance}`);
        return [];
      }
      
      // Verify we have actual score data, not just a winning alliance
      const scoreBreakdown = matchResult.score_breakdown;
      if (!scoreBreakdown || !scoreBreakdown.red || !scoreBreakdown.blue) {
        console.log(`[Betting] Match ${matchKey} missing score breakdown. Cannot resolve bets.`);
        return [];
      }

      // Don't resolve until the current user has scouted and submitted this match
      const hasScouted = await this.hasCurrentUserScoutedMatch(matchResult);
      if (!hasScouted) {
        console.log(`[Betting] Match ${matchKey} not yet scouted by user. Waiting for submit before resolving.`);
        return [];
      }

      // Get all pending bets for this match
      const { data: bets, error } = await supabase
        .from('bets')
        .select('*')
        .eq('match_key', matchKey)
        .eq('status', 'pending');

      if (error || !bets) {
        console.error('Error fetching bets for resolution:', error);
        return [];
      }

      if (bets.length === 0) {
        console.log(`[Betting] No pending bets for match: ${matchKey}`);
        return [];
      }

      // Get match scores - use score or totalPoints depending on TBA response format
      const redScore = scoreBreakdown.red.totalPoints ?? scoreBreakdown.red.score ?? matchResult.alliances.red.score ?? 0;
      const blueScore = scoreBreakdown.blue.totalPoints ?? scoreBreakdown.blue.score ?? matchResult.alliances.blue.score ?? 0;
      const totalScore = redScore + blueScore;
      const margin = Math.abs(redScore - blueScore);
      const redWon = winningAlliance === 'red';
      
      console.log(`[Betting] Match ${matchKey} results: Red ${redScore} - Blue ${blueScore}, Winner: ${winningAlliance}`);

      // Compute all bet outcomes in memory (no DB calls)
      const resolutions: Array<{ id: string; status: 'won' | 'lost'; payout: number; user_identifier: string; match_number: number; is_demo_mode: boolean }> = [];
      const userIdentifier = await this.getUserIdentifier();

      for (const bet of bets) {
        let won = false;
        let payout = 0;

        switch (bet.bet_type) {
          case 'winner':
            const betAlliance = bet.bet_details?.alliance;
            if (betAlliance === 'red' && redWon) {
              won = true;
              payout = Math.round(bet.bet_amount * parseFloat(bet.odds));
              console.log(`[Betting] Winner bet WON - Bet ID: ${bet.id}`);
              console.log(`  Bet on: ${betAlliance.toUpperCase()} alliance`);
              console.log(`  Actual result: ${winningAlliance.toUpperCase()} won (Red: ${redScore}, Blue: ${blueScore})`);
              console.log(`  Payout: ${payout} ebucks (${bet.bet_amount} × ${bet.odds})`);
            } else if (betAlliance === 'blue' && !redWon) {
              won = true;
              payout = Math.round(bet.bet_amount * parseFloat(bet.odds));
              console.log(`[Betting] Winner bet WON - Bet ID: ${bet.id}`);
              console.log(`  Bet on: ${betAlliance.toUpperCase()} alliance`);
              console.log(`  Actual result: ${winningAlliance.toUpperCase()} won (Red: ${redScore}, Blue: ${blueScore})`);
              console.log(`  Payout: ${payout} ebucks (${bet.bet_amount} × ${bet.odds})`);
            } else {
              console.log(`[Betting] Winner bet LOST - Bet ID: ${bet.id}`);
              console.log(`  Bet on: ${betAlliance?.toUpperCase()} alliance`);
              console.log(`  Actual result: ${winningAlliance.toUpperCase()} won (Red: ${redScore}, Blue: ${blueScore})`);
            }
            break;

          case 'margin': {
            const marginBetAlliance = bet.bet_details?.alliance;
            const actualWinner = redScore > blueScore ? 'red' : 'blue';
            const signedMargin = redScore - blueScore;

            // New format: stdev-based (lowerBound, upperBound in points, margin = Red - Blue)
            const lowerBound = bet.bet_details?.lowerBound;
            const upperBound = bet.bet_details?.upperBound;
            if (lowerBound != null || upperBound != null) {
              const lo = lowerBound ?? -Infinity;
              const hi = upperBound ?? Infinity;
              const inRange = signedMargin >= lo && signedMargin <= hi;
              if (marginBetAlliance === actualWinner && inRange) {
                won = true;
                payout = Math.round(bet.bet_amount * parseFloat(bet.odds));
                console.log(`[Betting] Margin range bet WON - Bet ID: ${bet.id}`);
              } else {
                console.log(`[Betting] Margin range bet LOST - Bet ID: ${bet.id}`);
              }
            } else if (bet.bet_details?.marginRange !== undefined && bet.bet_details?.expectedMarginAtBet !== undefined) {
              // Legacy percentage-based format
              const marginRange = bet.bet_details.marginRange;
              const expectedMarginAtBet = bet.bet_details.expectedMarginAtBet;
              const range = BettingService.MARGIN_RANGES.find((r) => r.rangeKey === marginRange);
              if (range) {
                const minMargin = expectedMarginAtBet * range.minMult;
                const maxMargin = range.maxMult === null ? Infinity : expectedMarginAtBet * range.maxMult;
                const allianceMargin = marginBetAlliance === 'red' ? signedMargin : -signedMargin;
                const inRange = allianceMargin >= minMargin && (range.maxMult === null || allianceMargin < maxMargin);
                if (marginBetAlliance === actualWinner && inRange) {
                  won = true;
                  payout = Math.round(bet.bet_amount * parseFloat(bet.odds));
                }
              }
            } else {
              // Legacy format: threshold-based (margin as number)
              const betMargin = bet.bet_details?.margin;
              if (betMargin !== undefined) {
                if (marginBetAlliance === actualWinner && margin >= betMargin) {
                  won = true;
                  payout = Math.round(bet.bet_amount * parseFloat(bet.odds));
                  console.log(`[Betting] Margin bet WON - Bet ID: ${bet.id}`);
                } else {
                  console.log(`[Betting] Margin bet LOST - Bet ID: ${bet.id}`);
                }
              }
            }
            break;
          }

          case 'over_under':
            const threshold = bet.bet_details?.threshold;
            const overUnder = bet.bet_details?.overUnder || bet.bet_details?.over_under; // Support both formats
            console.log(`[Betting] Resolving over/under bet ${bet.id}:`, {
              threshold,
              overUnder,
              betDetails: bet.bet_details,
              totalScore,
              redScore,
              blueScore
            });
            if (threshold !== undefined && overUnder) {
              const scoreDifference = overUnder === 'over' 
                ? totalScore - threshold 
                : threshold - totalScore;
              
              if (overUnder === 'over' && totalScore > threshold) {
                won = true;
                payout = Math.round(bet.bet_amount * parseFloat(bet.odds));
                console.log(`[Betting] Over/Under bet WON - Bet ID: ${bet.id}`);
                console.log(`  Bet type: OVER ${threshold}`);
                console.log(`  Actual total score: ${totalScore} points (Red: ${redScore}, Blue: ${blueScore})`);
                console.log(`  Bet threshold: ${threshold} points`);
                console.log(`  Won by: ${scoreDifference.toFixed(1)} points`);
                console.log(`  Payout: ${payout} ebucks (${bet.bet_amount} × ${bet.odds})`);
              } else if (overUnder === 'under' && totalScore < threshold) {
                won = true;
                payout = Math.round(bet.bet_amount * parseFloat(bet.odds));
                console.log(`[Betting] Over/Under bet WON - Bet ID: ${bet.id}`);
                console.log(`  Bet type: UNDER ${threshold}`);
                console.log(`  Actual total score: ${totalScore} points (Red: ${redScore}, Blue: ${blueScore})`);
                console.log(`  Bet threshold: ${threshold} points`);
                console.log(`  Won by: ${scoreDifference.toFixed(1)} points`);
                console.log(`  Payout: ${payout} ebucks (${bet.bet_amount} × ${bet.odds})`);
              } else {
                console.log(`[Betting] Over/Under bet LOST - Bet ID: ${bet.id}`);
                console.log(`  Bet type: ${overUnder.toUpperCase()} ${threshold}`);
                console.log(`  Actual total score: ${totalScore} points (Red: ${redScore}, Blue: ${blueScore})`);
                console.log(`  Bet threshold: ${threshold} points`);
                console.log(`  Missed by: ${Math.abs(scoreDifference).toFixed(1)} points`);
              }
            }
            break;

          case 'parlay':
            // For parlays, all bets in the parlay must win
            const parlayBets = bet.bet_details?.parlayBets || bet.bet_details?.parlay_bets || [];
            console.log(`[Betting] Resolving parlay bet ${bet.id}:`, {
              parlayBetsCount: parlayBets.length,
              betDetails: bet.bet_details,
              totalScore,
              margin,
              redWon
            });
            let allWon = true;
            
            for (const parlayBet of parlayBets) {
              let betWon = false;
              console.log(`[Betting] Checking parlay bet component:`, {
                type: parlayBet.type,
                details: parlayBet.details
              });
              
              if (parlayBet.type === 'winner') {
                const alliance = parlayBet.details?.alliance;
                betWon = (alliance === 'red' && redWon) || (alliance === 'blue' && !redWon);
                console.log(`  Winner bet: ${betWon ? 'WON' : 'LOST'} - Bet on ${alliance}, actual winner: ${winningAlliance}`);
              } else if (parlayBet.type === 'margin') {
                const marginBetAlliance = parlayBet.details?.alliance;
                const actualWinner = redScore > blueScore ? 'red' : 'blue';
                const signedMargin = redScore - blueScore;

                const lowerBound = parlayBet.details?.lowerBound;
                const upperBound = parlayBet.details?.upperBound;
                if (lowerBound != null || upperBound != null) {
                  const lo = lowerBound ?? -Infinity;
                  const hi = upperBound ?? Infinity;
                  betWon = marginBetAlliance === actualWinner && signedMargin >= lo && signedMargin <= hi;
                } else if (parlayBet.details?.marginRange && parlayBet.details?.expectedMarginAtBet) {
                  const range = BettingService.MARGIN_RANGES.find(r => r.rangeKey === parlayBet.details.marginRange);
                  if (range) {
                    const minMargin = parlayBet.details.expectedMarginAtBet * range.minMult;
                    const maxMargin = range.maxMult === null ? Infinity : parlayBet.details.expectedMarginAtBet * range.maxMult;
                    const allianceMargin = marginBetAlliance === 'red' ? signedMargin : -signedMargin;
                    betWon = marginBetAlliance === actualWinner && allianceMargin >= minMargin && (range.maxMult === null || allianceMargin < maxMargin);
                  }
                } else {
                  const marginThreshold = parlayBet.details?.margin;
                  betWon = marginThreshold !== undefined && marginBetAlliance === actualWinner && margin >= marginThreshold;
                }
                console.log(`  Margin bet: ${betWon ? 'WON' : 'LOST'} - Bet alliance: ${marginBetAlliance}, Actual winner: ${actualWinner}, Actual margin: ${margin}`);
              } else if (parlayBet.type === 'over_under') {
                const threshold = parlayBet.details?.threshold;
                const overUnder = parlayBet.details?.overUnder || parlayBet.details?.over_under; // Support both formats
                if (threshold !== undefined && overUnder) {
                  betWon = (overUnder === 'over' && totalScore > threshold) ||
                           (overUnder === 'under' && totalScore < threshold);
                  console.log(`  Over/Under bet: ${betWon ? 'WON' : 'LOST'} - Bet ${overUnder} ${threshold}, actual total: ${totalScore}`);
                } else {
                  console.log(`  Over/Under bet: LOST - Missing threshold or overUnder in details`);
                }
              }
              
              if (!betWon) {
                allWon = false;
                break;
              }
            }
            
            if (allWon) {
              console.log(`[Betting] Parlay bet WON - All ${parlayBets.length} components won`);
            } else {
              console.log(`[Betting] Parlay bet LOST - Not all components won`);
            }
            
            if (allWon) {
              won = true;
              payout = Math.round(bet.bet_amount * parseFloat(bet.odds));
            }
            break;
        }

        resolutions.push({
          id: bet.id,
          status: won ? 'won' : 'lost',
          payout,
          user_identifier: bet.user_identifier,
          match_number: bet.match_number ?? 0,
          is_demo_mode: bet.is_demo_mode ?? false,
        });
        console.log(`[Betting] Resolved bet ${bet.id}: ${won ? 'WON' : 'LOST'}, payout: ${payout}`);
      }

      // Batch resolve all bets in one RPC call (eliminates N+1)
      if (resolutions.length > 0) {
        const { error } = await supabase.rpc('resolve_bets_batch', {
          resolutions: resolutions.map(({ id, status, payout, user_identifier, is_demo_mode }) => ({
            id,
            status,
            payout,
            user_identifier,
            is_demo_mode: is_demo_mode ?? false,
          })),
        });
        if (error) {
          console.error('[Betting] Error batch resolving bets:', error);
        }
      }

      // Return resolutions for current user (for notification)
      if (userIdentifier) {
        return resolutions
          .filter((r) => r.user_identifier === userIdentifier)
          .map((r) => ({ matchNumber: r.match_number, won: r.status === 'won', payout: r.payout }));
      }
    } catch (error) {
      console.error('Error checking and resolving bets:', error);
    }
    return [];
  }
}

export const bettingService = new BettingService();
