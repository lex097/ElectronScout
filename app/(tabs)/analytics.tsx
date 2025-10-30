// app/(tabs)/analytics.tsx
import { useState, useEffect, useCallback } from 'react';
import { 
  View, 
  Text, 
  ScrollView, 
  TouchableOpacity, 
  RefreshControl,
  Alert,
  ActivityIndicator,
} from 'react-native';
import {SafeAreaView} from "react-native-safe-area-context";
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { db } from '../../services/database';
import { analyticsService, TeamAnalytics } from '../../services/analyticsService';
import { MatchData } from '../../types/match';
import { ACTIVE_GAME_CONFIG } from '../../config/gameConfig';

type SortField = 'teamNumber' | 'matchCount' | 'avgScore';
type SortDirection = 'asc' | 'desc';

export default function AnalyticsScreen() {
  const [matches, setMatches] = useState<MatchData[]>([]);
  const [teamAnalytics, setTeamAnalytics] = useState<Map<number, TeamAnalytics>>(new Map());
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [sortField, setSortField] = useState<SortField>('teamNumber');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [selectedTeam, setSelectedTeam] = useState<number | null>(null);

  const loadData = async (showRefresh = false) => {
    try {
      if (showRefresh) setIsRefreshing(true);
      else setIsLoading(true);

      // Load all matches from local database
      const allMatches = await db.getAllMatches();
      setMatches(allMatches);

      // Calculate analytics
      if (allMatches.length > 0) {
        const analytics = analyticsService.calculateTeamAnalytics(allMatches);
        setTeamAnalytics(analytics);
      } else {
        setTeamAnalytics(new Map());
      }
    } catch (error) {
      console.error('Failed to load data:', error);
      Alert.alert('Error', 'Failed to load analytics data');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  // Load data when screen comes into focus
  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [])
  );

  const handleClearData = () => {
    Alert.alert(
      'Clear All Data',
      'This will delete all scouting data. Are you sure?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await db.clearAllMatches();
            await loadData();
            Alert.alert('Success', 'All data cleared');
          },
        },
      ]
    );
  };

  const getSortedTeams = () => {
    const teamsArray = Array.from(teamAnalytics.values());

    return teamsArray.sort((a, b) => {
      let comparison = 0;

      switch (sortField) {
        case 'teamNumber':
          comparison = a.teamNumber - b.teamNumber;
          break;
        case 'matchCount':
          comparison = a.totalMatches - b.totalMatches;
          break;
        case 'avgScore':
          comparison = a.averagePoints - b.averagePoints;
          break;
      }

      return sortDirection === 'asc' ? comparison : -comparison;
    });
  };

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  const renderEmptyState = () => (
    <View style={styles.emptyState}>
      <Ionicons name="stats-chart-outline" size={64} color="#9ca3af" />
      <Text style={styles.emptyTitle}>No Data Yet</Text>
      <Text style={styles.emptySubtitle}>
        Start scouting matches to see analytics here
      </Text>
    </View>
  );

  const renderTeamCard = (team: TeamAnalytics) => {
    const isExpanded = selectedTeam === team.teamNumber;

    return (
      <TouchableOpacity
        key={team.teamNumber}
        style={styles.teamCard}
        onPress={() => setSelectedTeam(isExpanded ? null : team.teamNumber)}
      >
        <View style={styles.teamCardHeader}>
          <View style={styles.teamCardLeft}>
            <Text style={styles.teamNumber}>Team {team.teamNumber}</Text>
            <Text style={styles.teamMatches}>{team.totalMatches} matches</Text>
          </View>
          <View style={styles.teamCardRight}>
            <Text style={styles.compositeScore}>{team.averagePoints.toFixed(1)}</Text>
            <Text style={styles.compositeLabel}>Avg Points</Text>
          </View>
        </View>

        {isExpanded && (
          <View style={styles.teamCardExpanded}>
            <View style={styles.pointsSummary}>
              <View style={styles.pointsBox}>
                <Text style={styles.pointsValue}>{team.totalPoints}</Text>
                <Text style={styles.pointsLabel}>Total Points</Text>
              </View>
              <View style={styles.pointsBox}>
                <Text style={styles.pointsValue}>{team.averagePoints.toFixed(1)}</Text>
                <Text style={styles.pointsLabel}>Avg Points/Match</Text>
              </View>
            </View>

            <View style={styles.reliabilityContainer}>
              <Text style={styles.sectionLabel}>Reliability</Text>
              <View style={styles.reliabilityBar}>
                <View 
                  style={[
                    styles.reliabilityFill, 
                    { width: `${team.reliability * 100}%` }
                  ]} 
                />
              </View>
              <Text style={styles.reliabilityText}>
                {(team.reliability * 100).toFixed(0)}%
              </Text>
            </View>

            <Text style={styles.sectionLabel}>Metrics Breakdown</Text>
            {Object.entries(team.metrics).map(([metricId, stats]) => {
              const metric = ACTIVE_GAME_CONFIG.phases
                .flatMap(p => p.metrics)
                .find(m => m.id === metricId);

              return (
                <View key={metricId} style={styles.metricRow}>
                  <Text style={styles.metricName}>
                    {metric?.label || metricId}
                  </Text>
                  <View style={styles.metricStats}>
                    <View style={styles.statItem}>
                      <Text style={styles.statLabel}>Avg</Text>
                      <Text style={styles.statValue}>{stats.average}</Text>
                    </View>
                    <View style={styles.statItem}>
                      <Text style={styles.statLabel}>Max</Text>
                      <Text style={styles.statValue}>{stats.max}</Text>
                    </View>
                    <View style={styles.statItem}>
                      <Text style={styles.statLabel}>Min</Text>
                      <Text style={styles.statValue}>{stats.min}</Text>
                    </View>
                  </View>
                </View>
              );
            })}

            <Text style={styles.sectionLabel}>Recent Matches</Text>
            {team.matchHistory.slice(-3).reverse().map(match => (
              <View key={match.id} style={styles.matchHistoryItem}>
                <Text style={styles.matchHistoryText}>
                  Match {match.matchNumber}
                </Text>
                <Text style={styles.matchHistoryDate}>
                  {new Date(match.timestamp).toLocaleDateString()}
                </Text>
              </View>
            ))}
          </View>
        )}

        <Ionicons
          name={isExpanded ? 'chevron-up' : 'chevron-down'}
          size={20}
          color="#6b7280"
          style={styles.expandIcon}
        />
      </TouchableOpacity>
    );
  };

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#1e40af" />
          <Text style={styles.loadingText}>Loading analytics...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        refreshControl={
          <RefreshControl refreshing={isRefreshing} onRefresh={() => loadData(true)} />
        }
      >
        {/* Stats Header */}
        <View style={styles.statsHeader}>
          <View style={styles.statBox}>
            <Text style={styles.statNumber}>{matches.length}</Text>
            <Text style={styles.statLabel}>Total Matches</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statNumber}>{teamAnalytics.size}</Text>
            <Text style={styles.statLabel}>Teams Scouted</Text>
          </View>
          <TouchableOpacity style={styles.statBox} onPress={handleClearData}>
            <Ionicons name="trash-outline" size={24} color="#ef4444" />
            <Text style={[styles.statLabel, { color: '#ef4444' }]}>Clear Data</Text>
          </TouchableOpacity>
        </View>

        {teamAnalytics.size === 0 ? (
          renderEmptyState()
        ) : (
          <>
            {/* Sort Controls */}
            <View style={styles.sortControls}>
              <Text style={styles.sortLabel}>Sort by:</Text>
              <TouchableOpacity
                style={[
                  styles.sortButton,
                  sortField === 'teamNumber' && styles.sortButtonActive,
                ]}
                onPress={() => toggleSort('teamNumber')}
              >
                <Text
                  style={[
                    styles.sortButtonText,
                    sortField === 'teamNumber' && styles.sortButtonTextActive,
                  ]}
                >
                  Team #
                </Text>
                {sortField === 'teamNumber' && (
                  <Ionicons
                    name={sortDirection === 'asc' ? 'arrow-up' : 'arrow-down'}
                    size={16}
                    color="white"
                  />
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.sortButton,
                  sortField === 'matchCount' && styles.sortButtonActive,
                ]}
                onPress={() => toggleSort('matchCount')}
              >
                <Text
                  style={[
                    styles.sortButtonText,
                    sortField === 'matchCount' && styles.sortButtonTextActive,
                  ]}
                >
                  Matches
                </Text>
                {sortField === 'matchCount' && (
                  <Ionicons
                    name={sortDirection === 'asc' ? 'arrow-up' : 'arrow-down'}
                    size={16}
                    color="white"
                  />
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.sortButton,
                  sortField === 'avgScore' && styles.sortButtonActive,
                ]}
                onPress={() => toggleSort('avgScore')}
              >
                <Text
                  style={[
                    styles.sortButtonText,
                    sortField === 'avgScore' && styles.sortButtonTextActive,
                  ]}
                >
                  Score
                </Text>
                {sortField === 'avgScore' && (
                  <Ionicons
                    name={sortDirection === 'asc' ? 'arrow-up' : 'arrow-down'}
                    size={16}
                    color="white"
                  />
                )}
              </TouchableOpacity>
            </View>

            {/* Team Cards */}
            <View style={styles.teamList}>
              {getSortedTeams().map(team => renderTeamCard(team))}
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = {
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  scrollView: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#6b7280',
  },
  statsHeader: {
    flexDirection: 'row' as const,
    padding: 16,
    gap: 12,
  },
  statBox: {
    flex: 1,
    backgroundColor: 'white',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center' as const,
  },
  statNumber: {
    fontSize: 28,
    fontWeight: 'bold' as const,
    color: '#1e40af',
  },
  statLabel: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: 4,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    padding: 48,
    marginTop: 64,
  },
  emptyTitle: {
    fontSize: 24,
    fontWeight: 'bold' as const,
    color: '#1f2937',
    marginTop: 16,
  },
  emptySubtitle: {
    fontSize: 16,
    color: '#6b7280',
    textAlign: 'center' as const,
    marginTop: 8,
  },
  sortControls: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    paddingHorizontal: 16,
    paddingBottom: 12,
    gap: 8,
  },
  sortLabel: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: '#374151',
  },
  sortButton: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    backgroundColor: '#e5e7eb',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    gap: 4,
  },
  sortButtonActive: {
    backgroundColor: '#1e40af',
  },
  sortButtonText: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: '#374151',
  },
  sortButtonTextActive: {
    color: 'white',
  },
  teamList: {
    padding: 16,
    gap: 12,
  },
  teamCard: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  teamCardHeader: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
  },
  teamCardLeft: {
    flex: 1,
  },
  teamNumber: {
    fontSize: 20,
    fontWeight: 'bold' as const,
    color: '#1f2937',
  },
  teamMatches: {
    fontSize: 14,
    color: '#6b7280',
    marginTop: 2,
  },
  teamCardRight: {
    alignItems: 'flex-end' as const,
  },
  compositeScore: {
    fontSize: 28,
    fontWeight: 'bold' as const,
    color: '#1e40af',
  },
  compositeLabel: {
    fontSize: 12,
    color: '#6b7280',
  },
  expandIcon: {
    alignSelf: 'center' as const,
    marginTop: 8,
  },
  teamCardExpanded: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
  },
  pointsSummary: {
    flexDirection: 'row' as const,
    gap: 12,
    marginBottom: 16,
  },
  pointsBox: {
    flex: 1,
    backgroundColor: '#eff6ff',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center' as const,
  },
  pointsValue: {
    fontSize: 24,
    fontWeight: 'bold' as const,
    color: '#1e40af',
  },
  pointsLabel: {
    fontSize: 11,
    color: '#6b7280',
    marginTop: 2,
  },
  sectionLabel: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: '#374151',
    marginTop: 12,
    marginBottom: 8,
  },
  reliabilityContainer: {
    marginBottom: 8,
  },
  reliabilityBar: {
    height: 8,
    backgroundColor: '#e5e7eb',
    borderRadius: 4,
    overflow: 'hidden' as const,
    marginTop: 4,
  },
  reliabilityFill: {
    height: 8,
    backgroundColor: '#10b981',
  },
  reliabilityText: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: 4,
  },
  metricRow: {
    marginBottom: 12,
  },
  metricName: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: '#374151',
    marginBottom: 4,
  },
  metricStats: {
    flexDirection: 'row' as const,
    gap: 16,
  },
  statItem: {
    alignItems: 'center' as const,
  },
  statValue: {
    fontSize: 18,
    fontWeight: 'bold' as const,
    color: '#1e40af',
  },
  matchHistoryItem: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  matchHistoryText: {
    fontSize: 14,
    color: '#374151',
  },
  matchHistoryDate: {
    fontSize: 12,
    color: '#6b7280',
  },
};