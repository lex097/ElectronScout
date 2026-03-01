// hooks/useLeaderboard.ts - React Query hook for ebucks leaderboard
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { queryKeys } from '@/config/queryKeys';

const STALE_TIME_MS = 10 * 1000; // 10 seconds

export interface LeaderboardEntry {
  scout_name: string;
  balance: number;
  rank: number;
}

async function fetchLeaderboard(
  teamNumber: string
): Promise<LeaderboardEntry[]> {
  const { data, error } = await supabase
    .from('user_ebucks_balance')
    .select('scout_name, balance')
    .eq('team_number', teamNumber)
    .order('balance', { ascending: false });

  if (error) {
    console.error('Error loading leaderboard:', error);
    return [];
  }

  return (data || []).map((entry, index) => ({
    scout_name: entry.scout_name || 'Unknown',
    balance: entry.balance || 0,
    rank: index + 1,
  }));
}

export function useLeaderboard(teamNumber: string | null) {
  return useQuery<LeaderboardEntry[], Error>({
    queryKey: queryKeys.bets.leaderboard(teamNumber ?? ''),
    queryFn: () => fetchLeaderboard(teamNumber!),
    enabled: !!teamNumber,
    staleTime: STALE_TIME_MS,
  });
}
