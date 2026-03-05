// hooks/useScouterAssignments.ts - React Query hooks for scouter schedule
import { useQuery } from '@tanstack/react-query';
import {
  scouterScheduleService,
  ScouterAssignment,
} from '@/services/scouterScheduleService';
import { queryKeys } from '@/config/queryKeys';

const STALE_TIME_MS = 500; // 0.5 seconds

export function useScouterAssignments(
  teamId: string | null,
  eventKey: string | null
) {
  return useQuery<ScouterAssignment[], Error>({
    queryKey: queryKeys.scouterAssignments.byTeamAndEvent(
      teamId ?? '',
      eventKey ?? ''
    ),
    queryFn: () =>
      scouterScheduleService.getAssignments(teamId!, eventKey!),
    enabled: !!teamId && !!eventKey?.trim(),
    staleTime: STALE_TIME_MS,
  });
}

export function useTeamScouters(teamId: string | null) {
  return useQuery<string[], Error>({
    queryKey: queryKeys.scouterAssignments.teamScouters(teamId ?? ''),
    queryFn: () => scouterScheduleService.getTeamScouters(teamId!),
    enabled: !!teamId,
    staleTime: STALE_TIME_MS,
  });
}
