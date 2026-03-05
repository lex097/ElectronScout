// hooks/useLeaderboard.ts - React Query hook for ebucks leaderboard
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { queryKeys } from '@/config/queryKeys';
import { useDemoStore } from '@/stores/demoStore';

const STALE_TIME_MS = 10 * 1000; // 10 seconds

export interface LeaderboardEntry {
  scout_name: string;
  balance: number;
  balanceDemo: number;
  rank: number;
}

async function fetchLeaderboard(
  teamNumber: string
): Promise<LeaderboardEntry[]> {
  const { data, error } = await supabase
    .from('user_ebucks_balance')
    .select('scout_name, balance, balance_demo')
    .eq('team_number', teamNumber);

  if (error) {
    console.error('Error loading leaderboard:', error);
    return [];
  }

  // Sort by balance (real) - we'll re-sort client-side by mode
  const entries = (data || []).map((entry) => ({
    scout_name: entry.scout_name || 'Unknown',
    balance: entry.balance ?? 0,
    balanceDemo: entry.balance_demo ?? 0,
    rank: 0, // Set below
  }));

  return entries;
}

export function useLeaderboard(teamNumber: string | null) {
  const isDemoMode = useDemoStore((s) => s.isDemoMode);

  const query = useQuery<LeaderboardEntry[], Error>({
    queryKey: queryKeys.bets.leaderboard(teamNumber ?? ''),
    queryFn: () => fetchLeaderboard(teamNumber!),
    enabled: !!teamNumber,
    staleTime: STALE_TIME_MS,
  });

  // Sort by the appropriate balance for current mode and assign ranks
  const sortedData = query.data
    ? [...query.data]
        .sort((a, b) => {
          const balA = isDemoMode ? a.balanceDemo : a.balance;
          const balB = isDemoMode ? b.balanceDemo : b.balance;
          return balB - balA;
        })
        .map((entry, index) => ({ ...entry, rank: index + 1 }))
    : undefined;

  return { ...query, data: sortedData };
}
