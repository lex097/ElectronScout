// app/(tabs)/analytics.tsx
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useQueryClient } from '@tanstack/react-query';
import { useFocusEffect } from '@react-navigation/native';
import { router } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  Modal,
  RefreshControl,
  ScrollView,
  StyleSheet,
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
import { chunkMatchesForQR } from '../../services/qrCodeService';
import { syncManager } from '../../services/syncTransformer';
import { useAdminStore } from '../../stores/adminStore';
import { useQrCodeStore } from '../../stores/qrCodeStore';
import { MatchData } from '../../types/match';
import { useAnalyticsTeam } from '../../hooks/useAnalytics';
import { queryKeys } from '../../config/queryKeys';
import { supabaseSyncService } from '../../services/supabase.sync';

type SortField = 'avgScore' | 'avgAuto' | 'avgTeleop' | 'avgEndgame';
type SortDirection = 'asc' | 'desc';
type DataSource = 'local' | 'team';
type AllianceFilter = 'overall' | 'red' | 'blue';

export default function AnalyticsScreen() {
  const queryClient = useQueryClient();
  const [eventKey, setEventKey] = useState<string | null>(null);
  const [sortField, setSortField] = useState<SortField>('avgScore');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [selectedTeam, setSelectedTeam] = useState<number | null>(null);
  const [allianceFilterByTeam, setAllianceFilterByTeam] = useState<Record<number, AllianceFilter>>({});
  const [isSyncing, setIsSyncing] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [dataSource, setDataSource] = useState<DataSource>('local');
  const [surveyMatchForModal, setSurveyMatchForModal] = useState<MatchData | null>(null);
  const [surveyModalVisible, setSurveyModalVisible] = useState(false); // Keeps modal mounted during exit animation
  const [showQrModal, setShowQrModal] = useState(false);
  const [selectedMatchIds, setSelectedMatchIds] = useState<Set<string>>(new Set());
  const setQrChunks = useQrCodeStore((s) => s.setChunks);
  const isAdminUnlocked = useAdminStore((s) => s.isUnlocked());
  const backdropOpacity = useRef(new Animated.Value(0)).current;
  const contentTranslateY = useRef(new Animated.Value(Dimensions.get('window').height)).current;

  // My Data: load directly from local SQLite, no caching - display immediately
  const [localMatches, setLocalMatches] = useState<MatchData[]>([]);
  const [localTeamAnalytics, setLocalTeamAnalytics] = useState<Map<number, TeamAnalytics>>(new Map());

  const teamQuery = useAnalyticsTeam(eventKey);
  const teamMatches = teamQuery.data?.matches ?? [];
  const teamTeamAnalytics = teamQuery.data?.teamAnalytics ?? new Map<number, TeamAnalytics>();

  // Survey modal: backdrop fades in (fixed), content slides up
  useEffect(() => {
    if (surveyMatchForModal) {
      setSurveyModalVisible(true);
      backdropOpacity.setValue(0);
      contentTranslateY.setValue(Dimensions.get('window').height);
      Animated.parallel([
        Animated.timing(backdropOpacity, { toValue: 1, duration: 200, useNativeDriver: true }),
        Animated.spring(contentTranslateY, {
          toValue: 0,
          useNativeDriver: true,
          tension: 65,
          friction: 11,
        }),
      ]).start();
    }
  }, [surveyMatchForModal]);

  const closeSurveyModal = useCallback(() => {
    Animated.parallel([
      Animated.timing(backdropOpacity, { toValue: 0, duration: 200, useNativeDriver: true }),
      Animated.timing(contentTranslateY, {
        toValue: Dimensions.get('window').height,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setSurveyMatchForModal(null);
      setSurveyModalVisible(false);
    });
  }, [backdropOpacity, contentTranslateY]);

  const loadLocalData = useCallback(async () => {
    const allMatches = await db.getAllMatches();
    const deletedIds = await supabaseSyncService.getDeletedMatchIds();
    const filtered = allMatches.filter((m) => !deletedIds.has(m.id));
    setLocalMatches(filtered);
    setLocalTeamAnalytics(
      filtered.length > 0 ? analyticsService.calculateTeamAnalytics(filtered) : new Map()
    );
  }, []);

  useFocusEffect(
    useCallback(() => {
      AsyncStorage.getItem('selected_event_key').then(setEventKey);
      loadLocalData();
    }, [loadLocalData])
  );

  const matches = dataSource === 'local' ? localMatches : teamMatches;
  const teamAnalytics = dataSource === 'local' ? localTeamAnalytics : teamTeamAnalytics;
  const isLoading = dataSource === 'local' ? false : teamQuery.isLoading;
  const isFetching = dataSource === 'local' ? false : teamQuery.isFetching;
  const refetch = dataSource === 'local' ? loadLocalData : teamQuery.refetch;

  // QR modal: init all matches selected when opening
  useEffect(() => {
    if (showQrModal && matches.length > 0) {
      setSelectedMatchIds(new Set(matches.map((m) => m.id)));
    }
  }, [showQrModal, matches]);

  const toggleMatchSelection = useCallback((matchId: string) => {
    setSelectedMatchIds((prev) => {
      const next = new Set(prev);
      if (next.has(matchId)) next.delete(matchId);
      else next.add(matchId);
      return next;
    });
  }, []);

  const selectAllMatches = useCallback(() => {
    setSelectedMatchIds(new Set(matches.map((m) => m.id)));
  }, [matches]);

  const handleOpenQrModal = useCallback(() => {
    if (matches.length === 0) {
      Alert.alert('No Data', 'No matches to share via QR code.');
      return;
    }
    setShowQrModal(true);
  }, [matches.length]);

  const handleGenerateQrCodes = useCallback(async () => {
    const selected = matches.filter((m) => selectedMatchIds.has(m.id));
    if (selected.length === 0) {
      Alert.alert('Select Matches', 'Please select at least one match to include.');
      return;
    }
    const evtKey = dataSource === 'team' ? eventKey : await AsyncStorage.getItem('selected_event_key');
    const chunks = chunkMatchesForQR(selected, evtKey || null);
    setQrChunks(chunks);
    setShowQrModal(false);
    router.push('/qr-codes' as any);
  }, [matches, selectedMatchIds, dataSource, eventKey, setQrChunks]);

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
            loadLocalData();
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
              loadLocalData();
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

      await loadLocalData();
      if (eventKey) {
        queryClient.invalidateQueries({ queryKey: queryKeys.analytics.team(eventKey) });
      }

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

  const getMatchPointsData = (team: TeamAnalytics, filterMatches?: MatchData[]) => {
    const matchesToUse = filterMatches ?? team.matchHistory;
    const sortedMatches = [...matchesToUse].sort((a, b) => a.matchNumber - b.matchNumber);
    const points = sortedMatches.map(match => calculateMatchPoints(match.metrics));
    const labels = sortedMatches.map(match => `M${match.matchNumber}`);
    return { points, labels };
  };

  /** Get matches filtered by alliance for a team */
  const getFilteredMatches = (team: TeamAnalytics, filter: AllianceFilter): MatchData[] => {
    if (filter === 'overall') return team.matchHistory;
    return team.matchHistory.filter((m) => m.allianceColor === filter);
  };

  /** Get average phase points for filtered matches */
  const getFilteredAveragePhasePoints = (
    team: TeamAnalytics,
    phaseId: string,
    filter: AllianceFilter
  ): number => {
    const filtered = getFilteredMatches(team, filter);
    if (filtered.length === 0) return 0;
    const total = filtered.reduce((sum, m) => sum + calculatePhasePoints(m.metrics, phaseId), 0);
    return Math.round((total / filtered.length) * 10) / 10;
  };

  /** Get filtered average total points */
  const getFilteredAveragePoints = (team: TeamAnalytics, filter: AllianceFilter): number => {
    const filtered = getFilteredMatches(team, filter);
    if (filtered.length === 0) return 0;
    const total = filtered.reduce((sum, m) => sum + calculateMatchPoints(m.metrics), 0);
    return Math.round((total / filtered.length) * 100) / 100;
  };

  /** Get survey rating averages for a team (from survey.defense, survey.driving, etc.) */
  const getSurveyRatingAverages = (
    team: TeamAnalytics,
    filter: AllianceFilter
  ): Array<{ label: string; average: number; count: number }> => {
    const filtered = getFilteredMatches(team, filter);
    const ratingQuestions = ACTIVE_GAME_CONFIG.survey.filter((q) => q.type === 'rating');
    if (ratingQuestions.length === 0) return [];
    return ratingQuestions.map((q) => {
      const values = filtered
        .map((m) => m.survey?.[q.id])
        .filter((v): v is number => typeof v === 'number' && v >= 1 && v <= 5);
      const count = values.length;
      const average =
        count > 0
          ? Math.round((values.reduce((s, v) => s + v, 0) / count) * 10) / 10
          : 0;
      return { label: q.label, average, count };
    });
  };

  /** Get filtered metrics stats (avg, max, min) for display */
  const getFilteredMetrics = (
    team: TeamAnalytics,
    filter: AllianceFilter
  ): TeamAnalytics['metrics'] => {
    const filtered = getFilteredMatches(team, filter);
    if (filtered.length === 0) return {};
    const metrics: TeamAnalytics['metrics'] = {};
    const metricKeys = new Set<string>();
    filtered.forEach((m) => Object.keys(m.metrics).forEach((k) => metricKeys.add(k)));
    metricKeys.forEach((key) => {
      const values = filtered
        .map((m) => m.metrics[key])
        .filter((v): v is number => typeof v === 'number');
      if (values.length > 0) {
        const total = values.reduce((s, v) => s + v, 0);
        metrics[key] = {
          average: Math.round((total / values.length) * 100) / 100,
          total,
          max: Math.max(...values),
          min: Math.min(...values),
          stdDev: 0,
        };
      }
    });
    return metrics;
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
    const allianceFilter = allianceFilterByTeam[team.teamNumber] ?? 'overall';
    const filteredMatches = getFilteredMatches(team, allianceFilter);
    const setAllianceFilter = (f: AllianceFilter) =>
      setAllianceFilterByTeam((prev) => ({ ...prev, [team.teamNumber]: f }));

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
            {/* Alliance filter - above auto/teleop/endgame */}
            <View style={styles.allianceFilterRow}>
              <TouchableOpacity
                style={[
                  styles.allianceFilterButton,
                  allianceFilter === 'overall' && styles.allianceFilterButtonActive,
                ]}
                onPress={() => setAllianceFilter('overall')}
              >
                <Text
                  style={[
                    styles.allianceFilterButtonText,
                    allianceFilter === 'overall' && styles.allianceFilterButtonTextActive,
                  ]}
                >
                  Overall
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.allianceFilterButton,
                  styles.redAllianceFilterButton,
                  allianceFilter === 'red' && styles.redAllianceFilterButtonActive,
                ]}
                onPress={() => setAllianceFilter('red')}
              >
                <Text
                  style={[
                    styles.allianceFilterButtonText,
                    allianceFilter === 'red' && styles.allianceFilterButtonTextActive,
                  ]}
                >
                  Red
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.allianceFilterButton,
                  styles.blueAllianceFilterButton,
                  allianceFilter === 'blue' && styles.blueAllianceFilterButtonActive,
                ]}
                onPress={() => setAllianceFilter('blue')}
              >
                <Text
                  style={[
                    styles.allianceFilterButtonText,
                    allianceFilter === 'blue' && styles.allianceFilterButtonTextActive,
                  ]}
                >
                  Blue
                </Text>
              </TouchableOpacity>
            </View>

            <View style={styles.pointsSummary}>
              <View style={styles.pointsBox}>
                <Text style={styles.pointsValue}>
                  {getFilteredAveragePhasePoints(team, 'auto', allianceFilter).toFixed(1)}
                </Text>
                <Text style={styles.pointsLabel}>Avg Auto/Match</Text>
              </View>
              <View style={styles.pointsBox}>
                <Text style={styles.pointsValue}>
                  {getFilteredAveragePhasePoints(team, 'teleop', allianceFilter).toFixed(1)}
                </Text>
                <Text style={styles.pointsLabel}>Avg Teleop/Match</Text>
              </View>
              <View style={styles.pointsBox}>
                <Text style={styles.pointsValue}>
                  {getFilteredAveragePhasePoints(team, 'endgame', allianceFilter).toFixed(1)}
                </Text>
                <Text style={styles.pointsLabel}>Avg Endgame/Match</Text>
              </View>
            </View>

            {allianceFilter !== 'overall' && (
              <Text style={styles.filteredMatchCount}>
                {filteredMatches.length} match{filteredMatches.length !== 1 ? 'es' : ''} on {allianceFilter} alliance
              </Text>
            )}

            <View style={styles.progressChartContainer}>
              <Text style={styles.sectionLabel}>Performance Progress</Text>
              {filteredMatches.length > 0 && (() => {
                const { points, labels } = getMatchPointsData(team, filteredMatches);
                const maxPoints = getMaxPointsAcrossAllTeams();
                
                return (
                  <View style={{ marginVertical: 8 }}>
                    <PerformanceChart points={points} labels={labels} maxPoints={maxPoints} />
                  </View>
                );
              })()}
            </View>

            <Text style={styles.sectionLabel}>Metrics Breakdown</Text>
            {Object.entries(
              allianceFilter === 'overall' ? team.metrics : getFilteredMetrics(team, allianceFilter)
            ).map(([metricId, stats]) => {
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

            {getSurveyRatingAverages(team, allianceFilter).length > 0 && (
              <>
                <Text style={styles.sectionLabel}>Survey Ratings (Avg)</Text>
                {getSurveyRatingAverages(team, allianceFilter).map(({ label, average, count }) => (
                  <View key={label} style={styles.metricRow}>
                    <Text style={styles.metricName}>{label}</Text>
                    <Text style={styles.statValue}>
                      {average > 0 ? average.toFixed(1) : '-'} ({count})
                    </Text>
                  </View>
                ))}
              </>
            )}

            <Text style={styles.sectionLabel}>Recent Matches</Text>
            {filteredMatches.slice(-3).reverse().map(match => (
              <View key={match.id} style={styles.matchHistoryItem}>
                <View style={styles.matchHistoryInfo}>
                <Text style={styles.matchHistoryText}>
                  Match {match.matchNumber}
                </Text>
                <Text style={styles.matchHistoryDate}>
                  {new Date(match.timestamp).toLocaleDateString()}
                </Text>
                </View>
                <View style={styles.matchHistoryActions}>
                  <TouchableOpacity
                    onPress={() => setSurveyMatchForModal(match)}
                    style={styles.notesMatchButton}
                  >
                    <Ionicons name="document-text-outline" size={22} color="#ff6600" />
                    <Text style={styles.notesMatchButtonText}>Notes</Text>
                  </TouchableOpacity>
                  {dataSource === 'local' && (
                    <TouchableOpacity
                      onPress={() => handleDeleteMatch(match.id, match.matchNumber, team.teamNumber)}
                      style={styles.deleteMatchButton}
                    >
                      <Ionicons name="close-circle" size={24} color="#ef4444" />
                    </TouchableOpacity>
                  )}
                </View>
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

  if (dataSource === 'team' && !eventKey) {
    return (
      <SafeAreaView style={styles.container} edges={[]}>
        <View style={styles.emptyState}>
          <Ionicons name="stats-chart-outline" size={64} color="#9ca3af" />
          <Text style={styles.emptyTitle}>No Event Selected</Text>
          <Text style={styles.emptySubtitle}>
            Please select an event to view team analytics
          </Text>
        </View>
      </SafeAreaView>
    );
  }

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
          <RefreshControl refreshing={isFetching} onRefresh={() => refetch()} />
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

        {/* Scan QR Codes - Only in My Data, only for admins */}
        {dataSource === 'local' && isAdminUnlocked && (
          <View style={styles.scanQrContainer}>
            <TouchableOpacity
              style={styles.scanQrButton}
              onPress={() => router.push('/scan-qr' as any)}
            >
              <Ionicons name="scan-outline" size={20} color="white" />
              <Text style={styles.scanQrButtonText}>Scan QR Codes</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Export Button - Only in Team Data, above cards */}
        {dataSource === 'team' && teamMatches.length > 0 && (
          <View style={styles.scanQrContainer}>
            <TouchableOpacity
              style={[styles.scanQrButton, isExporting && styles.syncButtonDisabled]}
              onPress={handleExport}
              disabled={isExporting}
            >
              {isExporting ? (
                <>
                  <ActivityIndicator size="small" color="white" />
                  <Text style={styles.scanQrButtonText}>Exporting...</Text>
                </>
              ) : (
                <>
                  <Ionicons name="download-outline" size={20} color="white" />
                  <Text style={styles.scanQrButtonText}>Export Data</Text>
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
            {localMatches.length > 0 && (
              <TouchableOpacity
                style={styles.syncButton}
                onPress={handleOpenQrModal}
              >
                <Ionicons name="qr-code-outline" size={20} color="white" />
                <Text style={styles.syncButtonText}>Generate QR Codes</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </ScrollView>

      {/* Survey Results Modal - backdrop fades in place, content slides up */}
      <Modal
        visible={surveyModalVisible}
        animationType="none"
        transparent
        onRequestClose={closeSurveyModal}
      >
        <View style={styles.surveyModalContainer}>
          <Animated.View
            style={[StyleSheet.absoluteFill, styles.surveyModalBackdrop, { opacity: backdropOpacity }]}
            pointerEvents="none"
          />
          <TouchableOpacity
            style={styles.surveyModalBackdropTapArea}
            activeOpacity={1}
            onPress={closeSurveyModal}
          />
          <Animated.View
            style={[
              styles.surveyModalContentWrapper,
              { transform: [{ translateY: contentTranslateY }] },
            ]}
            onStartShouldSetResponder={() => true}
          >
            <View style={styles.surveyModalContent}>
            {surveyMatchForModal && (
              <>
                <View style={styles.surveyModalHeader}>
                  <Text style={styles.surveyModalTitle}>
                    Match {surveyMatchForModal.matchNumber} – Team {surveyMatchForModal.teamNumber}
                  </Text>
                  <TouchableOpacity onPress={closeSurveyModal}>
                    <Text style={styles.surveyModalClose}>Close</Text>
                  </TouchableOpacity>
                </View>
                <ScrollView
                  style={styles.surveyModalScroll}
                  contentContainerStyle={styles.surveyModalScrollContent}
                  showsVerticalScrollIndicator
                >
                  {ACTIVE_GAME_CONFIG.survey.map((q) => {
                    const val = surveyMatchForModal.survey?.[q.id];
                    let display: string;
                    if (q.type === 'rating') {
                      display = typeof val === 'number' ? `${val}/5` : '-';
                    } else if (q.type === 'singleChoice') {
                      display = typeof val === 'string' ? val : '-';
                    } else if (q.type === 'multipleChoice') {
                      display = Array.isArray(val) ? val.join(', ') || '-' : '-';
                    } else {
                      display = typeof val === 'string' ? val || '-' : '-';
                    }
                    return (
                      <View key={q.id} style={styles.surveyModalRow}>
                        <Text style={styles.surveyModalLabel}>{q.label}</Text>
                        <Text style={styles.surveyModalValue}>{display}</Text>
                      </View>
                    );
                  })}
                </ScrollView>
              </>
            )}
            </View>
          </Animated.View>
        </View>
      </Modal>

      {/* QR Code Match Selection Modal */}
      <Modal
        visible={showQrModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowQrModal(false)}
      >
        <TouchableOpacity
          style={styles.qrModalOverlay}
          activeOpacity={1}
          onPress={() => setShowQrModal(false)}
        >
          <TouchableOpacity
            activeOpacity={1}
            onPress={(e) => e.stopPropagation()}
            style={styles.qrModalContent}
          >
            <Text style={styles.qrModalTitle}>Matches to include</Text>
            <Text style={styles.qrModalSubtitle}>
              Up to 15 matches per QR code. Select matches to share.
            </Text>
            <TouchableOpacity style={styles.qrModalSelectAll} onPress={selectAllMatches}>
              <Text style={styles.qrModalSelectAllText}>Select All</Text>
            </TouchableOpacity>
            <ScrollView style={styles.qrModalScroll} showsVerticalScrollIndicator>
              {[...matches]
                .sort((a, b) => a.matchNumber - b.matchNumber || a.teamNumber - b.teamNumber)
                .map((match) => (
                  <TouchableOpacity
                    key={match.id}
                    style={styles.qrModalRow}
                    onPress={() => toggleMatchSelection(match.id)}
                    activeOpacity={0.7}
                  >
                    <View
                      style={[
                        styles.qrModalCheckbox,
                        selectedMatchIds.has(match.id) && styles.qrModalCheckboxChecked,
                      ]}
                    >
                      {selectedMatchIds.has(match.id) && (
                        <Text style={styles.qrModalCheck}>✓</Text>
                      )}
                    </View>
                    <Text style={styles.qrModalMatchText}>
                      Match {match.matchNumber} • Team {match.teamNumber}
                    </Text>
                  </TouchableOpacity>
                ))}
            </ScrollView>
            <View style={styles.qrModalActions}>
              <TouchableOpacity
                style={styles.qrModalCancelButton}
                onPress={() => setShowQrModal(false)}
              >
                <Text style={styles.qrModalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.qrModalGenerateButton}
                onPress={handleGenerateQrCodes}
              >
                <Text style={styles.qrModalGenerateText}>Generate</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
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
  allianceFilterRow: {
    flexDirection: 'row' as const,
    gap: 8,
    marginBottom: 16,
  },
  allianceFilterButton: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    alignItems: 'center' as const,
    backgroundColor: '#404040',
    borderWidth: 2,
    borderColor: '#505050',
  },
  allianceFilterButtonActive: {
    backgroundColor: '#2a2a2a',
    borderColor: '#ff6600',
  },
  redAllianceFilterButton: {
    backgroundColor: '#2a2222',
    borderColor: '#5a4040',
  },
  redAllianceFilterButtonActive: {
    backgroundColor: '#3a2a2a',
    borderColor: '#ef4444',
  },
  blueAllianceFilterButton: {
    backgroundColor: '#22222a',
    borderColor: '#40405a',
  },
  blueAllianceFilterButtonActive: {
    backgroundColor: '#2a2a3a',
    borderColor: '#3b82f6',
  },
  allianceFilterButtonText: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: '#888',
  },
  allianceFilterButtonTextActive: {
    color: '#fff',
  },
  filteredMatchCount: {
    fontSize: 12,
    color: '#b0b0b0',
    marginBottom: 12,
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
  matchHistoryActions: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 8,
  },
  notesMatchButton: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 4,
    padding: 4,
  },
  notesMatchButtonText: {
    fontSize: 13,
    color: '#ff6600',
    fontWeight: '600' as const,
  },
  deleteMatchButton: {
    padding: 4,
  },
  surveyModalContainer: {
    flex: 1,
  },
  surveyModalBackdrop: {
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  surveyModalBackdropTapArea: {
    ...StyleSheet.absoluteFillObject,
  },
  surveyModalContentWrapper: {
    position: 'absolute' as const,
    left: 0,
    right: 0,
    bottom: 0,
    height: Dimensions.get('window').height * 0.85,
  },
  surveyModalContent: {
    flex: 1,
    backgroundColor: '#1a1a1a',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  surveyModalHeader: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#404040',
  },
  surveyModalTitle: {
    fontSize: 18,
    fontWeight: 'bold' as const,
    color: '#ff6600',
  },
  surveyModalClose: {
    fontSize: 16,
    color: '#b0b0b0',
  },
  surveyModalScroll: {
    flex: 1,
  },
  surveyModalScrollContent: {
    padding: 20,
    paddingBottom: 40,
  },
  surveyModalRow: {
    marginBottom: 16,
  },
  surveyModalLabel: {
    fontSize: 14,
    color: '#b0b0b0',
    marginBottom: 4,
  },
  surveyModalValue: {
    fontSize: 16,
    color: '#fff',
  },
  footer: {
    padding: 16,
    paddingBottom: 16,
    gap: 12,
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
  scanQrContainer: {
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  scanQrButton: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: '#ff6600',
    paddingVertical: 12,
    borderRadius: 10,
    gap: 8,
  },
  scanQrButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600' as const,
  },
  qrModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    padding: 24,
  },
  qrModalContent: {
    backgroundColor: '#2a2a2a',
    borderRadius: 12,
    padding: 20,
    width: 360,
    maxWidth: 360,
    maxHeight: 400,
  },
  qrModalTitle: {
    fontSize: 18,
    fontWeight: 'bold' as const,
    color: '#fff',
    marginBottom: 4,
  },
  qrModalSubtitle: {
    fontSize: 13,
    color: '#b0b0b0',
    marginBottom: 12,
  },
  qrModalSelectAll: {
    alignSelf: 'flex-start' as const,
    paddingVertical: 8,
    paddingHorizontal: 0,
    marginBottom: 12,
  },
  qrModalSelectAllText: {
    color: '#ff6600',
    fontSize: 14,
    fontWeight: '600' as const,
  },
  qrModalScroll: {
    maxHeight: 280,
    marginBottom: 16,
  },
  qrModalRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    paddingVertical: 12,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#404040',
  },
  qrModalCheckbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#666',
    marginRight: 12,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  qrModalCheckboxChecked: {
    backgroundColor: '#ff6600',
    borderColor: '#ff6600',
  },
  qrModalCheck: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold' as const,
  },
  qrModalMatchText: {
    fontSize: 16,
    color: '#fff',
  },
  qrModalActions: {
    flexDirection: 'row' as const,
    gap: 12,
    justifyContent: 'flex-end' as const,
  },
  qrModalCancelButton: {
    paddingVertical: 10,
    paddingHorizontal: 20,
  },
  qrModalCancelText: {
    color: '#b0b0b0',
    fontSize: 16,
  },
  qrModalGenerateButton: {
    backgroundColor: '#ff6600',
    paddingVertical: 10,
    paddingHorizontal: 24,
    borderRadius: 8,
    minWidth: 100,
    alignItems: 'center' as const,
  },
  qrModalGenerateText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600' as const,
  },
};