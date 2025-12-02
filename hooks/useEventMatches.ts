// hooks/useEventMatches.ts - React Query hook for event matches
import { useQuery } from '@tanstack/react-query';
import { getEventMatches } from '../api/services/matches';
import { TBAMatch } from '../api/types';

/**
 * React Query hook to fetch matches for a given event
 * @param eventKey - The event key (e.g., "2025mndu") or null to disable query
 * @returns Query result with matches data, loading state, and error
 */
export function useEventMatches(eventKey: string | null) {
  return useQuery<TBAMatch[], Error>({
    queryKey: ['matches', eventKey],
    queryFn: () => {
      if (!eventKey) {
        throw new Error('Event key is required');
      }
      return getEventMatches(eventKey);
    },
    enabled: !!eventKey,
    staleTime: 1 * 60 * 1000, // 1 minute
  });
}

