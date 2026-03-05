// hooks/useEventMatches.ts - React Query hook for event matches
import { useQuery } from '@tanstack/react-query';
import { TBAMatch } from '../api/types';
import { queryKeys } from '../config/queryKeys';
import { matchesCacheService } from '../services/matchesCacheService';

/**
 * React Query hook to fetch matches for a given event
 * Persists to AsyncStorage; new event overwrites previous. Hydrated on app init.
 * @param eventKey - The event key (e.g., "2025mndu") or null to disable query
 * @param options - Optional overrides (e.g. staleTime)
 * @returns Query result with matches data, loading state, and error
 */
export function useEventMatches(
  eventKey: string | null,
  options?: { staleTime?: number }
) {
  return useQuery<TBAMatch[], Error>({
    queryKey: queryKeys.matches.byEvent(eventKey ?? ''),
    queryFn: () => {
      if (!eventKey) {
        throw new Error('Event key is required');
      }
      return matchesCacheService.fetchAndCache(eventKey);
    },
    enabled: !!eventKey,
    staleTime: options?.staleTime ?? 1 * 60 * 1000, // default 1 minute
  });
}

