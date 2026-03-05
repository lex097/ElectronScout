// hooks/useAnalytics.ts - React Query hooks for analytics data
import { useQuery } from '@tanstack/react-query';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { analyticsService, TeamAnalytics } from '../services/analyticsService';
import { db } from '../services/database';
import { supabaseSyncService } from '../services/supabase.sync';
import { MatchData } from '../types/match';
import { queryKeys } from '../config/queryKeys';

const STALE_TIME_MS = 10 * 1000; // 10 seconds

export interface AnalyticsData {
  matches: MatchData[];
  teamAnalytics: Map<number, TeamAnalytics>;
}

async function fetchLocalAnalytics(): Promise<AnalyticsData> {
  const allMatches = await db.getAllMatches();
  const deletedIds = await supabaseSyncService.getDeletedMatchIds();
  const filteredMatches = allMatches.filter((m) => !deletedIds.has(m.id));
  const teamAnalytics =
    filteredMatches.length > 0
      ? analyticsService.calculateTeamAnalytics(filteredMatches)
      : new Map<number, TeamAnalytics>();
  return { matches: filteredMatches, teamAnalytics };
}

async function fetchTeamAnalytics(eventKey: string): Promise<AnalyticsData> {
  const supabaseMatches = await supabaseSyncService.getAllTeamMatches(eventKey);
  const matchesAsMatchData: MatchData[] = supabaseMatches.map((match: any) => ({
    id: match.id,
    matchNumber: match.matchNumber,
    teamNumber: match.teamNumber,
    scouterId: match.scouterId,
    gameYear: match.gameYear,
    metrics: match.metrics,
    timestamp: match.timestamp,
    synced: match.synced,
    notes: match.notes,
    survey: match.survey,
    allianceColor: match.allianceColor ?? match.alliance,
  }));
  const teamAnalytics =
    matchesAsMatchData.length > 0
      ? analyticsService.calculateTeamAnalytics(matchesAsMatchData)
      : new Map<number, TeamAnalytics>();
  return { matches: matchesAsMatchData, teamAnalytics };
}

export function useAnalyticsLocal() {
  return useQuery<AnalyticsData, Error>({
    queryKey: queryKeys.analytics.local(),
    queryFn: fetchLocalAnalytics,
    staleTime: STALE_TIME_MS,
  });
}

export function useAnalyticsTeam(eventKey: string | null) {
  return useQuery<AnalyticsData, Error>({
    queryKey: queryKeys.analytics.team(eventKey ?? ''),
    queryFn: () => fetchTeamAnalytics(eventKey!),
    enabled: !!eventKey,
    staleTime: STALE_TIME_MS,
  });
}
