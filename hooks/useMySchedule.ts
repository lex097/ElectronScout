// hooks/useMySchedule.ts - React Query hook for scouter's assigned matches
import { useQuery } from '@tanstack/react-query';
import { adminService } from '@/services/adminService';
import { scouterScheduleService } from '@/services/scouterScheduleService';
import { supabaseSyncService } from '@/services/supabase.sync';
import { db } from '@/services/database';
import { queryKeys } from '@/config/queryKeys';

const STALE_TIME_MS = 10_000; // 10 seconds

export type AssignmentRow = {
  match_key: string;
  match_number: number;
  team_number: number;
  alliance: 'red' | 'blue';
  scouter_name: string;
};

export type MyScheduleData = {
  assignments: AssignmentRow[];
  scoutedSet: Set<string>;
};

async function fetchMySchedule(
  teamNumber: number,
  eventKey: string,
  scoutName: string
): Promise<MyScheduleData> {
  await db.init();
  const ctx = await adminService.getTeamContext(teamNumber);
  const data = await scouterScheduleService.getAssignmentsForScouter(
    ctx.teamId,
    eventKey,
    scoutName
  );

  const remoteMatches = await supabaseSyncService.getMatches(eventKey);

  const scouted = new Set<string>();
  for (const a of data) {
    const inLocal = await db.checkMatchScoutedByScouter(
      a.match_number,
      a.team_number,
      scoutName
    );
    const inRemote =
      remoteMatches?.some(
        (m: { match_number?: number; team_number?: number; scout_name?: string }) =>
          m.match_number === a.match_number &&
          m.team_number === a.team_number &&
          (m.scout_name || '').trim() === (scoutName || '').trim()
      ) ?? false;
    if (inLocal || inRemote) {
      scouted.add(`${a.match_number}:${a.team_number}`);
    }
  }

  return { assignments: data, scoutedSet: scouted };
}

export function useMySchedule(
  teamNumber: number | null,
  eventKey: string | null,
  scoutName: string | null
) {
  return useQuery<MyScheduleData, Error>({
    queryKey: queryKeys.scouterAssignments.forScouter(
      String(teamNumber ?? ''),
      eventKey ?? '',
      scoutName ?? ''
    ),
    queryFn: () => fetchMySchedule(teamNumber!, eventKey!, scoutName!),
    enabled:
      !!teamNumber &&
      Number.isFinite(teamNumber) &&
      !!eventKey?.trim() &&
      !!scoutName?.trim(),
    staleTime: STALE_TIME_MS,
  });
}
