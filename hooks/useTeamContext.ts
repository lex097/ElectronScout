// hooks/useTeamContext.ts - React Query hook for team context (admin)
import { useQuery } from '@tanstack/react-query';
import type { TeamContext } from '@/services/adminService';
import { queryKeys } from '@/config/queryKeys';

const STALE_TIME_MS = 500; // 0.5 seconds

async function fetchTeamContext(teamNumber: number): Promise<TeamContext> {
  const { adminService } = await import('@/services/adminService');
  return adminService.getTeamContext(teamNumber);
}

export function useTeamContext(teamNumber: number | null) {
  return useQuery<TeamContext, Error>({
    queryKey: queryKeys.teamContext(teamNumber ?? 0),
    queryFn: () => fetchTeamContext(teamNumber!),
    enabled: !!teamNumber && Number.isFinite(teamNumber),
    staleTime: STALE_TIME_MS,
  });
}
