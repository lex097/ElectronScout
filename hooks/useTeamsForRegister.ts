// hooks/useTeamsForRegister.ts - React Query hook for teams list (register page)
import { useQueries } from '@tanstack/react-query';
import { useMemo } from 'react';
import { getAllTeams } from '../api/services/teams';
import { TBATeam } from '../api/types';
import { queryKeys } from '../config/queryKeys';

const STALE_TIME_MS = 10 * 1000; // 10 seconds
const TOTAL_PAGES = 20; // Covers ~10,000 FRC teams (500 per page)

export function useTeamsForRegister() {
  const queries = useQueries({
    queries: Array.from({ length: TOTAL_PAGES }, (_, i) => ({
      queryKey: queryKeys.teams.list(i),
      queryFn: () => getAllTeams(i),
      staleTime: STALE_TIME_MS,
    })),
  });

  const allTeams = useMemo(() => {
    const teams: TBATeam[] = [];
    const seen = new Set<number>();
    for (const q of queries) {
      if (q.data) {
        for (const t of q.data) {
          if (!seen.has(t.team_number)) {
            seen.add(t.team_number);
            teams.push(t);
          }
        }
      }
    }
    return teams.sort((a, b) => a.team_number - b.team_number);
  }, [queries]);

  const isLoading = queries.some((q) => q.isLoading && !q.data);
  const isFetching = queries.some((q) => q.isFetching);
  const error = queries.find((q) => q.error)?.error ?? null;
  const refetch = () => queries.forEach((q) => q.refetch());

  return {
    allTeams,
    isLoading,
    isFetching,
    error,
    refetch,
    queries,
  };
}
