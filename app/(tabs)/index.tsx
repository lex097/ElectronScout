// app/(tabs)/index.tsx - Match Scouting Screen
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from '@react-navigation/native';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Dimensions, NativeScrollEvent, NativeSyntheticEvent, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { RapidCounterInput } from '../../components/RapidCounterInput';
import { ACTIVE_GAME_CONFIG, getInitialMatchData, Metric } from '../../config/gameConfig';
import { db } from '../../services/database';
import { useAuthStore } from '../../stores/authStore';
import { MatchData } from '../../types/match';

const TBA_MODE_KEY = 'tba_mode_enabled';
const SELECTED_EVENT_KEY = 'selected_event_key';
const SELECTED_EVENT_NAME_KEY = 'selected_event_name';
const SELECTED_MATCH_KEY = 'selected_match_key';
const SELECTED_MATCH_NUMBER_KEY = 'selected_match_number';

export default function MatchScoutScreen() {
  const params = useLocalSearchParams<{
    matchNumber?: string;
    teamNumber?: string;
    fromTBA?: string;
  }>();

  const [isTBAMode, setIsTBAMode] = useState(true);
  const [matchNumber, setMatchNumber] = useState('1');
  const [teamNumber, setTeamNumber] = useState('');
  const [selectedEventName, setSelectedEventName] = useState<string | null>(null);
  const [selectedMatchNumber, setSelectedMatchNumber] = useState<string | null>(null);
  const [currentPhaseIndex, setCurrentPhaseIndex] = useState(0);
  const [metrics, setMetrics] = useState(getInitialMatchData());
  const [notes, setNotes] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isRapidCounterExpanded, setIsRapidCounterExpanded] = useState(false);
  const scrollViewRef = useRef<ScrollView>(null);
  const scrollYRef = useRef<number>(0); // Track current scroll position
  const insets = useSafeAreaInsets();
  const getScoutName = useAuthStore((state) => state.getScoutName);

  const currentPhase = ACTIVE_GAME_CONFIG.phases[currentPhaseIndex];

  useEffect(() => {
    // Initialize database on mount
    db.init().catch(console.error);

    // Load TBA mode preference and selected event/match from AsyncStorage
    const loadPreferences = async () => {
      try {
        const tbaMode = await AsyncStorage.getItem(TBA_MODE_KEY);
        if (tbaMode !== null) {
          setIsTBAMode(tbaMode === 'true');
        }

        const eventName = await AsyncStorage.getItem(SELECTED_EVENT_NAME_KEY);
        if (eventName) {
          setSelectedEventName(eventName);
        }

        const matchNum = await AsyncStorage.getItem(SELECTED_MATCH_NUMBER_KEY);
        if (matchNum) {
          setSelectedMatchNumber(matchNum);
        }
      } catch (error) {
        console.error('Error loading preferences:', error);
      }
    };

    loadPreferences();
  }, []);

  // Reload preferences when screen comes into focus (user may have selected new event/match)
  useFocusEffect(
    useCallback(() => {
      const reloadPreferences = async () => {
        try {
          const eventName = await AsyncStorage.getItem(SELECTED_EVENT_NAME_KEY);
          setSelectedEventName(eventName);

          const matchNum = await AsyncStorage.getItem(SELECTED_MATCH_NUMBER_KEY);
          setSelectedMatchNumber(matchNum);
        } catch (error) {
          console.error('Error reloading preferences:', error);
        }
      };

      reloadPreferences();
    }, [])
  );

  // Handle route params from select-team screen
  useEffect(() => {
    if (params.fromTBA === 'true' && params.matchNumber && params.teamNumber) {
      setMatchNumber(params.matchNumber);
      setTeamNumber(params.teamNumber);
      setIsTBAMode(true);
    }
  }, [params]);

  const handleTBAModeToggle = async (value: boolean) => {
    setIsTBAMode(value);
    await AsyncStorage.setItem(TBA_MODE_KEY, value.toString());
  };

  const handleSelectEvent = () => {
    router.push('/select-event' as any);
  };

  const updateMetric = (metricId: string, value: any) => {
    setMetrics(prev => ({
      ...prev,
      [metricId]: value
    }));
  };

  const renderMetricInput = (metric: Metric) => {
    const value = metrics[metric.id];

    switch (metric.type) {
      case 'counter':
        return (
          <View key={metric.id} style={styles.metricContainer}>
            <Text style={styles.metricLabel}>{metric.label}</Text>
            <View style={styles.counterContainer}>
              <TouchableOpacity
                style={styles.counterButton}
                onPress={() => updateMetric(metric.id, Math.max(0, value - 1))}
              >
                <Text style={styles.counterButtonText}>-</Text>
              </TouchableOpacity>
              
              <View style={styles.counterValue}>
                <Text style={styles.counterValueText}>{value}</Text>
              </View>
              
              <TouchableOpacity
                style={styles.counterButton}
                onPress={() => {
                  const newValue = value + 1;
                  if (!metric.max || newValue <= metric.max) {
                    updateMetric(metric.id, newValue);
                  }
                }}
              >
                <Text style={styles.counterButtonText}>+</Text>
              </TouchableOpacity>
            </View>
            {metric.max && (
              <Text style={styles.maxLabel}>Max: {metric.max}</Text>
            )}
          </View>
        );

      case 'rapidCounter':
        return (
          <RapidCounterInput
            key={metric.id}
            metric={metric}
            value={value}
            onValueChange={(newValue) => updateMetric(metric.id, newValue)}
            onExpandedChange={setIsRapidCounterExpanded}
            onExpand={(pageY, height) => {
              // pageY is the absolute screen position of the panel after expansion
              // height is the expanded panel height (300)
              handleRapidCounterExpand(pageY, height);
            }}
          />
        );

      case 'boolean':
        return (
          <TouchableOpacity
            key={metric.id}
            style={[
              styles.booleanButton,
              value && styles.booleanButtonActive
            ]}
            onPress={() => updateMetric(metric.id, !value)}
          >
            <Text style={[
              styles.booleanButtonText,
              value && styles.booleanButtonTextActive
            ]}>
              {metric.label}: {value ? 'YES' : 'NO'}
            </Text>
          </TouchableOpacity>
        );

        case 'select':
          return (
            <View key={metric.id} style={styles.metricContainer}>
              <Text style={styles.metricLabel}>{metric.label}</Text>
              <View style={styles.selectContainer}>
                {metric.options?.map(option => (
                  <TouchableOpacity
                    key={option}
                    style={[
                      styles.selectOptionButton,
                      value === option && styles.selectOptionButtonActive
                    ]}
                    onPress={() => updateMetric(metric.id, option)}
                  >
                    <Text style={[
                      styles.selectOptionButtonText,
                      value === option && styles.selectOptionButtonTextActive
                    ]}>
                      {option}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          );

      default:
        return null;
    }
  };

  const handleRapidCounterExpand = useCallback((pageY: number, containerHeight: number) => {
    // pageY is the absolute screen position of the panel after expansion
    // containerHeight is the expanded panel height (300)
    
    if (scrollViewRef.current) {
      const threshold = 50; // Distance from bottom of visible area to keep panel bottom visible
      
      // Calculate the visible area on screen
      const screenHeight = Dimensions.get('window').height;
      const tabBarHeight = 49 + insets.bottom; // Tab bar is typically 49px + safe area bottom
      const headerHeight = 44 + insets.top; // Header is typically 44px + safe area top (but we use edges={[]} so might be 0)
      
      // The visible bottom of the ScrollView on screen (above the tab bar)
      const visibleBottom = screenHeight - tabBarHeight;
      
      // The panel's bottom position on screen
      const panelBottomScreen = pageY + containerHeight;
      
      // Check if panel bottom is below the visible area
      if (panelBottomScreen > visibleBottom - threshold) {
        // Calculate how much we need to scroll down
        const scrollNeeded = panelBottomScreen - (visibleBottom - threshold);
        
        // Get current scroll position and add the delta
        const currentScrollY = scrollYRef.current;
        const newScrollY = currentScrollY + scrollNeeded;
        
        scrollViewRef.current?.scrollTo({
          y: newScrollY,
          animated: true,
        });
      }
    }
  }, [insets.bottom, insets.top]);

  const handleSave = async () => {
    if (!teamNumber || !matchNumber) {
      Alert.alert('Error', 'Please enter match and team number');
      return;
    }

    setIsSaving(true);

    try {
      const scoutName = await getScoutName();
      const matchData: MatchData = {
        id: `${Date.now()}-${matchNumber}-${teamNumber}`,
        matchNumber: parseInt(matchNumber),
        teamNumber: parseInt(teamNumber),
        scouterId: scoutName || 'unknown',
        gameYear: ACTIVE_GAME_CONFIG.year,
        metrics,
        timestamp: Date.now(),
        synced: false,
        notes
      };

      await db.saveMatch(matchData);
      
      Alert.alert(
        'Success',
        `Match ${matchNumber} for team ${teamNumber} saved!`,
        [
          {
            text: 'New Match',
            onPress: async () => {
              if (isTBAMode) {
                // In TBA mode, go back to match selection
                const eventKey = await AsyncStorage.getItem(SELECTED_EVENT_KEY);
                if (eventKey) {
                  router.push({
                    pathname: '/select-match' as any,
                    params: { eventKey },
                  });
                } else {
                  // If no event key, go to event selection
                  router.push('/select-event' as any);
                }
              } else {
                // In manual mode, increment match number
                setMatchNumber((parseInt(matchNumber) + 1).toString());
                setTeamNumber('');
              }
              setMetrics(getInitialMatchData());
              setNotes('');
              setCurrentPhaseIndex(0);
            }
          }
        ]
      );
    } catch (error) {
      Alert.alert('Error', 'Failed to save match data');
      console.error(error);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={[]}>
      <ScrollView 
        ref={scrollViewRef}
        style={styles.scrollView}
        contentContainerStyle={styles.content}
        scrollEnabled={!isRapidCounterExpanded}
        nestedScrollEnabled={!isRapidCounterExpanded}
        onScroll={(event: NativeSyntheticEvent<NativeScrollEvent>) => {
          // Track current scroll position for auto-scroll calculations
          scrollYRef.current = event.nativeEvent.contentOffset.y;
        }}
        scrollEventThrottle={16}
      >
        {/* Match Info */}
        {isTBAMode ? (
          <View style={styles.tbaInfoContainer}>
            {selectedEventName ? (
              <View style={styles.tbaInfoCard}>
                <Text style={styles.tbaInfoLabel}>Event</Text>
                <Text style={styles.tbaInfoValue}>{selectedEventName}</Text>
                <TouchableOpacity
                  style={styles.changeButton}
                  onPress={handleSelectEvent}
                >
                  <Text style={styles.changeButtonText}>Change Event</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.tbaInfoCard}>
                <Text style={styles.tbaInfoLabel}>No Event Selected</Text>
                <TouchableOpacity
                  style={styles.selectButton}
                  onPress={handleSelectEvent}
                >
                  <Text style={styles.selectButtonText}>Select Event</Text>
                </TouchableOpacity>
              </View>
            )}

            {selectedMatchNumber && (
              <TouchableOpacity
                style={styles.selectMatchButton}
                onPress={async () => {
                  const eventKey = await AsyncStorage.getItem(SELECTED_EVENT_KEY);
                  if (eventKey) {
                    router.push({
                      pathname: '/select-match' as any,
                      params: { eventKey },
                    });
                  } else {
                    handleSelectEvent();
                  }
                }}
              >
                <Text style={styles.selectMatchButtonText}>Choose Match and Team</Text>
              </TouchableOpacity>
            )}

            <View style={styles.matchInfo}>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Match #</Text>
                <TextInput
                  style={styles.input}
                  value={matchNumber}
                  onChangeText={setMatchNumber}
                  keyboardType="number-pad"
                  placeholder="1"
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Team #</Text>
                <TextInput
                  style={styles.input}
                  value={teamNumber}
                  onChangeText={setTeamNumber}
                  keyboardType="number-pad"
                  placeholder="1234"
                />
              </View>
            </View>
          </View>
        ) : (
          <View style={styles.matchInfo}>
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Match #</Text>
              <TextInput
                style={styles.input}
                value={matchNumber}
                onChangeText={setMatchNumber}
                keyboardType="number-pad"
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Team #</Text>
              <TextInput
                style={styles.input}
                value={teamNumber}
                onChangeText={setTeamNumber}
                keyboardType="number-pad"
                placeholder="1234"
              />
            </View>
          </View>
        )}

        {/* Phase Tabs */}
        <View style={styles.phaseTabs}>
          {ACTIVE_GAME_CONFIG.phases.map((phase, index) => (
            <TouchableOpacity
              key={phase.id}
              style={[
                styles.phaseTab,
                currentPhaseIndex === index && styles.phaseTabActive
              ]}
              onPress={() => setCurrentPhaseIndex(index)}
            >
              <Text style={[
                styles.phaseTabText,
                currentPhaseIndex === index && styles.phaseTabTextActive
              ]}>
                {phase.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Current Phase Metrics */}
        <View style={styles.metricsSection}>
          <Text style={styles.phaseTitle}>{currentPhase.label}</Text>
          {currentPhase.metrics.map(metric => renderMetricInput(metric))}
        </View>

        {/* Notes */}
        <View style={styles.notesSection}>
          <Text style={styles.inputLabel}>Notes (Optional)</Text>
          <TextInput
            style={styles.notesInput}
            value={notes}
            onChangeText={setNotes}
            placeholder="Additional observations..."
            multiline
            numberOfLines={3}
          />
        </View>

        {/* Save Button */}
        <TouchableOpacity
          style={[styles.saveButton, isSaving && styles.saveButtonDisabled]}
          onPress={handleSave}
          disabled={isSaving}
        >
          <Text style={styles.saveButtonText}>
            {isSaving ? 'Saving...' : 'Save Match'}
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = {
  container: {
    flex: 1,
    backgroundColor: '#1a1a1a',
  },
  header: {
    backgroundColor: '#ff6600',
    padding: 16,
    alignItems: 'center' as const,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold' as const,
    color: 'white',
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: 16,
    paddingBottom: 0,
  },
  matchInfo: {
    flexDirection: 'row' as const,
    gap: 12,
    marginTop: 16,
    marginBottom: 16,
  },
  inputGroup: {
    flex: 1,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600' as const,
    marginBottom: 6,
    color: '#e5e5e5',
  },
  input: {
    backgroundColor: '#2a2a2a',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#404040',
    color: '#fff',
  },
  phaseTabs: {
    flexDirection: 'row' as const,
    marginBottom: 16,
    gap: 8,
  },
  phaseTab: {
    flex: 1,
    backgroundColor: '#2a2a2a',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center' as const,
    borderWidth: 2,
    borderColor: '#404040',
  },
  phaseTabActive: {
    backgroundColor: '#ff6600',
    borderColor: '#ff6600',
  },
  phaseTabText: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: '#b0b0b0',
  },
  phaseTabTextActive: {
    color: 'white',
  },
  metricsSection: {
    backgroundColor: '#2a2a2a',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  phaseTitle: {
    fontSize: 18,
    fontWeight: 'bold' as const,
    marginBottom: 16,
    color: '#fff',
  },
  metricContainer: {
    marginBottom: 20,
  },
  metricLabel: {
    fontSize: 16,
    fontWeight: '600' as const,
    marginBottom: 8,
    color: '#e5e5e5',
  },
  counterContainer: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 12,
  },
  counterButton: {
    backgroundColor: '#ff6600',
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  counterButtonText: {
    fontSize: 32,
    color: 'white',
    fontWeight: 'bold' as const,
  },
  counterValue: {
    flex: 1,
    backgroundColor: '#2a2a2a',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center' as const,
  },
  counterValueText: {
    fontSize: 32,
    fontWeight: 'bold' as const,
    color: '#fff',
  },
  maxLabel: {
    fontSize: 12,
    color: '#b0b0b0',
    marginTop: 4,
  },
  booleanButton: {
    backgroundColor: '#404040',
    padding: 20,
    borderRadius: 8,
    marginBottom: 12,
    alignItems: 'center' as const,
  },
  booleanButtonActive: {
    backgroundColor: '#10b981',
  },
  booleanButtonText: {
    fontSize: 18,
    fontWeight: '600' as const,
    color: '#e5e5e5',
  },
  booleanButtonTextActive: {
    color: 'white',
  },
  selectContainer: {
    gap: 8,
  },
  selectOptionButton: {
    flex: 1,
    minWidth: '30%',
    backgroundColor: '#2a2a2a',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center' as const,
    borderWidth: 2,
    borderColor: '#ff9940',
  },
  selectOptionButtonActive: {
    backgroundColor: '#ff6600',
    borderColor: '#ff6600',
  },
  selectOptionButtonText: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: '#ff9940',
  },
  selectOptionButtonTextActive: {
    color: 'white',
  },
  notesSection: {
    marginBottom: 16,
  },
  notesInput: {
    backgroundColor: '#2a2a2a',
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    borderWidth: 1,
    borderColor: '#404040',
    minHeight: 80,
    textAlignVertical: 'top' as const,
    color: '#fff',
  },
  saveButton: {
    backgroundColor: '#10b981',
    padding: 20,
    borderRadius: 12,
    alignItems: 'center' as const,
    marginBottom: 16,
  },
  saveButtonDisabled: {
    opacity: 0.5,
  },
  saveButtonText: {
    fontSize: 18,
    fontWeight: 'bold' as const,
    color: 'white',
  },
  toggleContainer: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    backgroundColor: '#2a2a2a',
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
  },
  toggleLabelContainer: {
    flex: 1,
  },
  toggleLabel: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: '#fff',
    marginBottom: 4,
  },
  toggleSubtext: {
    fontSize: 12,
    color: '#b0b0b0',
  },
  tbaInfoContainer: {
    marginBottom: 16,
  },
  tbaInfoCard: {
    backgroundColor: '#2a2a2a',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  tbaInfoLabel: {
    fontSize: 12,
    fontWeight: '600' as const,
    color: '#b0b0b0',
    marginBottom: 4,
    textTransform: 'uppercase' as const,
  },
  tbaInfoValue: {
    fontSize: 18,
    fontWeight: '600' as const,
    color: '#fff',
    marginBottom: 12,
  },
  changeButton: {
    backgroundColor: '#3a3a3a',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 6,
    alignSelf: 'flex-start' as const,
  },
  changeButtonText: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: '#ff6600',
  },
  selectButton: {
    backgroundColor: '#ff6600',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: 'center' as const,
  },
  selectButtonText: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: 'white',
  },
  selectMatchButton: {
    backgroundColor: '#3a3a3a',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: 'center' as const,
    marginTop: 8,
  },
  selectMatchButtonText: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: '#ff6600',
  },
};