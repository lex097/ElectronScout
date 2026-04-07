// hooks/useAnalytics.ts - React Query hooks for analytics data
import { useQuery } from '@tanstack/react-query';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { analyticsService, TeamAnalytics } from '../services/analyticsService';
import { db } from '../services/database';
import { supabaseSyncService, CrossTeamMatch } from '../services/supabase.sync';
import { MatchData } from '../types/match';
import { queryKeys } from '../config/queryKeys';
import { DataVisibility } from '../stores/dataVisibilityStore';

const STALE_TIME_MS = 10 * 1000; // 10 seconds

export interface AnalyticsData {
  matches: MatchData[];
  teamAnalytics: Map<number, TeamAnalytics>;
}

export interface CrossTeamAnalyticsData {
  matches: CrossTeamMatch[];
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

async function fetchCrossTeamAnalytics(
  eventKey: string,
  visibility: 'teams_at_event' | 'all_teams'
): Promise<CrossTeamAnalyticsData> {
  let matches: CrossTeamMatch[];
  if (visibility === 'teams_at_event') {
    matches = await supabaseSyncService.getEventMatches(eventKey);
  } else {
    // 'all_teams': all matches for the event (same query, different scope label)
    matches = await supabaseSyncService.getEventMatches(eventKey);
  }
  const teamAnalytics =
    matches.length > 0
      ? analyticsService.calculateTeamAnalytics(matches)
      : new Map<number, TeamAnalytics>();
  return { matches, teamAnalytics };
}

async function fetchTeamLookup(
  teamNumber: number,
  eventKey: string | null,
  visibility: DataVisibility
): Promise<CrossTeamAnalyticsData> {
  let matches: CrossTeamMatch[];

  if (visibility === 'my_team') {
    // Only current team's data for this team_number
    const myTeamId = await AsyncStorage.getItem('team_id');
    const raw = await supabaseSyncService.getMatchesForTeamNumber(teamNumber, eventKey ?? undefined);
    matches = myTeamId ? raw.filter((m) => m.scoutingTeamNumber !== 0 || true).filter(
      (m) => {
        // We need team_id level filtering; scoutingTeamNumber is the FRC number of the scouting team.
        // Use the current team's team_number to filter.
        return true; // Will be filtered by myTeamNumber below
      }
    ) : raw;
    // Filter to only current team's scouting
    const myTeamNumber = await AsyncStorage.getItem('team_number');
    if (myTeamNumber) {
      const myNum = parseInt(myTeamNumber, 10);
      matches = matches.filter((m) => m.scoutingTeamNumber === myNum);
    }
  } else if (visibility === 'teams_at_event' && eventKey) {
    // All scouting data for this team from teams at the same event
    matches = await supabaseSyncService.getMatchesForTeamNumber(teamNumber, eventKey);
  } else {
    // 'all_teams': all data for this team number across all events
    matches = await supabaseSyncService.getMatchesForTeamNumber(teamNumber, eventKey ?? undefined);
  }

  const teamAnalytics =
    matches.length > 0
      ? analyticsService.calculateTeamAnalytics(matches)
      : new Map<number, TeamAnalytics>();
  return { matches, teamAnalytics };
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

export function useAnalyticsCrossTeam(
  eventKey: string | null,
  visibility: 'teams_at_event' | 'all_teams'
) {
  return useQuery<CrossTeamAnalyticsData, Error>({
    queryKey: queryKeys.analytics.crossTeam(eventKey ?? '', visibility),
    queryFn: () => fetchCrossTeamAnalytics(eventKey!, visibility),
    enabled: !!eventKey,
    staleTime: STALE_TIME_MS,
  });
}

export function useTeamLookup(
  teamNumber: number | null,
  eventKey: string | null,
  visibility: DataVisibility
) {
  return useQuery<CrossTeamAnalyticsData, Error>({
    queryKey: queryKeys.analytics.lookup(teamNumber ?? 0, eventKey, visibility),
    queryFn: () => fetchTeamLookup(teamNumber!, eventKey, visibility),
    enabled: teamNumber !== null && teamNumber > 0,
    staleTime: STALE_TIME_MS,
  });
}
