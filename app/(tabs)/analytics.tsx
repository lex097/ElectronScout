// app/(tabs)/analytics.tsx
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  RefreshControl,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { LineChart } from 'react-native-chart-kit';
import { SafeAreaView } from "react-native-safe-area-context";
import { ACTIVE_GAME_CONFIG, calculateMatchPoints, GameConfig } from '../../config/gameConfig';
import { analyticsService, TeamAnalytics } from '../../services/analyticsService';
import { db } from '../../services/database';
import { supabaseSyncService } from '../../services/supabase.sync';
import { syncManager } from '../../services/syncTransformer';
import { MatchData } from '../../types/match';

type SortField = 'avgScore' | 'avgAuto' | 'avgTeleop' | 'avgEndgame';
type SortDirection = 'asc' | 'desc';
type DataSource = 'local' | 'team';

export default function AnalyticsScreen() {
  const [matches, setMatches] = useState<MatchData[]>([]);
  const [teamMatches, setTeamMatches] = useState<MatchData[]>([]);
  const [teamAnalytics, setTeamAnalytics] = useState<Map<number, TeamAnalytics>>(new Map());
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [sortField, setSortField] = useState<SortField>('avgScore');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [selectedTeam, setSelectedTeam] = useState<number | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [dataSource, setDataSource] = useState<DataSource>('local');

  const loadData = async (showRefresh = false) => {
    try {
      if (showRefresh) setIsRefreshing(true);
      else setIsLoading(true);

      let matchesToAnalyze: MatchData[] = [];
      
      if (dataSource === 'local') {
        // Load from local database
        const allMatches = await db.getAllMatches();
        setMatches(allMatches);
        matchesToAnalyze = allMatches;
      } else {
        // Load from Supabase
        const allTeamMatches = await supabaseSyncService.getAllTeamMatches();
        setTeamMatches(allTeamMatches);
        matchesToAnalyze = allTeamMatches;
      }

      // Calculate analytics
      if (matchesToAnalyze.length > 0) {
        const analytics = analyticsService.calculateTeamAnalytics(matchesToAnalyze);
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

  // Reload data when dataSource changes
  useEffect(() => {
    loadData();
  }, [dataSource]);

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

  const handleDeleteMatch = async (matchId: string, matchNumber: number, teamNumber: number) => {
    Alert.alert(
      'Delete Match',
      `Are you sure you want to delete Match ${matchNumber} for Team ${teamNumber}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await db.deleteMatch(matchId);
              await loadData();
              Alert.alert('Success', 'Match deleted successfully');
            } catch (error) {
              console.error('Failed to delete match:', error);
              Alert.alert('Error', 'Failed to delete match');
            }
          },
        },
      ]
    );
  };

  const getSortedTeams = () => {
    const teamsArray = Array.from(teamAnalytics.values());

    return teamsArray.sort((a, b) => {
      // Multi-level sort: score first, then auto, teleop, endgame
      const aScore = a.averagePoints;
      const bScore = b.averagePoints;
      
      const aAuto = getAveragePhasePoints(a, 'auto');
      const bAuto = getAveragePhasePoints(b, 'auto');
      
      const aTeleop = getAveragePhasePoints(a, 'teleop');
      const bTeleop = getAveragePhasePoints(b, 'teleop');
      
      const aEndgame = getAveragePhasePoints(a, 'endgame');
      const bEndgame = getAveragePhasePoints(b, 'endgame');
      
      // Primary sort by selected field
      let comparison = 0;
      switch (sortField) {
        case 'avgScore':
          comparison = aScore - bScore;
          break;
        case 'avgAuto':
          comparison = aAuto - bAuto;
          break;
        case 'avgTeleop':
          comparison = aTeleop - bTeleop;
          break;
        case 'avgEndgame':
          comparison = aEndgame - bEndgame;
          break;
      }
      
      // If primary sort is equal, use tiebreakers in order: score → auto → teleop → endgame
      if (comparison === 0) {
        // Define tiebreaker order
        const tiebreakers = [
          { field: 'avgScore', value: aScore - bScore },
          { field: 'avgAuto', value: aAuto - bAuto },
          { field: 'avgTeleop', value: aTeleop - bTeleop },
          { field: 'avgEndgame', value: aEndgame - bEndgame },
        ];
        
        // Use tiebreakers in order, skipping the primary sort field
        for (const tiebreaker of tiebreakers) {
          if (tiebreaker.field !== sortField && comparison === 0) {
            comparison = tiebreaker.value;
            if (comparison !== 0) break;
          }
        }
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

  const handleSyncNow = async () => {
    if (matches.length === 0) {
      Alert.alert('Nothing to sync', 'No local matches found.');
      return;
    }

    setIsSyncing(true);

    try {
      const result = await syncManager.fullSync();

      await loadData(true);

      Alert.alert(
        'Sync complete',
        `${result.success} uploaded, ${result.failed} failed, ${result.skipped} skipped`
      );
    } catch (e) {
      console.error('Sync error:', e);
      Alert.alert('Sync error', 'An unexpected error occurred.');
    } finally {
      setIsSyncing(false);
    }
  };

  const calculatePhasePoints = (metrics: Record<string, any>, phaseId: string, config: GameConfig = ACTIVE_GAME_CONFIG): number => {
    let phasePoints = 0;
    const phase = config.phases.find(p => p.id === phaseId);
    
    if (!phase) return 0;
    
    phase.metrics.forEach(metric => {
      const value = metrics[metric.id];
      let points = 0;
      
      switch (metric.type) {
        case 'counter':
          if (typeof value === 'number' && metric.points) {
            points = value * metric.points;
            phasePoints += points;
          }
          break;
        
        case 'boolean':
          if (value === true && metric.points) {
            points = metric.points;
            phasePoints += points;
          }
          break;
        
        case 'select':
          if (metric.pointsMap && typeof value === 'string') {
            points = metric.pointsMap[value] || 0;
            phasePoints += points;
          }
          break;
      }
    });
    
    return phasePoints;
  };

  const getAveragePhasePoints = (team: TeamAnalytics, phaseId: string): number => {
    if (team.matchHistory.length === 0) return 0;
    
    const totalPhasePoints = team.matchHistory.reduce((sum, match) => {
      return sum + calculatePhasePoints(match.metrics, phaseId);
    }, 0);
    
    return Math.round((totalPhasePoints / team.matchHistory.length) * 10) / 10;
  };

  const getMaxPointsAcrossAllTeams = () => {
    let maxPoints = 0;
    
    teamAnalytics.forEach(team => {
      team.matchHistory.forEach(match => {
        const points = calculateMatchPoints(match.metrics);
        if (points > maxPoints) {
          maxPoints = points;
        }
      });
    });
    
    return maxPoints || 100; // Default to 100 if no data
  };

  const getMatchPointsData = (team: TeamAnalytics) => {
    // Sort matches by match number
    const sortedMatches = [...team.matchHistory].sort((a, b) => a.matchNumber - b.matchNumber);
    
    // Calculate points for each match
    const points = sortedMatches.map(match => calculateMatchPoints(match.metrics));
    const labels = sortedMatches.map(match => `M${match.matchNumber}`);
    
    return { points, labels };
  };

  const renderEmptyState = () => (
    <View style={styles.emptyState}>
      <Ionicons name="stats-chart-outline" size={64} color="#9ca3af" />
      <Text style={styles.emptyTitle}>No Data Yet</Text>
      <Text style={styles.emptySubtitle}>
        {dataSource === 'local' 
          ? 'Start scouting matches to see analytics here'
          : 'No team data available. Sync matches to see team analytics.'}
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
                <Text style={styles.pointsValue}>{getAveragePhasePoints(team, 'auto').toFixed(1)}</Text>
                <Text style={styles.pointsLabel}>Avg Auto/Match</Text>
              </View>
              <View style={styles.pointsBox}>
                <Text style={styles.pointsValue}>{getAveragePhasePoints(team, 'teleop').toFixed(1)}</Text>
                <Text style={styles.pointsLabel}>Avg Teleop/Match</Text>
              </View>
              <View style={styles.pointsBox}>
                <Text style={styles.pointsValue}>{getAveragePhasePoints(team, 'endgame').toFixed(1)}</Text>
                <Text style={styles.pointsLabel}>Avg Endgame/Match</Text>
              </View>
            </View>

            <View style={styles.progressChartContainer}>
              <Text style={styles.sectionLabel}>Performance Progress</Text>
              {team.matchHistory.length > 0 && (() => {
                const { points, labels } = getMatchPointsData(team);
                const screenWidth = Dimensions.get('window').width;
                const maxPoints = getMaxPointsAcrossAllTeams();
                
                return (
                  <LineChart
                    data={{
                      labels: labels,
                      datasets: [
                        {
                          data: points.length > 0 ? points : [0],
                        },
                        {
                          data: [0],
                          withDots: false,
                          strokeWidth: 0,
                        },
                        {
                          data: [maxPoints],
                          withDots: false,
                          strokeWidth: 0,
                        }
                      ]
                    }}
                    width={screenWidth - 64}
                    height={200}
                    chartConfig={{
                      backgroundColor: '#ffffff',
                      backgroundGradientFrom: '#ffffff',
                      backgroundGradientTo: '#ffffff',
                      decimalPlaces: 0,
                      color: (opacity = 1) => `rgba(30, 64, 175, ${opacity})`,
                      labelColor: (opacity = 1) => `rgba(107, 114, 128, ${opacity})`,
                      style: {
                        borderRadius: 16,
                      },
                      propsForDots: {
                        r: '4',
                        strokeWidth: '2',
                        stroke: '#1e40af',
                      },
                      propsForBackgroundLines: {
                        strokeDasharray: '', // solid lines
                        stroke: '#e5e7eb',
                        strokeWidth: 1,
                      },
                    }}
                    withShadow={false}
                    withInnerLines={true}
                    withOuterLines={true}
                    style={{
                      marginVertical: 8,
                      borderRadius: 16,
                    }}
                  />
                );
              })()}
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
                <View style={styles.matchHistoryInfo}>
                  <Text style={styles.matchHistoryText}>
                    Match {match.matchNumber}
                  </Text>
                  <Text style={styles.matchHistoryDate}>
                    {new Date(match.timestamp).toLocaleDateString()}
                  </Text>
                </View>
                {dataSource === 'local' && (
                  <TouchableOpacity
                    onPress={() => handleDeleteMatch(match.id, match.matchNumber, team.teamNumber)}
                    style={styles.deleteMatchButton}
                  >
                    <Ionicons name="close-circle" size={24} color="#ef4444" />
                  </TouchableOpacity>
                )}
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
      {/* Segmented Control */}
      <View style={styles.segmentedControl}>
        <TouchableOpacity
          style={[
            styles.segmentButton,
            styles.segmentButtonLeft,
            dataSource === 'local' && styles.segmentButtonActive,
          ]}
          onPress={() => setDataSource('local')}
        >
          <Text
            style={[
              styles.segmentButtonText,
              dataSource === 'local' && styles.segmentButtonTextActive,
            ]}
          >
            My Data
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.segmentButton,
            styles.segmentButtonRight,
            dataSource === 'team' && styles.segmentButtonActive,
          ]}
          onPress={() => setDataSource('team')}
        >
          <Text
            style={[
              styles.segmentButtonText,
              dataSource === 'team' && styles.segmentButtonTextActive,
            ]}
          >
            Team Data
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scrollView}
        refreshControl={
          <RefreshControl refreshing={isRefreshing} onRefresh={() => loadData(true)} />
        }
      >
        {/* Stats Header */}
        <View style={styles.statsHeader}>
          <View style={styles.statBox}>
            <Text style={styles.statNumber}>
              {dataSource === 'local' ? matches.length : teamMatches.length}
            </Text>
            <Text style={styles.statLabel}>Total Matches</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statNumber}>{teamAnalytics.size}</Text>
            <Text style={styles.statLabel}>Teams Scouted</Text>
          </View>
          {dataSource === 'local' && (
            <TouchableOpacity style={styles.statBox} onPress={handleClearData}>
              <Ionicons name="trash-outline" size={24} color="#ef4444" />
              <Text style={[styles.statLabel, { color: '#ef4444' }]}>Clear Data</Text>
            </TouchableOpacity>
          )}
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

              <TouchableOpacity
                style={[
                  styles.sortButton,
                  sortField === 'avgAuto' && styles.sortButtonActive,
                ]}
                onPress={() => toggleSort('avgAuto')}
              >
                <Text
                  style={[
                    styles.sortButtonText,
                    sortField === 'avgAuto' && styles.sortButtonTextActive,
                  ]}
                >
                  Auto
                </Text>
                {sortField === 'avgAuto' && (
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
                  sortField === 'avgTeleop' && styles.sortButtonActive,
                ]}
                onPress={() => toggleSort('avgTeleop')}
              >
                <Text
                  style={[
                    styles.sortButtonText,
                    sortField === 'avgTeleop' && styles.sortButtonTextActive,
                  ]}
                >
                  Teleop
                </Text>
                {sortField === 'avgTeleop' && (
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
                  sortField === 'avgEndgame' && styles.sortButtonActive,
                ]}
                onPress={() => toggleSort('avgEndgame')}
              >
                <Text
                  style={[
                    styles.sortButtonText,
                    sortField === 'avgEndgame' && styles.sortButtonTextActive,
                  ]}
                >
                  Endgame
                </Text>
                {sortField === 'avgEndgame' && (
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
        {dataSource === 'local' && (
          <View style={styles.footer}>
            <TouchableOpacity
              style={[styles.syncButton, isSyncing && styles.syncButtonDisabled]}
              onPress={handleSyncNow}
              disabled={isSyncing}
            >
              {isSyncing ? (
                <ActivityIndicator size="small" color="white" />
              ) : (
                <Ionicons name="cloud-upload-outline" size={20} color="white" />
              )}
              <Text style={styles.syncButtonText}>{isSyncing ? 'Syncing...' : 'Sync Now'}</Text>
            </TouchableOpacity>
          </View>
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
  segmentedControl: {
    flexDirection: 'row' as const,
    backgroundColor: '#e5e7eb',
    borderRadius: 10,
    padding: 4,
    marginHorizontal: 16,
    marginBottom: 8,
  },
  segmentButton: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  segmentButtonLeft: {
    borderTopLeftRadius: 8,
    borderBottomLeftRadius: 8,
  },
  segmentButtonRight: {
    borderTopRightRadius: 8,
    borderBottomRightRadius: 8,
  },
  segmentButtonActive: {
    backgroundColor: 'white',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  segmentButtonText: {
    fontSize: 15,
    fontWeight: '600' as const,
    color: '#6b7280',
  },
  segmentButtonTextActive: {
    color: '#1e40af',
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
  progressChartContainer: {
    marginBottom: 8,
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
    alignItems: 'center' as const,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  matchHistoryInfo: {
    flex: 1,
  },
  matchHistoryText: {
    fontSize: 14,
    color: '#374151',
  },
  matchHistoryDate: {
    fontSize: 12,
    color: '#6b7280',
  },
  deleteMatchButton: {
    padding: 4,
    marginLeft: 8,
  },
  footer: {
    padding: 16,
  },
  syncButton: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: '#1e40af',
    paddingVertical: 12,
    borderRadius: 10,
    gap: 8,
  },
  syncButtonDisabled: {
    opacity: 0.7,
  },
  syncButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600' as const,
  },
};