// app/(tabs)/betting-history.tsx
import { Ionicons } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import {
    Animated,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Bet } from '../../services/bettingService';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '../../stores/authStore';
import { useEbucksStore } from '../../stores/ebucksStore';
import { useUserBets } from '../../hooks/useUserBets';
import { useLeaderboard } from '../../hooks/useLeaderboard';
import { queryKeys } from '../../config/queryKeys';

export default function BettingHistoryScreen() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<'history' | 'leaderboard'>('history');
  const [filter, setFilter] = useState<'all' | 'pending' | 'won' | 'lost'>('all');
  const user = useAuthStore((state) => state.user);
  const balance = useEbucksStore((state) => state.balance);
  const refreshBalance = useEbucksStore((state) => state.refreshBalance);
  const subscriptionRef = useRef<any>(null);
  const prevBalanceRef = useRef<number>(balance);

  const betsQuery = useUserBets();
  const leaderboardQuery = useLeaderboard(user?.teamNumber ?? null);
  const bets = betsQuery.data ?? [];
  const leaderboard = leaderboardQuery.data ?? [];

  // Set up real-time subscription for leaderboard updates
  useEffect(() => {
    if (activeTab !== 'leaderboard' || !user?.teamNumber) return;
    const channelName = `leaderboard:${user.teamNumber}`;
    const onLeaderboardChange = () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.bets.leaderboard(user.teamNumber),
      });
    };
    const channel = supabase
      .channel(channelName)
      .on('broadcast', { event: 'INSERT' }, onLeaderboardChange)
      .on('broadcast', { event: 'UPDATE' }, onLeaderboardChange)
      .on('broadcast', { event: 'DELETE' }, onLeaderboardChange)
      .subscribe();
    subscriptionRef.current = channel;
    return () => {
      if (subscriptionRef.current) {
        supabase.removeChannel(subscriptionRef.current);
        subscriptionRef.current = null;
      }
    };
  }, [activeTab, user?.teamNumber, queryClient]);

  // Invalidate leaderboard when balance changes (user may have won/lost a bet)
  useEffect(() => {
    if (activeTab === 'leaderboard' && prevBalanceRef.current !== balance) {
      prevBalanceRef.current = balance;
      const timeoutId = setTimeout(() => {
        if (user?.teamNumber) {
          queryClient.invalidateQueries({
            queryKey: queryKeys.bets.leaderboard(user.teamNumber),
          });
        }
        refreshBalance();
      }, 500);
      return () => clearTimeout(timeoutId);
    }
    prevBalanceRef.current = balance;
  }, [balance, activeTab, user?.teamNumber, queryClient, refreshBalance]);

  const filteredBets = bets.filter(bet => {
    if (filter === 'all') return true;
    return bet.status === filter;
  });

  const getBetTypeLabel = (betType: string): string => {
    const labels: Record<string, string> = {
      winner: 'Winner',
      margin: 'Margin',
      over_under: 'Over/Under',
      parlay: 'Parlay',
    };
    return labels[betType] || betType;
  };

  const formatBetType = (type: string): string => {
    const typeMap: Record<string, string> = {
      winner: 'Winner',
      margin: 'Margin',
      over_under: 'Over/Under',
    };
    return typeMap[type] || type;
  };

  const getParlayBetDescription = (parlayBet: { type: string; details: any; odds: number }): string => {
    switch (parlayBet.type) {
      case 'winner':
        return `${parlayBet.details?.alliance === 'red' ? 'Red' : 'Blue'} wins`;
      case 'margin':
        const alliance = parlayBet.details?.alliance === 'red' ? 'Red' : 'Blue';
        return `${alliance} wins by ${parlayBet.details?.margin}+ points`;
      case 'over_under':
        const overUnder = parlayBet.details?.overUnder || parlayBet.details?.over_under;
        return `Total ${overUnder === 'over' ? 'Over' : 'Under'} ${parlayBet.details?.threshold}`;
      default:
        return `${formatBetType(parlayBet.type)} bet`;
    }
  };

  const getBetDescription = (bet: Bet): string => {
    switch (bet.betType) {
      case 'winner':
        return `Bet on ${bet.betDetails?.alliance === 'red' ? 'Red' : 'Blue'} to win`;
      case 'margin':
        const alliance = bet.betDetails?.alliance === 'red' ? 'Red' : 'Blue';
        return `${alliance} wins by ${bet.betDetails?.margin}+ points`;
      case 'over_under':
        return `Total ${bet.betDetails?.overUnder === 'over' ? 'Over' : 'Under'} ${bet.betDetails?.threshold}`;
      case 'parlay':
        const parlayBets = bet.betDetails?.parlayBets || bet.betDetails?.parlay_bets || [];
        if (parlayBets.length === 0) {
          return 'Parlay (no bets)';
        }
        return parlayBets.map((pb: any) => getParlayBetDescription(pb)).join(' • ');
      default:
        return 'Unknown bet';
    }
  };

  const getStatusColor = (status: string): string => {
    switch (status) {
      case 'won':
        return '#10b981';
      case 'lost':
        return '#ef4444';
      case 'pending':
        return '#f59e0b';
      default:
        return '#6b7280';
    }
  };

  const formatDate = (dateString: string): string => {
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
      return dateString;
    }
  };

  // Skeleton loader component (pulsing opacity)
  const SkeletonBox = ({ width, height, style }: { width?: number | string; height: number; style?: object }) => {
    const opacity = useRef(new Animated.Value(0.35)).current;
    useEffect(() => {
      const animation = Animated.loop(
        Animated.sequence([
          Animated.timing(opacity, {
            toValue: 0.7,
            duration: 800,
            useNativeDriver: true,
          }),
          Animated.timing(opacity, {
            toValue: 0.35,
            duration: 800,
            useNativeDriver: true,
          }),
        ])
      );
      animation.start();
      return () => animation.stop();
    }, [opacity]);
    return (
      <Animated.View
        style={[
          {
            width: width ?? '100%',
            height,
            backgroundColor: '#3a3a3a',
            borderRadius: 6,
            opacity,
          },
          style,
        ]}
      />
    );
  };

  const renderHistorySkeleton = () => (
    <>
      <View style={styles.filters}>
        {([1, 2, 3, 4] as const).map((i) => (
          <View key={i} style={styles.filterTab}>
            <SkeletonBox width={56} height={14} style={{ alignSelf: 'center', borderRadius: 4 }} />
          </View>
        ))}
      </View>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        {[1, 2, 3, 4, 5].map((i) => (
          <View key={i} style={styles.betCard}>
            <View style={styles.betHeader}>
              <View style={styles.betHeaderLeft}>
                <SkeletonBox width={72} height={18} style={{ borderRadius: 4 }} />
                <SkeletonBox width={52} height={20} style={{ borderRadius: 6 }} />
              </View>
              <SkeletonBox width={40} height={16} style={{ borderRadius: 4 }} />
            </View>
            <SkeletonBox width="90%" height={14} style={{ marginBottom: 4, borderRadius: 4 }} />
            <SkeletonBox width={80} height={12} style={{ marginBottom: 12, borderRadius: 4 }} />
            <View style={styles.betDetails}>
              <View style={styles.betDetailRow}>
                <SkeletonBox width={80} height={14} style={{ borderRadius: 4 }} />
                <SkeletonBox width={70} height={14} style={{ borderRadius: 4 }} />
              </View>
              <View style={styles.betDetailRow}>
                <SkeletonBox width={100} height={14} style={{ borderRadius: 4 }} />
                <SkeletonBox width={60} height={14} style={{ borderRadius: 4 }} />
              </View>
            </View>
            <SkeletonBox width={160} height={12} style={{ marginTop: 8, borderRadius: 4 }} />
          </View>
        ))}
      </ScrollView>
    </>
  );

  const renderLeaderboardSkeleton = () => (
    <ScrollView
      style={styles.scrollView}
      contentContainerStyle={styles.scrollContent}
    >
      {[1, 2, 3, 4, 5, 6, 7].map((i) => (
        <View key={i} style={styles.leaderboardCard}>
          <View style={styles.leaderboardRank}>
            <SkeletonBox width={28} height={28} style={{ borderRadius: 14 }} />
          </View>
          <View style={styles.leaderboardInfo}>
            <SkeletonBox width={120} height={16} style={{ borderRadius: 4 }} />
          </View>
          <View style={styles.leaderboardBalance}>
            <SkeletonBox width={90} height={18} style={{ borderRadius: 4 }} />
          </View>
        </View>
      ))}
    </ScrollView>
  );

  return (
    <SafeAreaView style={styles.container} edges={[]}>
      {/* Main Tabs - History and Leaderboard */}
      <View style={styles.mainTabs}>
        <TouchableOpacity
          style={[styles.mainTab, activeTab === 'history' && styles.mainTabActive]}
          onPress={() => setActiveTab('history')}
        >
          <Text
            style={[
              styles.mainTabText,
              activeTab === 'history' && styles.mainTabTextActive,
            ]}
          >
            History
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.mainTab, activeTab === 'leaderboard' && styles.mainTabActive]}
          onPress={() => setActiveTab('leaderboard')}
        >
          <Text
            style={[
              styles.mainTabText,
              activeTab === 'leaderboard' && styles.mainTabTextActive,
            ]}
          >
            Leaderboard
          </Text>
        </TouchableOpacity>
      </View>

      {activeTab === 'history' ? (
        betsQuery.isLoading ? (
          renderHistorySkeleton()
        ) : (
        <>
          {/* Filter Tabs */}
          <View style={styles.filters}>
        {(['all', 'pending', 'won', 'lost'] as const).map((filterOption) => (
          <TouchableOpacity
            key={filterOption}
            style={[styles.filterTab, filter === filterOption && styles.filterTabActive]}
            onPress={() => setFilter(filterOption)}
          >
            <Text
              style={[
                styles.filterTabText,
                filter === filterOption && styles.filterTabTextActive,
              ]}
            >
              {filterOption.charAt(0).toUpperCase() + filterOption.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Bets List */}
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={betsQuery.isFetching}
            onRefresh={() => betsQuery.refetch()}
          />
        }
      >
        {filteredBets.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Ionicons name="trophy-outline" size={64} color="#6b7280" />
            <Text style={styles.emptyText}>No bets found</Text>
            <Text style={styles.emptySubtext}>
              {filter === 'all'
                ? 'Start placing bets to see them here'
                : `No ${filter} bets`}
            </Text>
          </View>
        ) : (
          filteredBets.map((bet) => (
            <View key={bet.id} style={styles.betCard}>
              <View style={styles.betHeader}>
                <View style={styles.betHeaderLeft}>
                  <Text style={styles.betType}>{getBetTypeLabel(bet.betType)}</Text>
                  <View
                    style={[styles.statusBadge, { backgroundColor: getStatusColor(bet.status) }]}
                  >
                    <Text style={styles.statusText}>{bet.status.toUpperCase()}</Text>
                  </View>
                </View>
                <Text style={styles.betOdds}>{bet.odds.toFixed(2)}x</Text>
              </View>

              {bet.betType === 'parlay' ? (
                <View style={styles.parlayContainer}>
                  <Text style={styles.parlayTitle}>Parlay Bets:</Text>
                  {(bet.betDetails?.parlayBets || bet.betDetails?.parlay_bets || []).map((parlayBet: any, index: number) => (
                    <View key={index} style={styles.parlayBetItem}>
                      <Text style={styles.parlayBetBullet}>•</Text>
                      <Text style={styles.parlayBetText}>
                        <Text style={styles.parlayBetTypeLabel}>{formatBetType(parlayBet.type)}: </Text>
                        {getParlayBetDescription(parlayBet)}
                      </Text>
                    </View>
                  ))}
                </View>
              ) : (
                <Text style={styles.betDescription}>{getBetDescription(bet)}</Text>
              )}
              <Text style={styles.betMatch}>Match {bet.matchNumber}</Text>

              <View style={styles.betDetails}>
                <View style={styles.betDetailRow}>
                  <Text style={styles.betDetailLabel}>Bet Amount:</Text>
                  <Text style={styles.betDetailValue}>{bet.betAmount} ebucks</Text>
                </View>
                {bet.status === 'won' && bet.payout > 0 && (
                  <View style={styles.betDetailRow}>
                    <Text style={styles.betDetailLabel}>Payout:</Text>
                    <Text style={[styles.betDetailValue, styles.payoutValue]}>
                      +{bet.payout} ebucks
                    </Text>
                  </View>
                )}
                {bet.status === 'pending' && (
                  <View style={styles.betDetailRow}>
                    <Text style={styles.betDetailLabel}>Potential Payout:</Text>
                    <Text style={styles.betDetailValue}>
                      {bet.potentialPayout} ebucks
                    </Text>
                  </View>
                )}
              </View>

              <Text style={styles.betDate}>Placed: {formatDate(bet.createdAt)}</Text>
              {bet.resolvedAt && (
                <Text style={styles.betDate}>Resolved: {formatDate(bet.resolvedAt)}</Text>
              )}
            </View>
          ))
        )}
      </ScrollView>
        </>
        )
      ) : (
        leaderboardQuery.isLoading ? (
          renderLeaderboardSkeleton()
        ) : (
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          refreshControl={
            <RefreshControl
              refreshing={leaderboardQuery.isFetching}
              onRefresh={() => {
                queryClient.invalidateQueries({
                  queryKey: queryKeys.bets.leaderboard(user?.teamNumber ?? ''),
                });
                refreshBalance();
              }}
            />
          }
        >
          {leaderboard.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Ionicons name="trophy-outline" size={64} color="#6b7280" />
              <Text style={styles.emptyText}>No leaderboard data</Text>
              <Text style={styles.emptySubtext}>
                Be the first to earn ebucks!
              </Text>
            </View>
          ) : (
            leaderboard.map((entry, index) => {
              const isCurrentUser = entry.scout_name === user?.name;
              return (
                <View
                  key={index}
                  style={[
                    styles.leaderboardCard,
                    isCurrentUser && styles.leaderboardCardCurrent,
                  ]}
                >
                  <View style={styles.leaderboardRank}>
                    {entry.rank === 1 && (
                      <Ionicons name="trophy" size={24} color="#ffd700" />
                    )}
                    {entry.rank === 2 && (
                      <Ionicons name="trophy" size={24} color="#c0c0c0" />
                    )}
                    {entry.rank === 3 && (
                      <Ionicons name="trophy" size={24} color="#cd7f32" />
                    )}
                    {entry.rank > 3 && (
                      <Text style={styles.rankNumber}>{entry.rank}</Text>
                    )}
                  </View>
                  <View style={styles.leaderboardInfo}>
                    <Text
                      style={[
                        styles.leaderboardName,
                        isCurrentUser && styles.leaderboardNameCurrent,
                      ]}
                    >
                      {entry.scout_name}
                      {isCurrentUser && ' (You)'}
                    </Text>
                  </View>
                  <View style={styles.leaderboardBalance}>
                    <Text
                      style={[
                        styles.leaderboardBalanceText,
                        isCurrentUser && styles.leaderboardBalanceTextCurrent,
                      ]}
                    >
                      {entry.balance.toLocaleString()} ebucks
                    </Text>
                  </View>
                </View>
              );
            })
          )}
        </ScrollView>
        )
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a1a',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#b0b0b0',
  },
  mainTabs: {
    flexDirection: 'row',
    backgroundColor: '#2a2a2a',
    borderBottomWidth: 1,
    borderBottomColor: '#404040',
  },
  mainTab: {
    flex: 1,
    paddingVertical: 16,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  mainTabActive: {
    borderBottomColor: '#ff6600',
  },
  mainTabText: {
    color: '#b0b0b0',
    fontSize: 16,
    fontWeight: '500',
  },
  mainTabTextActive: {
    color: '#ff6600',
    fontWeight: '600',
  },
  filters: {
    flexDirection: 'row',
    backgroundColor: '#2a2a2a',
    paddingHorizontal: 8,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#404040',
  },
  filterTab: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 6,
  },
  filterTabActive: {
    backgroundColor: '#1a1a1a',
  },
  filterTabText: {
    color: '#b0b0b0',
    fontSize: 14,
    fontWeight: '500',
  },
  filterTabTextActive: {
    color: '#ff6600',
    fontWeight: '600',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 64,
  },
  emptyText: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
    marginTop: 16,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#b0b0b0',
    marginTop: 8,
  },
  betCard: {
    backgroundColor: '#2a2a2a',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  betHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  betHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  betType: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  statusText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '600',
  },
  betOdds: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#ff6600',
  },
  betDescription: {
    fontSize: 14,
    color: '#b0b0b0',
    marginBottom: 4,
  },
  betMatch: {
    fontSize: 12,
    color: '#6b7280',
    marginBottom: 12,
  },
  betDetails: {
    marginTop: 8,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#404040',
  },
  betDetailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  betDetailLabel: {
    fontSize: 14,
    color: '#b0b0b0',
  },
  betDetailValue: {
    fontSize: 14,
    color: '#fff',
    fontWeight: '600',
  },
  payoutValue: {
    color: '#10b981',
  },
  betDate: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: 8,
  },
  parlayContainer: {
    marginBottom: 4,
  },
  parlayTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 8,
  },
  parlayBetItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 4,
  },
  parlayBetBullet: {
    fontSize: 14,
    color: '#ff6600',
    marginRight: 8,
    marginTop: 2,
  },
  parlayBetText: {
    fontSize: 14,
    color: '#b0b0b0',
    flex: 1,
  },
  parlayBetTypeLabel: {
    fontWeight: '600',
    color: '#fff',
  },
  leaderboardCard: {
    backgroundColor: '#2a2a2a',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
  },
  leaderboardCardCurrent: {
    backgroundColor: '#3a2a1a',
    borderWidth: 2,
    borderColor: '#ff6600',
  },
  leaderboardRank: {
    width: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rankNumber: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#6b7280',
  },
  leaderboardInfo: {
    flex: 1,
    marginLeft: 12,
  },
  leaderboardName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  leaderboardNameCurrent: {
    color: '#ff6600',
  },
  leaderboardBalance: {
    alignItems: 'flex-end',
  },
  leaderboardBalanceText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#ff6600',
  },
  leaderboardBalanceTextCurrent: {
    color: '#ffd700',
  },
});
