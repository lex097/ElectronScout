// app/(tabs)/picklists.tsx
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useQueryClient } from '@tanstack/react-query';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  Dimensions,
  RefreshControl,
  ScrollView,
  Text,
  TouchableOpacity,
  View
} from 'react-native';
import DraggableFlatList, { RenderItemParams, ScaleDecorator } from 'react-native-draggable-flatlist';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ACTIVE_GAME_CONFIG, GameConfig } from '../../config/gameConfig';
import { TeamAnalytics } from '../../services/analyticsService';
import { Picklists, picklistService } from '../../services/picklistService';
import { useAdminStore } from '../../stores/adminStore';
import { useAuthStore } from '../../stores/authStore';
import { usePicklistData, RankedTeam } from '../../hooks/usePicklistData';
import { queryKeys } from '../../config/queryKeys';

export default function PicklistsScreen() {
  const queryClient = useQueryClient();
  const [eventKey, setEventKey] = useState<string | null>(null);
  const [teamNumber, setTeamNumber] = useState<string | null>(null);
  const [selectedTeam, setSelectedTeam] = useState<number | null>(null);
  const [longPressedTeam, setLongPressedTeam] = useState<number | null>(null);
  const getTeamNumber = useAuthStore((state) => state.getTeamNumber);
  const isUnlockedFn = useAdminStore((state) => state.isUnlocked);
  const isAdminUnlocked = isUnlockedFn();

  useFocusEffect(
    useCallback(() => {
      const loadStorage = async () => {
        const storedEventKey = await AsyncStorage.getItem('selected_event_key');
        const tn = await getTeamNumber();
        setEventKey(storedEventKey);
        setTeamNumber(tn);
      };
      loadStorage();
    }, [getTeamNumber])
  );

  const { data, isLoading, isFetching, refetch } = usePicklistData(
    teamNumber,
    eventKey
  );

  const allRankedTeams = data?.allRankedTeams ?? [];
  const rankedTeams = data?.rankedTeams ?? [];
  const teamAnalytics = data?.teamAnalytics ?? new Map<number, TeamAnalytics>();
  const picklists = data?.picklists ?? {
    firstPick: [],
    secondPick: [],
    doNotPick: [],
  };

  // Move team from ranked list to picklist
  const moveToPicklist = async (teamNum: number, category: keyof Picklists) => {
    if (!isAdminUnlocked) {
      Alert.alert(
        'Admin Access Required',
        'You need to enter the admin code in the Admin tab to edit picklists.',
        [{ text: 'OK' }]
      );
      return;
    }
    if (!eventKey || !teamNumber) return;
    const newPicklists = { ...picklists };
    newPicklists[category] = [...newPicklists[category], teamNum];
    await picklistService.savePicklists(teamNumber, eventKey, newPicklists);
    queryClient.invalidateQueries({
      queryKey: queryKeys.picklists.byTeamAndEvent(teamNumber, eventKey),
    });
  };

  // Remove team from picklist and return to ranked list
  const removeFromPicklist = async (teamNum: number, category: keyof Picklists) => {
    if (!isAdminUnlocked) {
      Alert.alert(
        'Admin Access Required',
        'You need to enter the admin code in the Admin tab to edit picklists.',
        [{ text: 'OK' }]
      );
      return;
    }
    if (!eventKey || !teamNumber) return;
    const newPicklists = { ...picklists };
    newPicklists[category] = newPicklists[category].filter(num => num !== teamNum);
    await picklistService.savePicklists(teamNumber, eventKey, newPicklists);
    queryClient.invalidateQueries({
      queryKey: queryKeys.picklists.byTeamAndEvent(teamNumber, eventKey),
    });
  };

  // Reorder teams in a picklist
  const reorderPicklist = async (category: keyof Picklists, fromIndex: number, toIndex: number) => {
    if (!isAdminUnlocked) {
      Alert.alert(
        'Admin Access Required',
        'You need to enter the admin code in the Admin tab to edit picklists.',
        [{ text: 'OK' }]
      );
      return;
    }
    if (!eventKey || !teamNumber) return;
    const newPicklists = { ...picklists };
    const [removed] = newPicklists[category].splice(fromIndex, 1);
    newPicklists[category].splice(toIndex, 0, removed);
    await picklistService.savePicklists(teamNumber, eventKey, newPicklists);
    queryClient.invalidateQueries({
      queryKey: queryKeys.picklists.byTeamAndEvent(teamNumber, eventKey),
    });
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

  const getAllNotes = (teamNumber: number): Array<{ matchNumber: number; scouterId: string; notes: string }> => {
    const analytics = teamAnalytics.get(teamNumber);
    if (!analytics) return [];

    return analytics.matchHistory
      .filter(match => match.notes && match.notes.trim().length > 0)
      .map(match => ({
        matchNumber: match.matchNumber,
        scouterId: match.scouterId,
        notes: match.notes!,
      }));
  };

  const handleLongPressTeam = (teamNumber: number) => {
    // Check admin status before showing alert
    if (!isAdminUnlocked) {
      Alert.alert(
        'Admin Access Required',
        'You need to enter the admin code in the Admin tab to edit picklists.',
        [{ text: 'OK' }]
      );
      return;
    }

    setLongPressedTeam(teamNumber);
    Alert.alert(
      'Add Team to Picklist',
      `Choose a picklist for Team ${teamNumber}`,
      [
        {
          text: 'First Pick',
          onPress: () => {
            moveToPicklist(teamNumber, 'firstPick');
            setLongPressedTeam(null);
          },
          style: 'default',
        },
        {
          text: 'Second Pick',
          onPress: () => {
            moveToPicklist(teamNumber, 'secondPick');
            setLongPressedTeam(null);
          },
          style: 'default',
        },
        {
          text: 'Do Not Pick',
          onPress: () => {
            moveToPicklist(teamNumber, 'doNotPick');
            setLongPressedTeam(null);
          },
          style: 'destructive',
        },
        {
          text: 'Cancel',
          style: 'cancel',
          onPress: () => setLongPressedTeam(null),
        },
      ]
    );
  };

  const renderTeamCard = (team: RankedTeam, drag?: () => void, isActive?: boolean) => {
    const isExpanded = selectedTeam === team.teamNumber;
    const analytics = team.analytics;
    const isLongPressed = longPressedTeam === team.teamNumber;

    return (
      <TouchableOpacity
        style={[styles.teamCard, isLongPressed && styles.teamCardLongPressed]}
        onPress={() => {
          if (!isLongPressed) {
            setSelectedTeam(isExpanded ? null : team.teamNumber);
          }
        }}
        onLongPress={() => {
          if (isAdminUnlocked) {
            handleLongPressTeam(team.teamNumber);
          } else {
            Alert.alert(
              'Admin Access Required',
              'You need to enter the admin code in the Admin tab to edit picklists.',
              [{ text: 'OK' }]
            );
          }
        }}
        activeOpacity={0.7}
      >
          <View style={styles.teamCardHeader}>
            <View style={styles.teamCardLeft}>
              <Text style={styles.teamNumber}>#{team.rank} - Team {team.teamNumber}</Text>
              {analytics && (
                <Text style={styles.teamMatches}>{analytics.totalMatches} matches</Text>
              )}
            </View>
            {analytics && (
              <View style={styles.teamCardRight}>
                <Text style={styles.compositeScore}>{analytics.averagePoints.toFixed(1)}</Text>
                <Text style={styles.compositeLabel}>Avg Points</Text>
              </View>
            )}
          </View>

          {isExpanded && analytics && !isActive && (
            <View style={styles.teamCardExpanded}>
              <View style={styles.pointsSummary}>
                <View style={styles.pointsBox}>
                  <Text style={styles.pointsValue}>{getAveragePhasePoints(analytics, 'auto').toFixed(1)}</Text>
                  <Text style={styles.pointsLabel}>Avg Auto/Match</Text>
                </View>
                <View style={styles.pointsBox}>
                  <Text style={styles.pointsValue}>{getAveragePhasePoints(analytics, 'teleop').toFixed(1)}</Text>
                  <Text style={styles.pointsLabel}>Avg Teleop/Match</Text>
                </View>
                <View style={styles.pointsBox}>
                  <Text style={styles.pointsValue}>{getAveragePhasePoints(analytics, 'endgame').toFixed(1)}</Text>
                  <Text style={styles.pointsLabel}>Avg Endgame/Match</Text>
                </View>
              </View>

              <Text style={styles.sectionLabel}>Notes</Text>
              {getAllNotes(team.teamNumber).length > 0 ? (
                getAllNotes(team.teamNumber).map((note, index) => (
                  <View key={index} style={styles.noteItem}>
                    <Text style={styles.noteHeader}>
                      Match {note.matchNumber} - {note.scouterId}
                    </Text>
                    <Text style={styles.noteText}>{note.notes}</Text>
                  </View>
                ))
              ) : (
                <Text style={styles.noNotesText}>No notes available</Text>
              )}

              <View style={styles.actionButtons}>
                <TouchableOpacity
                  style={[styles.actionButton, styles.firstPickButton, !isAdminUnlocked && styles.actionButtonDisabled]}
                  onPress={() => moveToPicklist(team.teamNumber, 'firstPick')}
                  disabled={!isAdminUnlocked}
                >
                  <Text style={[styles.actionButtonText, !isAdminUnlocked && styles.actionButtonTextDisabled]}>First Pick</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.actionButton, styles.secondPickButton, !isAdminUnlocked && styles.actionButtonDisabled]}
                  onPress={() => moveToPicklist(team.teamNumber, 'secondPick')}
                  disabled={!isAdminUnlocked}
                >
                  <Text style={[styles.actionButtonText, !isAdminUnlocked && styles.actionButtonTextDisabled]}>Second Pick</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.actionButton, styles.doNotPickButton, !isAdminUnlocked && styles.actionButtonDisabled]}
                  onPress={() => moveToPicklist(team.teamNumber, 'doNotPick')}
                  disabled={!isAdminUnlocked}
                >
                  <Text style={[styles.actionButtonText, !isAdminUnlocked && styles.actionButtonTextDisabled]}>Do Not Pick</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {!isExpanded && !isLongPressed && (
            <Ionicons
              name="chevron-down"
              size={20}
              color="#b0b0b0"
              style={styles.expandIcon}
            />
          )}
          {isExpanded && !isLongPressed && (
            <Ionicons
              name="chevron-up"
              size={20}
              color="#b0b0b0"
              style={styles.expandIcon}
            />
          )}
          {isLongPressed && (
            <View style={styles.longPressIndicator}>
              <Ionicons name="hand-left-outline" size={20} color="#ff6600" />
              <Text style={styles.longPressText}>Select picklist above</Text>
            </View>
          )}
        </TouchableOpacity>
    );
  };

  const renderPicklistSection = (title: string, category: keyof Picklists, color: string) => {
    const teams = picklists[category];

    return (
      <View style={styles.picklistSection}>
        <View style={[styles.picklistHeader, { backgroundColor: color }]}>
          <Text style={styles.picklistTitle}>{title}</Text>
          <Text style={styles.picklistCount}>{teams.length}</Text>
        </View>
        <DraggableFlatList
          data={teams}
          keyExtractor={(item) => `picklist-${category}-${item}`}
          onDragEnd={({ data, from, to }) => {
            reorderPicklist(category, from, to);
          }}
          renderItem={({ item, drag, isActive }: RenderItemParams<number>) => (
            <ScaleDecorator>
              <TouchableOpacity
                onLongPress={isAdminUnlocked ? drag : undefined}
                disabled={isActive || !isAdminUnlocked}
                style={[styles.picklistItem, isActive && styles.picklistItemActive, !isAdminUnlocked && styles.picklistItemDisabled]}
              >
                <View style={styles.picklistItemContent}>
                  <Text style={styles.picklistTeamNumber}>Team {item}</Text>
                  {teamAnalytics.get(item) && (
                    <Text style={styles.picklistAvgPoints}>
                      {teamAnalytics.get(item)!.averagePoints.toFixed(1)} pts
                    </Text>
                  )}
                </View>
                {isAdminUnlocked && (
                  <TouchableOpacity
                    onPress={() => removeFromPicklist(item, category)}
                    style={styles.removeButton}
                  >
                    <Ionicons name="close-circle" size={20} color="#ef4444" />
                  </TouchableOpacity>
                )}
              </TouchableOpacity>
            </ScaleDecorator>
          )}
          ListEmptyComponent={
            <View style={styles.emptyPicklist}>
              <Text style={styles.emptyPicklistText}>Add teams here</Text>
            </View>
          }
        />
      </View>
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
    const screenHeight = Dimensions.get('window').height;
    const topSectionHeight = screenHeight * 0.5;
    const bottomSectionHeight = screenHeight * 0.5;

    return (
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <View style={styles.content}>
          {/* Top Section: Ranked Teams List Skeleton */}
          <View style={[styles.topSection, { height: topSectionHeight }]}>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionHeaderLeft}>
                <SkeletonBox width={120} height={18} style={{ marginBottom: 8, backgroundColor: '#3a3a3a' }} />
                <SkeletonBox width={200} height={12} style={{ backgroundColor: '#3a3a3a' }} />
              </View>
              <SkeletonBox width={24} height={24} style={{ borderRadius: 12, backgroundColor: '#3a3a3a' }} />
            </View>
            <ScrollView style={styles.rankedTeamsList}>
              {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
                <View key={i} style={styles.teamCard}>
                  <View style={styles.teamCardHeader}>
                    <View style={styles.teamCardLeft}>
                      <SkeletonBox width={150} height={18} style={{ marginBottom: 8, backgroundColor: '#3a3a3a' }} />
                      <SkeletonBox width={80} height={14} style={{ backgroundColor: '#3a3a3a' }} />
                    </View>
                    <View style={styles.teamCardRight}>
                      <SkeletonBox width={50} height={24} style={{ marginBottom: 8, backgroundColor: '#3a3a3a' }} />
                      <SkeletonBox width={70} height={12} style={{ backgroundColor: '#3a3a3a' }} />
                    </View>
                  </View>
                </View>
              ))}
            </ScrollView>
          </View>

          {/* Bottom Section: Picklists Skeleton */}
          <View style={[styles.bottomSection, { height: bottomSectionHeight }]}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.picklistsContainer}>
              {[0, 1, 2].map((idx) => {
                const colors = ['#10b981', '#ff6600', '#ef4444'];
                return (
                  <View key={idx} style={styles.picklistSection}>
                    <View style={[styles.picklistHeader, { backgroundColor: colors[idx] }]}>
                      <SkeletonBox width={100} height={18} style={{ backgroundColor: 'rgba(255, 255, 255, 0.3)', borderRadius: 4, opacity: 1 }} />
                      <SkeletonBox width={30} height={18} style={{ backgroundColor: 'rgba(255, 255, 255, 0.3)', borderRadius: 12, opacity: 1 }} />
                    </View>
                    {[1, 2, 3].map((i) => (
                      <View key={i} style={styles.picklistItem}>
                        <View style={styles.picklistItemContent}>
                          <SkeletonBox width={100} height={16} style={{ backgroundColor: '#3a3a3a' }} />
                          <SkeletonBox width={50} height={14} style={{ backgroundColor: '#3a3a3a' }} />
                        </View>
                      </View>
                    ))}
                  </View>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </SafeAreaView>
    );
  };

  if (isLoading) {
    return renderSkeletonLoader();
  }

  if (!eventKey) {
    return (
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <View style={styles.emptyState}>
          <Ionicons name="list-outline" size={64} color="#888" />
          <Text style={styles.emptyTitle}>No Event Selected</Text>
          <Text style={styles.emptySubtitle}>
            Please select an event in the Match Scouting tab to view picklists
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  const screenHeight = Dimensions.get('window').height;
  const topSectionHeight = screenHeight * 0.5;
  const bottomSectionHeight = screenHeight * 0.5;

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <View style={styles.content}>
        {/* Top Section: Ranked Teams List */}
        <View style={[styles.topSection, { height: topSectionHeight }]}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionHeaderLeft}>
              <Text style={styles.sectionTitle}>Ranked Teams</Text>
              <Text style={styles.hintText}>Hold down on a team to add to picklist</Text>
            </View>
            <TouchableOpacity onPress={() => refetch()}>
              <Ionicons name="refresh" size={24} color="#ff6600" />
            </TouchableOpacity>
          </View>
          <ScrollView
            style={styles.rankedTeamsList}
            refreshControl={
              <RefreshControl refreshing={isFetching} onRefresh={() => refetch()} />
            }
          >
            {rankedTeams.map((team) => (
              <View key={`ranked-${team.teamNumber}`}>
                {renderTeamCard(team)}
              </View>
            ))}
            {rankedTeams.length === 0 && (
              <View style={styles.emptyState}>
                <Text style={styles.emptySubtitle}>No teams available</Text>
              </View>
            )}
          </ScrollView>
        </View>

        {/* Bottom Section: Picklists */}
        <View style={[styles.bottomSection, { height: bottomSectionHeight }]}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.picklistsContainer}>
            {renderPicklistSection('First Pick', 'firstPick', '#10b981')}
            {renderPicklistSection('Second Pick', 'secondPick', '#ff6600')}
            {renderPicklistSection('Do Not Pick', 'doNotPick', '#ef4444')}
          </ScrollView>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = {
  container: {
    flex: 1,
    backgroundColor: '#1a1a1a',
  },
  content: {
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
    color: '#b0b0b0',
  },
  emptyState: {
    flex: 1,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    padding: 48,
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
  topSection: {
    borderBottomWidth: 2,
    borderBottomColor: '#404040',
    marginBottom: 0,
  },
  sectionHeader: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    padding: 16,
    backgroundColor: '#2a2a2a',
    borderBottomWidth: 1,
    borderBottomColor: '#404040',
  },
  sectionHeaderLeft: {
    flex: 1,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold' as const,
    color: '#fff',
    marginBottom: 4,
  },
  hintText: {
    fontSize: 12,
    color: '#888',
    fontStyle: 'italic' as const,
  },
  bottomSection: {
    backgroundColor: '#1a1a1a',
    marginTop: 0,
    paddingTop: 0,
  },
  picklistsContainer: {
    flex: 1,
  },
  teamCard: {
    backgroundColor: '#2a2a2a',
    borderRadius: 12,
    padding: 16,
    marginHorizontal: 16,
    marginVertical: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  rankedTeamsList: {
    flex: 1,
  },
  teamCardLongPressed: {
    backgroundColor: '#3a3a3a',
    borderWidth: 2,
    borderColor: '#ff6600',
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
    fontSize: 18,
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
    fontSize: 24,
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
    fontSize: 20,
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
  noteItem: {
    backgroundColor: '#3a3a3a',
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
  },
  noteHeader: {
    fontSize: 12,
    fontWeight: '600' as const,
    color: '#b0b0b0',
    marginBottom: 4,
  },
  noteText: {
    fontSize: 14,
    color: '#e5e5e5',
  },
  noNotesText: {
    fontSize: 14,
    color: '#888',
    fontStyle: 'italic' as const,
  },
  actionButtons: {
    flexDirection: 'row' as const,
    gap: 8,
    marginTop: 16,
  },
  actionButton: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    alignItems: 'center' as const,
  },
  firstPickButton: {
    backgroundColor: '#10b981',
  },
  secondPickButton: {
    backgroundColor: '#ff6600',
  },
  doNotPickButton: {
    backgroundColor: '#ef4444',
  },
  actionButtonText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600' as const,
  },
  actionButtonDisabled: {
    opacity: 0.5,
  },
  actionButtonTextDisabled: {
    opacity: 0.7,
  },
  picklistSection: {
    width: Dimensions.get('window').width * 0.85,
    marginRight: 16,
    backgroundColor: '#2a2a2a',
    borderRadius: 12,
    marginTop: 0,
    marginBottom: 16,
    marginLeft: 16,
    overflow: 'hidden' as const,
  },
  picklistHeader: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    padding: 16,
  },
  picklistTitle: {
    fontSize: 18,
    fontWeight: 'bold' as const,
    color: 'white',
  },
  picklistCount: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: 'white',
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  picklistItem: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#404040',
    backgroundColor: '#2a2a2a',
  },
  picklistItemActive: {
    backgroundColor: '#3a3a3a',
    elevation: 4,
  },
  picklistItemDisabled: {
    opacity: 0.7,
  },
  picklistItemContent: {
    flex: 1,
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
  },
  picklistTeamNumber: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: '#fff',
  },
  picklistAvgPoints: {
    fontSize: 14,
    color: '#b0b0b0',
  },
  removeButton: {
    padding: 4,
    marginLeft: 8,
  },
  emptyPicklist: {
    padding: 32,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  emptyPicklistText: {
    fontSize: 14,
    color: '#888',
    fontStyle: 'italic' as const,
  },
  longPressIndicator: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    marginTop: 8,
    padding: 8,
    backgroundColor: '#3a3a3a',
    borderRadius: 8,
    gap: 8,
  },
  longPressText: {
    fontSize: 12,
    color: '#ff6600',
    fontWeight: '600' as const,
  },
};

