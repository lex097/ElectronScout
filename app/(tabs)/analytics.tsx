// app/(tabs)/analytics.tsx
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  RefreshControl,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from "react-native-safe-area-context";
import Svg, { Circle, Line, Path } from 'react-native-svg';
import { ACTIVE_GAME_CONFIG, calculateMatchPoints, GameConfig } from '../../config/gameConfig';
import { analyticsService, TeamAnalytics } from '../../services/analyticsService';
import { db } from '../../services/database';
import { exportService } from '../../services/exportService';
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
  const [isExporting, setIsExporting] = useState(false);
  const [dataSource, setDataSource] = useState<DataSource>('local');

  const loadData = useCallback(async (showRefresh = false) => {
    try {
      if (showRefresh) setIsRefreshing(true);
      else setIsLoading(true);

      // Get event_key from storage for filtering team data
      const eventKey = await AsyncStorage.getItem('selected_event_key');
      
      if (dataSource === 'local') {
        // Load from local database
        // Note: Local database doesn't store event_key, so we can't filter by event
        const allMatches = await db.getAllMatches();
        setMatches(allMatches);
        
        // Calculate analytics using existing service (manual calculation)
        if (allMatches.length > 0) {
          const analytics = analyticsService.calculateTeamAnalytics(allMatches);
          setTeamAnalytics(analytics);
      } else {
          setTeamAnalytics(new Map());
        }
      } else {
        // Load from Supabase and use same calculation method as local data
        if (!eventKey) {
          Alert.alert('No Event Selected', 'Please select an event to view team analytics');
          setTeamAnalytics(new Map());
          return;
        }

        // Fetch matches from Supabase
        const supabaseMatches = await supabaseSyncService.getAllTeamMatches(eventKey);
        
        // Convert Supabase matches to MatchData format
        const matchesAsMatchData: MatchData[] = supabaseMatches.map((match: any) => ({
          id: match.id,
          matchNumber: match.matchNumber,
          teamNumber: match.teamNumber,
          scouterId: match.scouterId,
          gameYear: match.gameYear,
          metrics: match.metrics,
          timestamp: match.timestamp,
          synced: match.synced,
          notes: match.notes,
        }));
        
        setTeamMatches(matchesAsMatchData);

        // Calculate analytics using the same service as local data
        if (matchesAsMatchData.length > 0) {
          const analytics = analyticsService.calculateTeamAnalytics(matchesAsMatchData);
        setTeamAnalytics(analytics);
      } else {
        setTeamAnalytics(new Map());
        }
      }
    } catch (error) {
      console.error('Failed to load data:', error);
      Alert.alert('Error', 'Failed to load analytics data');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [dataSource]);

  // Load data when screen comes into focus
  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
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

  const handleExport = async () => {
    try {
      if (teamMatches.length === 0) {
        Alert.alert('No Data', 'No team data available to export.');
        return;
      }

      Alert.alert(
        'Export Data',
        'This will export all scouting data for your team. Continue?',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Export',
            onPress: async () => {
              try {
                setIsExporting(true);
                
                // Get current event key if available
                const eventKey = await AsyncStorage.getItem('selected_event_key');
                
                // Export and share
                await exportService.exportAndShare(eventKey || undefined);
              } catch (error: any) {
                console.error('Export error:', error);
                Alert.alert(
                  'Export Failed',
                  error.message || 'Failed to export data. Please try again.'
                );
              } finally {
                setIsExporting(false);
              }
            },
          },
        ]
      );
    } catch (error) {
      console.error('Export error:', error);
      Alert.alert('Error', 'Failed to export data');
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
        case 'rapidCounter':
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
    // If we have phase data in metrics (from optimized Supabase query), use it
    if (team.metrics[phaseId]?.average !== undefined) {
      return team.metrics[phaseId].average;
    }
    
    // Otherwise, calculate from matchHistory (for local data)
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

  // SVG Line Chart Component (using react-native-svg)
  const PerformanceChart = ({ points, labels, maxPoints }: { points: number[]; labels: string[]; maxPoints: number }) => {
    const screenWidth = Dimensions.get('window').width;
    const chartWidth = screenWidth - 64;
    const chartHeight = 200;
    const paddingLeft = 50;
    const paddingRight = 20;
    const paddingTop = 20;
    const paddingBottom = 40;
    const graphWidth = chartWidth - paddingLeft - paddingRight;
    const graphHeight = chartHeight - paddingTop - paddingBottom;

    if (points.length === 0) {
      return null;
    }

    // Calculate positions for each point
    const pointPositions = points.map((point, index) => {
      const x = paddingLeft + (index / Math.max(points.length - 1, 1)) * graphWidth;
      const y = paddingTop + graphHeight - (point / maxPoints) * graphHeight;
      return { x, y, value: point };
    });

    // Create path string for the line
    const pathData = pointPositions
      .map((pos, index) => `${index === 0 ? 'M' : 'L'} ${pos.x} ${pos.y}`)
      .join(' ');

    return (
      <View style={{ width: chartWidth, height: chartHeight }}>
        <Svg width={chartWidth} height={chartHeight}>
          {/* Grid lines */}
          {[0, 0.25, 0.5, 0.75, 1].map((ratio, i) => {
            const y = paddingTop + graphHeight - ratio * graphHeight;
            return (
              <Line
                key={`grid-${i}`}
                x1={paddingLeft}
                y1={y}
                x2={chartWidth - paddingRight}
                y2={y}
                stroke="#404040"
                strokeWidth="1"
              />
            );
          })}

          {/* Y-axis line */}
          <Line
            x1={paddingLeft}
            y1={paddingTop}
            x2={paddingLeft}
            y2={paddingTop + graphHeight}
            stroke="#404040"
            strokeWidth="1"
          />

          {/* X-axis line */}
          <Line
            x1={paddingLeft}
            y1={paddingTop + graphHeight}
            x2={chartWidth - paddingRight}
            y2={paddingTop + graphHeight}
            stroke="#404040"
            strokeWidth="1"
          />

          {/* Chart line */}
          <Path
            d={pathData}
            fill="none"
            stroke="#ff6600"
            strokeWidth="2"
          />

          {/* Points */}
          {pointPositions.map((pos, index) => (
            <Circle
              key={`point-${index}`}
              cx={pos.x}
              cy={pos.y}
              r="3"
              fill="#ff6600"
              stroke="#1a1a1a"
              strokeWidth="2"
            />
          ))}
        </Svg>

        {/* Y-axis labels */}
        {[0, 0.25, 0.5, 0.75, 1].map((ratio, i) => {
          const y = paddingTop + graphHeight - ratio * graphHeight;
          const value = Math.round(ratio * maxPoints);
          return (
            <Text
              key={`y-label-${i}`}
              style={{
                position: 'absolute',
                left: 0,
                top: y - 8,
                width: paddingLeft - 5,
                color: '#b0b0b0',
                fontSize: 11,
                textAlign: 'right',
              }}
            >
              {value}
            </Text>
          );
        })}

        {/* X-axis labels */}
        {labels.map((label, index) => {
          if (index % Math.max(Math.ceil(labels.length / 6), 1) !== 0 && index !== labels.length - 1) return null;
          const x = paddingLeft + (index / Math.max(points.length - 1, 1)) * graphWidth;
          return (
            <Text
              key={`x-label-${index}`}
              style={{
                position: 'absolute',
                left: x - 15,
                top: chartHeight - paddingBottom + 5,
                width: 30,
                color: '#b0b0b0',
                fontSize: 11,
                textAlign: 'center',
              }}
            >
              {label}
            </Text>
          );
        })}
      </View>
    );
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
                const maxPoints = getMaxPointsAcrossAllTeams();
                
                return (
                  <View style={{ marginVertical: 8 }}>
                    <PerformanceChart points={points} labels={labels} maxPoints={maxPoints} />
                  </View>
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
          color="#b0b0b0"
          style={styles.expandIcon}
        />
      </TouchableOpacity>
    );
  };

  // Skeleton loader component
  const SkeletonBox = ({ width, height, style }: { width?: number | string; height: number; style?: any }) => {
    const opacity = useRef(new Animated.Value(0.3)).current;

    useEffect(() => {
      const animation = Animated.loop(
        Animated.sequence([
          Animated.timing(opacity, {
            toValue: 0.7,
            duration: 1000,
            useNativeDriver: true,
          }),
          Animated.timing(opacity, {
            toValue: 0.3,
            duration: 1000,
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
            width: width || '100%',
            height,
            backgroundColor: '#3a3a3a',
            borderRadius: 8,
            opacity,
          },
          style,
        ]}
      />
    );
  };

  const renderSkeletonLoader = () => {
    return (
      <SafeAreaView style={styles.container} edges={[]}>
        <View style={styles.segmentedControl}>
          <View style={[styles.segmentButton, styles.segmentButtonLeft, styles.segmentButtonActive]}>
            <SkeletonBox width={70} height={16} style={{ borderRadius: 0, opacity: 1 }} />
          </View>
          <View style={[styles.segmentButton, styles.segmentButtonRight]}>
            <SkeletonBox width={80} height={16} style={{ borderRadius: 0, opacity: 0.5 }} />
          </View>
        </View>
        <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
          {/* Stats Header Skeleton */}
          <View style={styles.statsHeader}>
            <View style={styles.statBox}>
              <SkeletonBox width={60} height={28} style={{ marginBottom: 8, backgroundColor: '#3a3a3a' }} />
              <SkeletonBox width={80} height={12} style={{ backgroundColor: '#3a3a3a' }} />
            </View>
            <View style={styles.statBox}>
              <SkeletonBox width={40} height={28} style={{ marginBottom: 8, backgroundColor: '#3a3a3a' }} />
              <SkeletonBox width={90} height={12} style={{ backgroundColor: '#3a3a3a' }} />
            </View>
            {dataSource === 'local' && (
              <View style={[styles.statBox, styles.clearDataBox]}>
                <SkeletonBox width={24} height={24} style={{ marginBottom: 8, backgroundColor: '#3a3a3a' }} />
                <SkeletonBox width={70} height={12} style={{ backgroundColor: '#3a3a3a' }} />
              </View>
            )}
          </View>

          {/* Sort Controls Skeleton */}
          <View style={styles.sortControls}>
            <SkeletonBox width={60} height={16} style={{ marginRight: 12, backgroundColor: '#3a3a3a' }} />
            <SkeletonBox width={70} height={36} style={{ borderRadius: 18, marginRight: 8, backgroundColor: '#3a3a3a' }} />
            <SkeletonBox width={70} height={36} style={{ borderRadius: 18, marginRight: 8, backgroundColor: '#3a3a3a' }} />
            <SkeletonBox width={70} height={36} style={{ borderRadius: 18, marginRight: 8, backgroundColor: '#3a3a3a' }} />
            <SkeletonBox width={70} height={36} style={{ borderRadius: 18, backgroundColor: '#3a3a3a' }} />
          </View>

          {/* Team Cards Skeleton */}
          <View style={styles.teamList}>
            {[1, 2, 3, 4, 5].map((i) => (
              <View key={i} style={styles.teamCard}>
                <View style={styles.teamCardHeader}>
                  <View style={styles.teamCardLeft}>
                    <SkeletonBox width={120} height={20} style={{ marginBottom: 8, backgroundColor: '#3a3a3a' }} />
                    <SkeletonBox width={80} height={14} style={{ backgroundColor: '#3a3a3a' }} />
                  </View>
                  <View style={styles.teamCardRight}>
                    <SkeletonBox width={50} height={28} style={{ marginBottom: 8, backgroundColor: '#3a3a3a' }} />
                    <SkeletonBox width={70} height={12} style={{ backgroundColor: '#3a3a3a' }} />
                  </View>
                </View>
              </View>
            ))}
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  };

  if (isLoading) {
    return renderSkeletonLoader();
  }

  return (
    <SafeAreaView style={styles.container} edges={[]}>
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
        contentContainerStyle={styles.scrollContent}
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
            <Text style={[styles.statLabel, dataSource === 'local' && styles.statLabelSmall]}>
              Teams Scouted
            </Text>
          </View>
          {dataSource === 'local' && (
            <TouchableOpacity style={[styles.statBox, styles.clearDataBox]} onPress={handleClearData}>
              <Ionicons name="trash-outline" size={24} color="#ef4444" />
              <Text style={[styles.statLabel, { color: '#ef4444' }]}>Clear Data</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Export Button - Only show in Team Data section */}
        {dataSource === 'team' && teamMatches.length > 0 && (
          <View style={styles.exportContainer}>
            <TouchableOpacity
              style={[styles.exportButton, isExporting && styles.exportButtonDisabled]}
              onPress={handleExport}
              disabled={isExporting}
            >
              {isExporting ? (
                <>
                  <ActivityIndicator size="small" color="white" />
                  <Text style={styles.exportButtonText}>Exporting...</Text>
                </>
              ) : (
                <>
                  <Ionicons name="download-outline" size={20} color="white" />
                  <Text style={styles.exportButtonText}>Export Data</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        )}

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
    backgroundColor: '#1a1a1a',
  },
  segmentedControl: {
    flexDirection: 'row' as const,
    backgroundColor: '#404040',
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
    backgroundColor: '#2a2a2a',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  segmentButtonText: {
    fontSize: 15,
    fontWeight: '600' as const,
    color: '#b0b0b0',
  },
  segmentButtonTextActive: {
    color: '#ff6600',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 0,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#b0b0b0',
  },
  statsHeader: {
    flexDirection: 'row' as const,
    padding: 16,
    gap: 12,
  },
  statBox: {
    flex: 1,
    backgroundColor: '#2a2a2a',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center' as const,
  },
  clearDataBox: {
    justifyContent: 'center' as const,
  },
  statNumber: {
    fontSize: 28,
    fontWeight: 'bold' as const,
    color: '#ff6600',
  },
  statLabel: {
    fontSize: 12,
    color: '#b0b0b0',
    marginTop: 4,
  },
  statLabelSmall: {
    fontSize: 10,
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
    color: '#fff',
    marginTop: 16,
  },
  emptySubtitle: {
    fontSize: 16,
    color: '#b0b0b0',
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
    color: '#e5e5e5',
  },
  sortButton: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    backgroundColor: '#404040',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    gap: 4,
  },
  sortButtonActive: {
    backgroundColor: '#ff6600',
  },
  sortButtonText: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: '#e5e5e5',
  },
  sortButtonTextActive: {
    color: 'white',
  },
  teamList: {
    padding: 16,
    gap: 12,
  },
  teamCard: {
    backgroundColor: '#2a2a2a',
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
    color: '#fff',
  },
  teamMatches: {
    fontSize: 14,
    color: '#b0b0b0',
    marginTop: 2,
  },
  teamCardRight: {
    alignItems: 'flex-end' as const,
  },
  compositeScore: {
    fontSize: 28,
    fontWeight: 'bold' as const,
    color: '#ff6600',
  },
  compositeLabel: {
    fontSize: 12,
    color: '#b0b0b0',
  },
  expandIcon: {
    alignSelf: 'center' as const,
    marginTop: 8,
  },
  teamCardExpanded: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#404040',
  },
  pointsSummary: {
    flexDirection: 'row' as const,
    gap: 12,
    marginBottom: 16,
  },
  pointsBox: {
    flex: 1,
    backgroundColor: '#3a3a3a',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center' as const,
  },
  pointsValue: {
    fontSize: 24,
    fontWeight: 'bold' as const,
    color: '#ff6600',
  },
  pointsLabel: {
    fontSize: 11,
    color: '#b0b0b0',
    marginTop: 2,
  },
  sectionLabel: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: '#e5e5e5',
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
    color: '#e5e5e5',
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
    color: '#ff6600',
  },
  matchHistoryItem: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#404040',
  },
  matchHistoryInfo: {
    flex: 1,
  },
  matchHistoryText: {
    fontSize: 14,
    color: '#e5e5e5',
  },
  matchHistoryDate: {
    fontSize: 12,
    color: '#b0b0b0',
  },
  deleteMatchButton: {
    padding: 4,
    marginLeft: 8,
  },
  footer: {
    padding: 16,
    paddingBottom: 16,
  },
  syncButton: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: '#ff6600',
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
  exportContainer: {
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  exportButton: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: '#ff6600',
    paddingVertical: 12,
    borderRadius: 10,
    gap: 8,
  },
  exportButtonDisabled: {
    opacity: 0.7,
  },
  exportButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600' as const,
  },
};