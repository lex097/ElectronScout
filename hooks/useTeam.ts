// hooks/useTeam.ts - React Query hook for team info
import { useQuery } from '@tanstack/react-query';
import { getTeam } from '../api/services/teams';
import { TBATeam } from '../api/types';

/**
 * React Query hook to fetch team information
 * @param teamKey - The team key (e.g., "frc254") or null to disable query
 * @returns Query result with team data, loading state, and error
 */
export function useTeam(teamKey: string | null) {
  return useQuery<TBATeam, Error>({
    queryKey: ['team', teamKey],
    queryFn: () => {
      if (!teamKey) {
        throw new Error('Team key is required');
      }
      return getTeam(teamKey);
    },
    enabled: !!teamKey,
    staleTime: 10 * 60 * 1000, // 10 minutes max
  });
}

