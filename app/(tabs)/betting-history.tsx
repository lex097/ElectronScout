// app/(tabs)/betting-history.tsx
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { bettingService, Bet } from '../../services/bettingService';
import { useEbucksStore } from '../../stores/ebucksStore';

export default function BettingHistoryScreen() {
  const [bets, setBets] = useState<Bet[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [filter, setFilter] = useState<'all' | 'pending' | 'won' | 'lost'>('all');
  
  const balance = useEbucksStore((state) => state.balance);
  const refreshBalance = useEbucksStore((state) => state.refreshBalance);

  const loadBets = useCallback(async (showRefresh = false) => {
    try {
      if (showRefresh) {
        setIsRefreshing(true);
      } else {
        setIsLoading(true);
      }

      const allBets = await bettingService.getUserBets();
      
      // Check and resolve pending bets
      const pendingBets = allBets.filter(b => b.status === 'pending');
      for (const bet of pendingBets) {
        try {
          await bettingService.checkAndResolveBets(bet.matchKey);
        } catch (error) {
          console.error(`Error resolving bet ${bet.id}:`, error);
        }
      }
      
      // Reload bets after resolution
      const updatedBets = await bettingService.getUserBets();
      setBets(updatedBets);
      
      // Refresh balance to get latest
      await refreshBalance();
    } catch (error) {
      console.error('Error loading bets:', error);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [refreshBalance]);

  useFocusEffect(
    useCallback(() => {
      loadBets();
    }, [loadBets])
  );

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

  const getBetDescription = (bet: Bet): string => {
    switch (bet.betType) {
      case 'winner':
        return `Bet on ${bet.betDetails?.alliance === 'red' ? 'Red' : 'Blue'} to win`;
      case 'margin':
        return `Red wins by ${bet.betDetails?.margin}+ points`;
      case 'over_under':
        return `Total ${bet.betDetails?.overUnder === 'over' ? 'Over' : 'Under'} ${bet.betDetails?.threshold}`;
      case 'parlay':
        return `Parlay (${bet.betDetails?.parlayBets?.length || 0} bets)`;
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

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#ff6600" />
          <Text style={styles.loadingText}>Loading betting history...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={[]}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Betting History</Text>
        <View style={styles.balanceBadge}>
          <Text style={styles.balanceText}> {balance} ebucks</Text>
        </View>
      </View>

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
          <RefreshControl refreshing={isRefreshing} onRefresh={() => loadBets(true)} />
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

              <Text style={styles.betDescription}>{getBetDescription(bet)}</Text>
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
  header: {
    backgroundColor: '#ff6600',
    padding: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
  },
  balanceBadge: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  balanceText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
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
});
