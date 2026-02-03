// services/bettingService.ts
import AsyncStorage from '@react-native-async-storage/async-storage';
import tbaClient from '../api/client';
import { TBAMatch } from '../api/types';
import { supabaseSyncService } from './supabase.sync';
import { LeagueAverage, teamStatisticsService } from './teamStatisticsService';

export interface BetData {
  matchKey: string;
  matchNumber: number;
  eventKey: string;
  betType: 'winner' | 'margin' | 'over_under' | 'parlay';
  betDetails: {
    alliance?: 'red' | 'blue';
    margin?: number;
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
}

export interface AllianceData {
  teams: number[];
  average: number;
  confidence: number;
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
}

class BettingService {
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
   * Calculate alliance averages and confidence
   */
  async calculateAllianceAverages(
    teams: number[],
    eventKey: string
  ): Promise<AllianceData> {
    try {
      if (teams.length === 0) {
        return { teams: [], average: 0, confidence: 0.0 };
      }

      // Get statistics for all teams in alliance
      const teamStats = await teamStatisticsService.getTeamStatisticsBatch(teams, eventKey);
      
      let totalAverage = 0;
      let totalConfidence = 0;
      let validTeams = 0;

      teams.forEach(teamNumber => {
        const stats = teamStats.get(teamNumber);
        if (stats) {
          totalAverage += stats.avgMatchScore;
          totalConfidence += Math.min(1.0, stats.matchCount * 0.2);
          validTeams++;
        }
      });

      const average = validTeams > 0 ? totalAverage / validTeams : 0;
      const confidence = validTeams > 0 ? totalConfidence / validTeams : 0.0;

      return {
        teams,
        average,
        confidence,
      };
    } catch (error) {
      console.error('Error calculating alliance averages:', error);
      return { teams, average: 0, confidence: 0.0 };
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
      const scoreDifference = redAvg - blueAvg;
      // Use logistic function to convert score difference to probability
      redWinProbData = 1 / (1 + Math.exp(-scoreDifference / 10));
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
    const finalRedWinProb = (0.5 * (1 - matchConf)) + (redWinProbData * matchConf);
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

  /**
   * Calculate margin bet odds
   */
  calculateMarginOdds(
    expectedMargin: number,
    marginThreshold: number,
    matchConf: number
  ): number {
    let dataProb = 0.5;

    if (expectedMargin >= marginThreshold) {
      // More likely to win if expected margin is well above threshold
      dataProb = 0.5 + Math.min(0.3, (expectedMargin - marginThreshold) / 20);
    } else {
      // Less likely to win if expected margin is below threshold
      dataProb = 0.5 - Math.min(0.3, (marginThreshold - expectedMargin) / 20);
    }

    // Clamp to [0.2, 0.8]
    dataProb = Math.max(0.2, Math.min(0.8, dataProb));

    // Blend with neutral (50/50) based on match confidence
    const finalProb = (0.5 * (1 - matchConf)) + (dataProb * matchConf);
    const clampedProb = Math.max(0.1, Math.min(0.9, finalProb));

    // Calculate odds
    let odds = 1 / clampedProb;
    odds = Math.round(odds * 100) / 100;
    
    // Ensure minimum odds of 1.1 and maximum of 20.0
    return Math.max(1.1, Math.min(20.0, odds));
  }

  /**
   * Calculate over/under odds
   */
  calculateOverUnderOdds(
    expectedTotal: number,
    threshold: number,
    matchConf: number,
    leagueAvg?: LeagueAverage
  ): number {
    let dataProb = 0.5;

    if (expectedTotal > 0) {
      if (expectedTotal > threshold) {
        dataProb = 0.5 + Math.min(0.3, (expectedTotal - threshold) / 30);
      } else {
        dataProb = 0.5 - Math.min(0.3, (threshold - expectedTotal) / 30);
      }
      dataProb = Math.max(0.2, Math.min(0.8, dataProb));
    }

    // Blend with neutral (50/50) based on match confidence
    const finalProb = (0.5 * (1 - matchConf)) + (dataProb * matchConf);
    const clampedProb = Math.max(0.1, Math.min(0.9, finalProb));

    // Calculate odds
    let odds = 1 / clampedProb;
    odds = Math.round(odds * 100) / 100;
    
    // Ensure minimum odds of 1.1 and maximum of 10.0
    return Math.max(1.1, Math.min(10.0, odds));
  }

  /**
   * Calculate all match odds
   */
  async calculateMatchOdds(
    redTeams: number[],
    blueTeams: number[],
    eventKey: string
  ): Promise<MatchOdds> {
    // Get alliance data
    const redAlliance = await this.calculateAllianceAverages(redTeams, eventKey);
    const blueAlliance = await this.calculateAllianceAverages(blueTeams, eventKey);

    // Calculate match confidence
    const matchConf = this.calculateMatchConfidence(redAlliance.confidence, blueAlliance.confidence);

    // Calculate winner odds
    const winnerOdds = this.calculateWinnerOdds(
      redAlliance.average,
      blueAlliance.average,
      redAlliance.confidence,
      blueAlliance.confidence,
      matchConf
    );

    // Calculate expected margin and total
    const expectedMargin = Math.abs(redAlliance.average - blueAlliance.average);
    const expectedTotal = redAlliance.average + blueAlliance.average;

    // Get league average if threshold is met
    const leagueAverage = await this.getLeagueAverage(eventKey);

    return {
      redWinProbability: winnerOdds.redWinProb,
      blueWinProbability: winnerOdds.blueWinProb,
      redOdds: winnerOdds.redOdds,
      blueOdds: winnerOdds.blueOdds,
      expectedMargin,
      expectedTotal,
      matchConfidence: matchConf,
      leagueAverage: leagueAverage || undefined,
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
   * Place a bet
   */
  async placeBet(betData: BetData): Promise<string | null> {
    try {
      const userIdentifier = await this.getUserIdentifier();
      if (!userIdentifier) {
        throw new Error('No user identifier');
      }

      const supabase = supabaseSyncService.getClient();

      // Insert bet
      const { data, error } = await supabase
        .from('bets')
        .insert({
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
      const supabase = supabaseSyncService.getClient();

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

      const supabase = supabaseSyncService.getClient();
      
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
      const supabase = supabaseSyncService.getClient();
      
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
      }));
    } catch (error) {
      console.error('Error fetching match bets:', error);
      return [];
    }
  }

  /**
   * Check and resolve bets for a match
   */
  async checkAndResolveBets(matchKey: string): Promise<void> {
    try {
      console.log(`[Betting] Checking bets for match: ${matchKey}`);
      
      // Get match result from TBA
      const matchResult = await this.getMatchResult(matchKey);
      
      if (!matchResult) {
        console.log(`[Betting] No match data found for: ${matchKey}`);
        return; // Match not found
      }
      
      // Check if match has been played - winning_alliance must be 'red' or 'blue'
      const winningAlliance = matchResult.winning_alliance;
      if (!winningAlliance || (winningAlliance !== 'red' && winningAlliance !== 'blue')) {
        console.log(`[Betting] Match ${matchKey} not completed yet. winning_alliance: ${winningAlliance}`);
        return; // Match not completed yet
      }
      
      // Verify we have actual score data, not just a winning alliance
      const scoreBreakdown = matchResult.score_breakdown;
      if (!scoreBreakdown || !scoreBreakdown.red || !scoreBreakdown.blue) {
        console.log(`[Betting] Match ${matchKey} missing score breakdown. Cannot resolve bets.`);
        return; // No score breakdown means match likely not completed
      }

      // Get all pending bets for this match
      const supabase = supabaseSyncService.getClient();
      const { data: bets, error } = await supabase
        .from('bets')
        .select('*')
        .eq('match_key', matchKey)
        .eq('status', 'pending');

      if (error || !bets) {
        console.error('Error fetching bets for resolution:', error);
        return;
      }
      
      if (bets.length === 0) {
        console.log(`[Betting] No pending bets for match: ${matchKey}`);
        return;
      }

      // Get match scores - use score or totalPoints depending on TBA response format
      const redScore = scoreBreakdown.red.totalPoints ?? scoreBreakdown.red.score ?? matchResult.alliances.red.score ?? 0;
      const blueScore = scoreBreakdown.blue.totalPoints ?? scoreBreakdown.blue.score ?? matchResult.alliances.blue.score ?? 0;
      const totalScore = redScore + blueScore;
      const margin = Math.abs(redScore - blueScore);
      const redWon = winningAlliance === 'red';
      
      console.log(`[Betting] Match ${matchKey} results: Red ${redScore} - Blue ${blueScore}, Winner: ${winningAlliance}`);

      // Resolve each bet
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

          case 'margin':
            const betMargin = bet.bet_details?.margin;
            if (betMargin !== undefined) {
              const marginDifference = margin - betMargin;
              if (margin >= betMargin) {
                won = true;
                payout = Math.round(bet.bet_amount * parseFloat(bet.odds));
                console.log(`[Betting] Margin bet WON - Bet ID: ${bet.id}`);
                console.log(`  Actual margin: ${margin} points (Red: ${redScore}, Blue: ${blueScore})`);
                console.log(`  Bet threshold: ${betMargin} points`);
                console.log(`  Won by: ${marginDifference.toFixed(1)} points`);
                console.log(`  Payout: ${payout} ebucks (${bet.bet_amount} × ${bet.odds})`);
              } else {
                console.log(`[Betting] Margin bet LOST - Bet ID: ${bet.id}`);
                console.log(`  Actual margin: ${margin} points (Red: ${redScore}, Blue: ${blueScore})`);
                console.log(`  Bet threshold: ${betMargin} points`);
                console.log(`  Missed by: ${Math.abs(marginDifference).toFixed(1)} points`);
              }
            }
            break;

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
                const marginThreshold = parlayBet.details?.margin;
                betWon = marginThreshold !== undefined && margin >= marginThreshold;
                if (marginThreshold !== undefined) {
                  console.log(`  Margin bet: ${betWon ? 'WON' : 'LOST'} - Actual margin: ${margin}, threshold: ${marginThreshold}`);
                } else {
                  console.log(`  Margin bet: LOST - No margin threshold in details`);
                }
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

        // Resolve the bet
        console.log(`[Betting] Resolving bet ${bet.id}: ${won ? 'WON' : 'LOST'}, payout: ${payout}`);
        await this.resolveBet(bet.id, won, payout);
      }
    } catch (error) {
      console.error('Error checking and resolving bets:', error);
    }
  }
}

export const bettingService = new BettingService();
