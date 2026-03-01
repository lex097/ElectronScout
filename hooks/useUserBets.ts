// hooks/useUserBets.ts - React Query hook for user bets
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect } from 'react';
import { Bet, bettingService } from '../services/bettingService';
import { useAuthStore } from '../stores/authStore';
import { useBetNotificationStore } from '../stores/betNotificationStore';
import { useEbucksStore } from '../stores/ebucksStore';
import { queryKeys } from '../config/queryKeys';

const STALE_TIME_MS = 10 * 1000; // 10 seconds

async function fetchUserBets(): Promise<Bet[]> {
  return bettingService.getUserBets();
}

export function useUserBets() {
  const queryClient = useQueryClient();
  const teamNumber = useAuthStore((state) => state.user?.teamNumber);
  const refreshBalance = useEbucksStore((state) => state.refreshBalance);
  const showBetNotification = useBetNotificationStore(
    (state) => state.showNotification
  );

  const query = useQuery<Bet[], Error>({
    queryKey: queryKeys.bets.user(teamNumber ?? ''),
    queryFn: fetchUserBets,
    enabled: !!teamNumber,
    staleTime: STALE_TIME_MS,
  });

  // Resolve pending bets when we have data with pending, then invalidate
  useEffect(() => {
    const bets = query.data;
    if (!bets || bets.length === 0) return;

    const pendingBets = bets.filter((b) => b.status === 'pending');
    if (pendingBets.length === 0) return;

    let firstResolution: {
      matchNumber: number;
      won: boolean;
      payout: number;
    } | null = null;

    const resolve = async () => {
      for (const bet of pendingBets) {
        try {
          const resolutions = await bettingService.checkAndResolveBets(
            bet.matchKey
          );
          if (!firstResolution && resolutions?.[0]) {
            firstResolution = resolutions[0];
          }
        } catch (error) {
          console.error(`Error resolving bet ${bet.id}:`, error);
        }
      }
      if (firstResolution) {
        showBetNotification(firstResolution);
      }
      await refreshBalance();
      queryClient.invalidateQueries({ queryKey: queryKeys.bets.all });
    };

    resolve();
  }, [
    query.data,
    queryClient,
    refreshBalance,
    showBetNotification,
  ]);

  const refetch = useCallback(() => {
    queryClient.invalidateQueries({
      queryKey: queryKeys.bets.user(teamNumber ?? ''),
    });
  }, [queryClient, teamNumber]);

  return { ...query, refetch };
}
