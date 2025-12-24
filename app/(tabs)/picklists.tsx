// app/(tabs)/picklists.tsx
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
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
import DraggableFlatList, { RenderItemParams, ScaleDecorator } from 'react-native-draggable-flatlist';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getEventRankings } from '../../api/services/events';
import { ACTIVE_GAME_CONFIG, GameConfig } from '../../config/gameConfig';
import { analyticsService, TeamAnalytics } from '../../services/analyticsService';
import { db } from '../../services/database';
import { supabaseSyncService } from '../../services/supabase.sync';

const PICKLISTS_STORAGE_KEY = 'picklists';

interface RankedTeam {
  teamNumber: number;
  rank: number;
  analytics?: TeamAnalytics;
}

interface Picklists {
  firstPick: number[];
  secondPick: number[];
  doNotPick: number[];
}

export default function PicklistsScreen() {
  const [eventKey, setEventKey] = useState<string | null>(null);
  const [allRankedTeams, setAllRankedTeams] = useState<RankedTeam[]>([]); // All teams with ranks
  const [rankedTeams, setRankedTeams] = useState<RankedTeam[]>([]); // Only teams not in picklists
  const [teamAnalytics, setTeamAnalytics] = useState<Map<number, TeamAnalytics>>(new Map());
  const [picklists, setPicklists] = useState<Picklists>({
    firstPick: [],
    secondPick: [],
    doNotPick: [],
  });
  const [selectedTeam, setSelectedTeam] = useState<number | null>(null);
  const [longPressedTeam, setLongPressedTeam] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Load event key and picklists from storage
  useEffect(() => {
    const loadStorage = async () => {
      try {
        const storedEventKey = await AsyncStorage.getItem('selected_event_key');
        setEventKey(storedEventKey);

        const storedPicklists = await AsyncStorage.getItem(PICKLISTS_STORAGE_KEY);
        if (storedPicklists) {
          setPicklists(JSON.parse(storedPicklists));
        }
      } catch (error) {
        console.error('Error loading storage:', error);
      }
    };
    loadStorage();
  }, []);

  // Load rankings and analytics
  const loadData = useCallback(async (showRefresh = false) => {
    if (!eventKey) {
      setIsLoading(false);
      return;
    }

    try {
      if (showRefresh) setIsRefreshing(true);
      else setIsLoading(true);

      // Fetch rankings from TBA
      const rankings = await getEventRankings(eventKey);

      // Handle case where rankings might be undefined or empty
      if (!rankings || !Array.isArray(rankings)) {
        console.warn('Rankings data is not an array:', rankings);
        setRankedTeams([]);
        setIsLoading(false);
        setIsRefreshing(false);
        return;
      }

      // Extract team numbers from rankings
      const teamNumbers = rankings.map(r => {
        // Extract team number from team_key (e.g., "frc254" -> 254)
        const match = r.team_key.match(/frc(\d+)/);
        return match ? parseInt(match[1], 10) : null;
      }).filter((num): num is number => num !== null);

      // Fetch analytics from both local and Supabase
      const localMatches = await db.getAllMatches();
      const teamMatches = await supabaseSyncService.getAllTeamMatches();
      const allMatches = [...localMatches, ...teamMatches];
      const analytics = analyticsService.calculateTeamAnalytics(allMatches);
      setTeamAnalytics(analytics);

      // Create ranked teams list
      const ranked: RankedTeam[] = rankings
        .map(r => {
          const match = r.team_key.match(/frc(\d+)/);
          if (!match) return null;
          const teamNumber = parseInt(match[1], 10);
          return {
            teamNumber,
            rank: r.rank,
            analytics: analytics.get(teamNumber),
          } as RankedTeam;
        })
        .filter((team): team is RankedTeam => team !== null);

      // Get current picklists to filter
      const storedPicklists = await AsyncStorage.getItem(PICKLISTS_STORAGE_KEY);
      const currentPicklists: Picklists = storedPicklists 
        ? JSON.parse(storedPicklists) 
        : { firstPick: [], secondPick: [], doNotPick: [] };

      // Store all ranked teams
      setAllRankedTeams(ranked);

      // Store all ranked teams
      setAllRankedTeams(ranked);

      // Filter out teams that are already in picklists
      const picklistTeamNumbers = new Set([
        ...currentPicklists.firstPick,
        ...currentPicklists.secondPick,
        ...currentPicklists.doNotPick,
      ]);

      const availableTeams = ranked.filter(team => !picklistTeamNumbers.has(team.teamNumber));
      setRankedTeams(availableTeams);
    } catch (error) {
      console.error('Failed to load data:', error);
      Alert.alert('Error', 'Failed to load picklists data');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [eventKey]);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );


  // Move team from ranked list to picklist
  const moveToPicklist = (teamNumber: number, category: keyof Picklists) => {
    const newPicklists = { ...picklists };
    newPicklists[category] = [...newPicklists[category], teamNumber];
    
    // Update picklists state first
    setPicklists(newPicklists);
    
    // Save to storage
    AsyncStorage.setItem(PICKLISTS_STORAGE_KEY, JSON.stringify(newPicklists)).catch(console.error);
    
    // Update ranked teams list immediately without reload
    setAllRankedTeams(prevAll => {
      const picklistTeamNumbers = new Set([
        ...newPicklists.firstPick,
        ...newPicklists.secondPick,
        ...newPicklists.doNotPick,
      ]);
      const availableTeams = prevAll.filter((team: RankedTeam) => !picklistTeamNumbers.has(team.teamNumber));
      setRankedTeams(availableTeams);
      return prevAll;
    });
  };

  // Remove team from picklist and return to ranked list
  const removeFromPicklist = (teamNumber: number, category: keyof Picklists) => {
    const newPicklists = { ...picklists };
    newPicklists[category] = newPicklists[category].filter(num => num !== teamNumber);
    
    // Update picklists state first
    setPicklists(newPicklists);
    
    // Save to storage
    AsyncStorage.setItem(PICKLISTS_STORAGE_KEY, JSON.stringify(newPicklists)).catch(console.error);
    
    // Update ranked teams list immediately without reload
    setAllRankedTeams(prevAll => {
      const picklistTeamNumbers = new Set([
        ...newPicklists.firstPick,
        ...newPicklists.secondPick,
        ...newPicklists.doNotPick,
      ]);
      const availableTeams = prevAll.filter((team: RankedTeam) => !picklistTeamNumbers.has(team.teamNumber));
      setRankedTeams(availableTeams);
      return prevAll;
    });
  };

  // Reorder teams in a picklist
  const reorderPicklist = (category: keyof Picklists, fromIndex: number, toIndex: number) => {
    const newPicklists = { ...picklists };
    const [removed] = newPicklists[category].splice(fromIndex, 1);
    newPicklists[category].splice(toIndex, 0, removed);
    
    // Update state and save, no need to reload
    setPicklists(newPicklists);
    AsyncStorage.setItem(PICKLISTS_STORAGE_KEY, JSON.stringify(newPicklists)).catch(console.error);
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
        onLongPress={() => handleLongPressTeam(team.teamNumber)}
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
                  style={[styles.actionButton, styles.firstPickButton]}
                  onPress={() => moveToPicklist(team.teamNumber, 'firstPick')}
                >
                  <Text style={styles.actionButtonText}>First Pick</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.actionButton, styles.secondPickButton]}
                  onPress={() => moveToPicklist(team.teamNumber, 'secondPick')}
                >
                  <Text style={styles.actionButtonText}>Second Pick</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.actionButton, styles.doNotPickButton]}
                  onPress={() => moveToPicklist(team.teamNumber, 'doNotPick')}
                >
                  <Text style={styles.actionButtonText}>Do Not Pick</Text>
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
                onLongPress={drag}
                disabled={isActive}
                style={[styles.picklistItem, isActive && styles.picklistItemActive]}
              >
                <View style={styles.picklistItemContent}>
                  <Text style={styles.picklistTeamNumber}>Team {item}</Text>
                  {teamAnalytics.get(item) && (
                    <Text style={styles.picklistAvgPoints}>
                      {teamAnalytics.get(item)!.averagePoints.toFixed(1)} pts
                    </Text>
                  )}
                </View>
                <TouchableOpacity
                  onPress={() => removeFromPicklist(item, category)}
                  style={styles.removeButton}
                >
                  <Ionicons name="close-circle" size={20} color="#ef4444" />
                </TouchableOpacity>
              </TouchableOpacity>
            </ScaleDecorator>
          )}
          ListEmptyComponent={
            <View style={styles.emptyPicklist}>
              <Text style={styles.emptyPicklistText}>Drag teams here</Text>
            </View>
          }
        />
      </View>
    );
  };

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#ff6600" />
          <Text style={styles.loadingText}>Loading picklists...</Text>
        </View>
      </SafeAreaView>
    );
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
            <Text style={styles.sectionTitle}>Ranked Teams</Text>
            <TouchableOpacity onPress={() => loadData(true)}>
              <Ionicons name="refresh" size={24} color="#ff6600" />
            </TouchableOpacity>
          </View>
          <ScrollView
            style={styles.rankedTeamsList}
            refreshControl={
              <RefreshControl refreshing={isRefreshing} onRefresh={() => loadData(true)} />
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
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold' as const,
    color: '#fff',
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

