// hooks/usePicklistData.ts - React Query hook for picklist screen data
import { useQuery } from '@tanstack/react-query';
import { getEventRankings } from '../api/services/events';
import { analyticsService, TeamAnalytics } from '../services/analyticsService';
import { db } from '../services/database';
import { Picklists, picklistService } from '../services/picklistService';
import { supabaseSyncService } from '../services/supabase.sync';
import { queryKeys } from '../config/queryKeys';

const STALE_TIME_MS = 10 * 1000; // 10 seconds

export interface RankedTeam {
  teamNumber: number;
  rank: number;
  analytics?: TeamAnalytics;
}

export interface PicklistData {
  allRankedTeams: RankedTeam[];
  rankedTeams: RankedTeam[];
  teamAnalytics: Map<number, TeamAnalytics>;
  picklists: Picklists;
}

async function fetchPicklistData(
  teamNumber: string,
  eventKey: string
): Promise<PicklistData> {
  const [rankings, picklists] = await Promise.all([
    getEventRankings(eventKey),
    picklistService.loadPicklists(teamNumber, eventKey),
  ]);

  if (!rankings || !Array.isArray(rankings)) {
    return {
      allRankedTeams: [],
      rankedTeams: [],
      teamAnalytics: new Map(),
      picklists,
    };
  }

  const localMatches = await db.getAllMatches();
  const teamMatches = await supabaseSyncService.getAllTeamMatches();
  const allMatches = [...localMatches, ...teamMatches];
  const analytics = analyticsService.calculateTeamAnalytics(allMatches);

  const ranked: RankedTeam[] = rankings
    .map((r) => {
      const match = r.team_key.match(/frc(\d+)/);
      if (!match) return null;
      const teamNum = parseInt(match[1], 10);
      return {
        teamNumber: teamNum,
        rank: r.rank,
        analytics: analytics.get(teamNum),
      } as RankedTeam;
    })
    .filter((team): team is RankedTeam => team !== null);

  const picklistTeamNumbers = new Set([
    ...picklists.firstPick,
    ...picklists.secondPick,
    ...picklists.doNotPick,
  ]);
  const availableTeams = ranked.filter(
    (team) => !picklistTeamNumbers.has(team.teamNumber)
  );

  return {
    allRankedTeams: ranked,
    rankedTeams: availableTeams,
    teamAnalytics: analytics,
    picklists,
  };
}

export function usePicklistData(
  teamNumber: string | null,
  eventKey: string | null
) {
  return useQuery<PicklistData, Error>({
    queryKey: queryKeys.picklists.byTeamAndEvent(
      teamNumber ?? '',
      eventKey ?? ''
    ),
    queryFn: () => fetchPicklistData(teamNumber!, eventKey!),
    enabled: !!teamNumber && !!eventKey,
    staleTime: STALE_TIME_MS,
  });
}
