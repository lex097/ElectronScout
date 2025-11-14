// hooks/useEvents.ts - React Query hook for events
import { useQuery } from '@tanstack/react-query';
import { getEventsByYear } from '../api/services/events';
import { TBAEvent } from '../api/types';

/**
 * React Query hook to fetch events for a given year
 * @param year - The year to fetch events for (e.g., 2025)
 * @returns Query result with events data, loading state, and error
 */
export function useEvents(year: number) {
  return useQuery<TBAEvent[], Error>({
    queryKey: ['events', year],
    queryFn: () => getEventsByYear(year),
    staleTime: 10 * 60 * 1000, // 10 minutes
  });
}

