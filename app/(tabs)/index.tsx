// app/(tabs)/index.tsx - Match Scouting Screen
import AsyncStorage from '@react-native-async-storage/async-storage';
import { queryClient } from '@/config/queryClient';
import { queryKeys } from '@/config/queryKeys';
import { matchesCacheService } from '@/services/matchesCacheService';
import { useFocusEffect } from '@react-navigation/native';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Dimensions, Keyboard, KeyboardAvoidingView, NativeScrollEvent, NativeSyntheticEvent, Platform, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { RapidCounterInput } from '../../components/RapidCounterInput';
import { SurveyModal } from '../../components/SurveyModal';
import { ACTIVE_GAME_CONFIG, getDefaultsForPhases, getInitialMatchData, Metric } from '../../config/gameConfig';
import { getEffectiveYear, useDemoStore } from '../../stores/demoStore';
import { bettingService } from '../../services/bettingService';
import { db } from '../../services/database';
import { syncManager } from '../../services/syncTransformer';
import { useAuthStore } from '../../stores/authStore';
import { useBetNotificationStore } from '../../stores/betNotificationStore';
import { EARNED_PER_MATCH, useEbucksStore } from '../../stores/ebucksStore';
import { MatchData } from '../../types/match';

const TBA_MODE_KEY = 'tba_mode_enabled';
const TRACKING_MODE_KEY = 'tracking_mode';
const SELECTED_EVENT_KEY = 'selected_event_key';
const SELECTED_EVENT_NAME_KEY = 'selected_event_name';
const SELECTED_MATCH_KEY = 'selected_match_key';
const SELECTED_MATCH_NUMBER_KEY = 'selected_match_number';
const SELECTED_TEAM_NUMBER_KEY = 'selected_team_number';
const SELECTED_ALLIANCE_KEY = 'selected_alliance_color';
const EVENT_KEYS = ['selected_event_key', 'selected_event_name'];

export default function MatchScoutScreen() {
  const params = useLocalSearchParams<{
    matchNumber?: string;
    teamNumber?: string;
    fromTBA?: string;
    allianceColor?: 'red' | 'blue';
  }>();

  const [isTBAMode, setIsTBAMode] = useState(true);
  const [matchNumber, setMatchNumber] = useState('');
  const [teamNumber, setTeamNumber] = useState('');
  const [allianceColor, setAllianceColor] = useState<'red' | 'blue' | null>(null);
  const [selectedEventName, setSelectedEventName] = useState<string | null>(null);
  const [selectedMatchNumber, setSelectedMatchNumber] = useState<string | null>(null);
  const [currentPhaseIndex, setCurrentPhaseIndex] = useState(0);
  const [metrics, setMetrics] = useState(getInitialMatchData());
  const [showSurveyModal, setShowSurveyModal] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isRapidCounterExpanded, setIsRapidCounterExpanded] = useState(false);
  const [trackingMode, setTrackingMode] = useState<'rate' | 'static'>('rate');
  const [matchStarted, setMatchStarted] = useState(false);
  const [autonomousTimeRemaining, setAutonomousTimeRemaining] = useState<number | null>(null);
  const [showCountdownToast, setShowCountdownToast] = useState(false);
  const [autonomousTimerCompleted, setAutonomousTimerCompleted] = useState(false);
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);
  const timerIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const scrollViewRef = useRef<ScrollView>(null);
  const prevMatchNumberRef = useRef<string>('');
  const prevTeamNumberRef = useRef<string>('');
  const matchNumberRef = useRef<string>('');
  const teamNumberRef = useRef<string>('');
  const loadedSelectionRef = useRef<{ matchNumber: string; teamNumber: string } | null>(null);
  const matchStartedRef = useRef<boolean>(false);
  const autonomousTimeRemainingRef = useRef<number | null>(null);
  const autonomousTimerCompletedRef = useRef<boolean>(false);
  const hasAutoSwitchedRef = useRef<boolean>(false);
  const skipAllianceClearRef = useRef<boolean>(false); // Skip clearing alliance when change came from TBA params
  const scrollYRef = useRef<number>(0); // Track current scroll position
  const saveButtonContainerRef = useRef<View>(null);
  const saveButtonYRef = useRef<number>(0);
  const pendingMatchIdRef = useRef<string | null>(null);
  const insets = useSafeAreaInsets();
  const getScoutName = useAuthStore((state) => state.getScoutName);
  const earnEbucks = useEbucksStore((state) => state.earnEbucks);
  const refreshBalance = useEbucksStore((state) => state.refreshBalance);
  const showBetNotification = useBetNotificationStore((state) => state.showNotification);

  const currentPhase = ACTIVE_GAME_CONFIG.phases[currentPhaseIndex];
  const autonomousPhase = ACTIVE_GAME_CONFIG.phases.find(p => p.id === 'auto');
  const autonomousDuration = autonomousPhase?.duration || 0;
  const isAutonomousPhase = useMemo(() => currentPhase.id === 'auto', [currentPhaseIndex]);
  
  // Log autonomous duration on mount/change
  useEffect(() => {
    console.log('[Timer] Autonomous phase config:', {
      found: !!autonomousPhase,
      duration: autonomousDuration,
      phaseId: autonomousPhase?.id,
      allPhases: ACTIVE_GAME_CONFIG.phases.map(p => ({ id: p.id, duration: p.duration }))
    });
  }, [autonomousPhase, autonomousDuration]);

  // Track keyboard visibility so "Click to Begin Match" dismisses keyboard instead of starting when typing
  useEffect(() => {
    const showSub = Keyboard.addListener('keyboardDidShow', () => setIsKeyboardVisible(true));
    const hideSub = Keyboard.addListener('keyboardDidHide', () => setIsKeyboardVisible(false));
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

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

        const savedTrackingMode = await AsyncStorage.getItem(TRACKING_MODE_KEY);
        if (savedTrackingMode === 'rate' || savedTrackingMode === 'static') {
          setTrackingMode(savedTrackingMode);
        }

        const eventName = await AsyncStorage.getItem(SELECTED_EVENT_NAME_KEY);
        if (eventName) {
          setSelectedEventName(eventName);
        }

        const matchNum = await AsyncStorage.getItem(SELECTED_MATCH_NUMBER_KEY);
        const teamNum = await AsyncStorage.getItem(SELECTED_TEAM_NUMBER_KEY);
        if (matchNum) {
          setSelectedMatchNumber(matchNum);
          setMatchNumber(matchNum);
          matchNumberRef.current = matchNum;
        } else {
          setSelectedMatchNumber(null);
          setMatchNumber('');
          matchNumberRef.current = '';
        }
        if (teamNum) {
          setTeamNumber(teamNum);
          teamNumberRef.current = teamNum;
        } else {
          setTeamNumber('');
          teamNumberRef.current = '';
        }
        if (matchNum && teamNum) {
          loadedSelectionRef.current = { matchNumber: matchNum, teamNumber: teamNum };
        } else {
          loadedSelectionRef.current = null;
        }

        const alliance = await AsyncStorage.getItem(SELECTED_ALLIANCE_KEY);
        setAllianceColor(alliance === 'red' || alliance === 'blue' ? alliance : null);
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
          const eventKey = await AsyncStorage.getItem(SELECTED_EVENT_KEY);
          const eventName = await AsyncStorage.getItem(SELECTED_EVENT_NAME_KEY);
          setSelectedEventName(eventName);

          // Prefetch matches in background so select-match/select-team load instantly
          if (eventKey) {
            queryClient.prefetchQuery({
              queryKey: queryKeys.matches.byEvent(eventKey),
              queryFn: () => matchesCacheService.fetchAndCache(eventKey),
              staleTime: 1 * 60 * 1000,
            });
          }

          const matchNum = await AsyncStorage.getItem(SELECTED_MATCH_NUMBER_KEY);
          const teamNum = await AsyncStorage.getItem(SELECTED_TEAM_NUMBER_KEY);
          if (matchNum) {
            setSelectedMatchNumber(matchNum);
            setMatchNumber(matchNum);
            matchNumberRef.current = matchNum;
          } else {
            setSelectedMatchNumber(null);
            setMatchNumber('');
            matchNumberRef.current = '';
          }
          if (teamNum) {
            setTeamNumber(teamNum);
            teamNumberRef.current = teamNum;
          } else {
            setTeamNumber('');
            teamNumberRef.current = '';
          }
          if (matchNum && teamNum) {
            loadedSelectionRef.current = { matchNumber: matchNum, teamNumber: teamNum };
          } else {
            loadedSelectionRef.current = null;
          }

          let alliance = await AsyncStorage.getItem(SELECTED_ALLIANCE_KEY);
          if ((!alliance || (alliance !== 'red' && alliance !== 'blue')) && eventKey && matchNum && teamNum) {
            // Derive from cached matches (no extra API call)
            const matches = queryClient.getQueryData<import('@/api/types').TBAMatch[]>(
              queryKeys.matches.byEvent(eventKey)
            );
            const matchKey = await AsyncStorage.getItem(SELECTED_MATCH_KEY);
            if (matches && matchKey) {
              const match = matches.find((m) => m.key === matchKey);
              const teamKey = `frc${teamNum}`;
              if (match?.alliances?.red?.team_keys?.includes(teamKey)) {
                alliance = 'red';
                await AsyncStorage.setItem(SELECTED_ALLIANCE_KEY, 'red');
              } else if (match?.alliances?.blue?.team_keys?.includes(teamKey)) {
                alliance = 'blue';
                await AsyncStorage.setItem(SELECTED_ALLIANCE_KEY, 'blue');
              }
            }
          }
          setAllianceColor(alliance === 'red' || alliance === 'blue' ? alliance : null);
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
      const newMatchNumber = params.matchNumber;
      const newTeamNumber = params.teamNumber;
      const newAlliance = params.allianceColor;
      loadedSelectionRef.current = { matchNumber: newMatchNumber, teamNumber: newTeamNumber };
      matchNumberRef.current = newMatchNumber;
      teamNumberRef.current = newTeamNumber;

      if (newAlliance === 'red' || newAlliance === 'blue') {
        setAllianceColor(newAlliance);
        AsyncStorage.setItem(SELECTED_ALLIANCE_KEY, newAlliance);
      }
      skipAllianceClearRef.current = true; // Don't clear alliance in reset effect

      // Only update if values actually changed
      if (newMatchNumber !== matchNumber) {
        setMatchNumber(newMatchNumber);
      }
      if (newTeamNumber !== teamNumber) {
        setTeamNumber(newTeamNumber);
      }
      setIsTBAMode(true);
      // Reset match state when new match is selected
      matchStartedRef.current = false;
      autonomousTimeRemainingRef.current = null;
      autonomousTimerCompletedRef.current = false;
      hasAutoSwitchedRef.current = false;
      setMatchStarted(false);
      setAutonomousTimeRemaining(null);
      setShowCountdownToast(false);
      setAutonomousTimerCompleted(false);
      setCurrentPhaseIndex(0); // Reset to autonomous
      setMetrics(getInitialMatchData()); // Reset metrics
    }
  }, [params.fromTBA, params.matchNumber, params.teamNumber, params.allianceColor]);

  // Reset match state when match or team number changes manually
  useEffect(() => {
    // Only reset if values actually changed (not on initial render)
    if (prevMatchNumberRef.current !== '' && prevTeamNumberRef.current !== '') {
      if (prevMatchNumberRef.current !== matchNumber || prevTeamNumberRef.current !== teamNumber) {
        matchStartedRef.current = false;
        autonomousTimeRemainingRef.current = null;
        autonomousTimerCompletedRef.current = false;
        hasAutoSwitchedRef.current = false;
        setMatchStarted(false);
        setAutonomousTimeRemaining(null);
        setShowCountdownToast(false);
        setAutonomousTimerCompleted(false);
        if (!skipAllianceClearRef.current) {
          setAllianceColor(null);
          AsyncStorage.removeItem(SELECTED_ALLIANCE_KEY);
        }
        skipAllianceClearRef.current = false;
        if (timerIntervalRef.current) {
          clearInterval(timerIntervalRef.current);
          timerIntervalRef.current = null;
        }
      }
    }
    
    // Update refs
    prevMatchNumberRef.current = matchNumber;
    prevTeamNumberRef.current = teamNumber;
    matchNumberRef.current = matchNumber;
    teamNumberRef.current = teamNumber;
  }, [matchNumber, teamNumber]);

  // Timer countdown effect - use refs to avoid re-render issues
  useEffect(() => {
    console.log('[Timer] Effect triggered - matchStarted:', matchStarted, 'isAutonomousPhase:', isAutonomousPhase, 'interval exists:', !!timerIntervalRef.current);
    
    // Sync refs with state
    matchStartedRef.current = matchStarted;
    
    // Only set up interval if match started, we're in autonomous phase, and timer hasn't completed
    // Use refs to check conditions to avoid dependency on state that changes
    if (matchStarted && isAutonomousPhase && !autonomousTimerCompleted) {
      // Only create interval if one doesn't exist - this prevents recreation on re-renders
      if (!timerIntervalRef.current) {
        console.log('[Timer] Setting up interval - starting at:', autonomousDuration, 'seconds');
        
        // Initialize ref if needed
        if (autonomousTimeRemainingRef.current === null) {
          autonomousTimeRemainingRef.current = autonomousDuration;
        }
        
        timerIntervalRef.current = setInterval(() => {
          // Use ref to get current value without causing re-renders
          if (autonomousTimeRemainingRef.current === null || autonomousTimeRemainingRef.current <= 0) {
            console.log('[Timer] Timer reached 0 or null');
            if (timerIntervalRef.current) {
              clearInterval(timerIntervalRef.current);
              timerIntervalRef.current = null;
            }
            return;
          }
          
          const newTime = autonomousTimeRemainingRef.current - 1;
          autonomousTimeRemainingRef.current = newTime;
          
          console.log('[Timer] Countdown:', newTime, 'seconds remaining');
          
          // Update state for display (this will trigger re-render but won't affect timer)
          setAutonomousTimeRemaining(newTime);
          
          // Show countdown toast when 3 seconds remain
          if (newTime <= 3 && newTime > 0) {
            setShowCountdownToast(true);
          } else if (newTime === 0) {
            console.log('[Timer] Timer finished - switching to teleop');
            setShowCountdownToast(false);
            autonomousTimerCompletedRef.current = true;
            setAutonomousTimerCompleted(true);
            if (timerIntervalRef.current) {
              clearInterval(timerIntervalRef.current);
              timerIntervalRef.current = null;
            }
          }
        }, 1000);
      } else {
        console.log('[Timer] Interval already exists, skipping setup');
      }
    } else {
      // Clear interval if match stopped or not in autonomous phase
      if (timerIntervalRef.current) {
        console.log('[Timer] Clearing interval - conditions not met');
        clearInterval(timerIntervalRef.current);
        timerIntervalRef.current = null;
      }
    }

    return () => {
      // Don't clear on cleanup unless component unmounts - let the interval run
      // Only clear if we're explicitly stopping
      console.log('[Timer] Effect cleanup - but keeping interval if it exists');
    };
  }, [matchStarted, isAutonomousPhase, autonomousDuration, autonomousTimerCompleted]);

  // Auto-switch to teleop when timer ends (only once, when timer first reaches 0)
  useEffect(() => {
    // Only auto-switch if:
    // 1. Timer just reached 0 (autonomousTimeRemaining === 0)
    // 2. We're in autonomous phase
    // 3. Timer has completed (autonomousTimerCompleted is true)
    // 4. We haven't already auto-switched (hasAutoSwitchedRef is false)
    if (matchStarted && autonomousTimeRemaining === 0 && isAutonomousPhase && autonomousTimerCompleted && !hasAutoSwitchedRef.current) {
      console.log('[Timer] Auto-switching to teleop phase - timer just completed');
      hasAutoSwitchedRef.current = true;
      // Reset teleop and endgame metrics to defaults so pre-match edits are cleared
      const teleopAndEndgameDefaults = getDefaultsForPhases(['teleop', 'endgame']);
      setMetrics((prev) => ({ ...prev, ...teleopAndEndgameDefaults }));
      const teleopIndex = ACTIVE_GAME_CONFIG.phases.findIndex(p => p.id === 'teleop');
      if (teleopIndex !== -1) {
        setCurrentPhaseIndex(teleopIndex);
      }
    } else if (autonomousTimeRemaining === 0 && isAutonomousPhase && autonomousTimerCompleted && hasAutoSwitchedRef.current) {
      console.log('[Timer] Timer already completed and auto-switched, allowing manual navigation');
    }
  }, [autonomousTimeRemaining, matchStarted, isAutonomousPhase, autonomousTimerCompleted]);

  const handleTBAModeToggle = async (value: boolean) => {
    setIsTBAMode(value);
    await AsyncStorage.setItem(TBA_MODE_KEY, value.toString());
    if (value === false) {
      setAllianceColor(null);
      await AsyncStorage.removeItem(SELECTED_ALLIANCE_KEY);
    }
  };

  // Update refs synchronously when user types so startMatch always sees latest values
  const handleMatchNumberChange = useCallback((value: string) => {
    matchNumberRef.current = value;
    setMatchNumber(value);
  }, []);
  const handleTeamNumberChange = useCallback((value: string) => {
    teamNumberRef.current = value;
    setTeamNumber(value);
  }, []);

  const handleSelectEvent = () => {
    router.push('/select-event' as any);
  };

  const isDemoMode = useDemoStore((s) => s.isDemoMode);
  const toggleDemoMode = useDemoStore((s) => s.toggleDemoMode);
  const handleToggleDemoMode = useCallback(async () => {
    await toggleDemoMode();
    await AsyncStorage.multiRemove(EVENT_KEYS);
    await matchesCacheService.clear();
    queryClient.invalidateQueries({ queryKey: queryKeys.events.all });
    queryClient.invalidateQueries({ queryKey: queryKeys.matches.all });
    queryClient.invalidateQueries({ queryKey: queryKeys.teamStatistics.all });
    queryClient.invalidateQueries({ queryKey: queryKeys.analytics.all });
    queryClient.invalidateQueries({ queryKey: queryKeys.picklists.all });
    queryClient.invalidateQueries({ queryKey: queryKeys.bets.all });
    queryClient.invalidateQueries({ queryKey: ['rankings'] });
    setSelectedEventName(null);
  }, [toggleDemoMode]);

  const resetMatchAndTimerState = useCallback(() => {
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
    matchStartedRef.current = false;
    autonomousTimeRemainingRef.current = null;
    autonomousTimerCompletedRef.current = false;
    hasAutoSwitchedRef.current = false;
    setMatchStarted(false);
    setAutonomousTimeRemaining(null);
    setAutonomousTimerCompleted(false);
    setShowCountdownToast(false);
  }, []);

  const startMatch = useCallback(() => {
    const match = matchNumberRef.current?.trim() || '';
    const team = teamNumberRef.current?.trim() || '';
    if (!match || !team) {
      Alert.alert('Select a match', 'Please select a match and team before starting.');
      return;
    }
    if (!allianceColor) {
      Alert.alert('Select alliance', 'Please select Red or Blue alliance before starting.');
      return;
    }
    // Only start if timer hasn't been completed yet
    if (!matchStartedRef.current && !autonomousTimerCompletedRef.current && isAutonomousPhase) {
      console.log('[Timer] Starting match - Autonomous duration:', autonomousDuration);
      matchStartedRef.current = true;
      autonomousTimeRemainingRef.current = autonomousDuration;
      autonomousTimerCompletedRef.current = false;
      setMatchStarted(true);
      setAutonomousTimeRemaining(autonomousDuration);
      setAutonomousTimerCompleted(false);
      
      // Clear any existing interval before starting new one
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
        timerIntervalRef.current = null;
      }
    }
  }, [isAutonomousPhase, autonomousDuration, allianceColor]);

  const updateMetric = (metricId: string, value: any) => {
    // Start match if user starts scoring in autonomous phase (only if timer hasn't completed and alliance selected)
    if (!matchStarted && !autonomousTimerCompleted && isAutonomousPhase && currentPhase.id === 'auto' && allianceColor) {
      startMatch();
    }
    
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
        if (trackingMode === 'static') {
          const clampedAdd = (delta: number) => {
            const next = value + delta;
            const clamped = Math.max(0, metric.max ? Math.min(next, metric.max) : next);
            updateMetric(metric.id, clamped);
          };
          return (
            <View key={metric.id} style={styles.metricContainer}>
              <Text style={styles.metricLabel}>{metric.label}</Text>
              <View style={styles.staticCounterRow}>
                {([-10, -5, -1] as const).map((d) => (
                  <TouchableOpacity
                    key={d}
                    style={styles.staticCounterBtn}
                    onPress={() => clampedAdd(d)}
                  >
                    <Text style={styles.staticCounterBtnText}>{d}</Text>
                  </TouchableOpacity>
                ))}
                <View style={styles.staticCounterValue}>
                  <Text style={styles.counterValueText}>{value}</Text>
                </View>
                {([1, 5, 10] as const).map((d) => (
                  <TouchableOpacity
                    key={d}
                    style={[styles.staticCounterBtn, styles.staticCounterBtnPos]}
                    onPress={() => clampedAdd(d)}
                  >
                    <Text style={styles.staticCounterBtnText}>+{d}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              {metric.max && <Text style={styles.maxLabel}>Max: {metric.max}</Text>}
            </View>
          );
        }
        return (
          <RapidCounterInput
            key={metric.id}
            metric={metric}
            value={value}
            onValueChange={(newValue) => updateMetric(metric.id, newValue)}
            onExpandedChange={setIsRapidCounterExpanded}
            onExpand={(pageY, height) => {
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
                    <Text 
                      style={[
                      styles.selectOptionButtonText,
                      value === option && styles.selectOptionButtonTextActive
                      ]}
                      numberOfLines={1}
                      adjustsFontSizeToFit={true}
                      minimumFontScale={0.7}
                    >
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
    // pageY = panel top in window coords (from measureInWindow)
    // containerHeight = expanded panel height
    // Measure ScrollView's visible bounds for accurate calculation on any device
    const scrollView = scrollViewRef.current;
    if (!scrollView) return;

    const doScroll = () => {
      (scrollView as any).measureInWindow((_x: number, scrollViewY: number, _w: number, scrollViewHeight: number) => {
        // Bottom of visible area = ScrollView bottom minus tab bar + safe area
        const tabBarAndSafeArea = 56 + insets.bottom;
        const visibleBottom = scrollViewY + scrollViewHeight - tabBarAndSafeArea;
        const panelBottomScreen = pageY + containerHeight;
        const paddingAboveNav = 16;

        if (panelBottomScreen > visibleBottom - paddingAboveNav) {
          const scrollNeeded = panelBottomScreen - (visibleBottom - paddingAboveNav);
          const newScrollY = scrollYRef.current + scrollNeeded;

          scrollView.scrollTo({
            y: newScrollY,
            animated: true,
          });
        }
      });
    };

    // Run after layout has updated with padding (called from RAF in RapidCounter)
    doScroll();
  }, [insets.bottom]);

  const handleSaveButtonLayout = useCallback((event: any) => {
    const { y } = event.nativeEvent.layout;
    saveButtonYRef.current = y;
  }, []);

  const handleScrollBeginDrag = useCallback(() => {
    Keyboard.dismiss();
  }, []);

  const handleEndMatch = useCallback(async () => {
    Keyboard.dismiss();
    if (!matchNumber?.trim() || !teamNumber?.trim()) {
      Alert.alert('Error', 'Please enter match and team number');
      return;
    }
    const scoutName = await getScoutName();
    const matchId = `${Date.now()}-${matchNumber}-${teamNumber}`;
    pendingMatchIdRef.current = matchId;
    const matchDataWithoutSurvey: MatchData = {
      id: matchId,
      matchNumber: parseInt(matchNumber),
      teamNumber: parseInt(teamNumber),
      scouterId: scoutName || 'unknown',
      gameYear: getEffectiveYear(),
      metrics,
      timestamp: Date.now(),
      synced: false,
      survey: {},
      allianceColor: allianceColor || undefined,
    };
    try {
      await db.saveMatch(matchDataWithoutSurvey);
      syncManager.uploadMatch(matchDataWithoutSurvey).catch((e) =>
        console.error('[Survey] Background upload failed:', e)
      );
    } catch (e) {
      console.error('[End Match] Failed to save:', e);
      Alert.alert('Error', 'Failed to save match data.');
      return;
    }
    setShowSurveyModal(true);
  }, [matchNumber, teamNumber, metrics, allianceColor, getEffectiveYear]);

  const handleSurveySubmit = useCallback(
    async (survey: Record<string, any>) => {
      const matchId = pendingMatchIdRef.current;
      if (!matchId || !matchNumber?.trim() || !teamNumber?.trim()) return;
      setIsSaving(true);
      setShowSurveyModal(false);
      pendingMatchIdRef.current = null;
      const notesFromSurvey =
        (typeof survey.notes === 'string' ? survey.notes : '') || '';
      try {
        const scoutName = await getScoutName();
        const matchData: MatchData = {
          id: matchId,
          matchNumber: parseInt(matchNumber),
          teamNumber: parseInt(teamNumber),
          scouterId: scoutName || 'unknown',
          gameYear: getEffectiveYear(),
          metrics,
          timestamp: Date.now(),
          synced: false,
          notes: notesFromSurvey,
          survey,
          allianceColor: allianceColor || undefined,
        };
        await db.saveMatch(matchData);
        await syncManager.uploadMatch(matchData);
        await earnEbucks(EARNED_PER_MATCH, `Scouted match ${matchNumber} for team ${teamNumber}`);

        // Optimistically update My Schedule cache so "Scouted" badge appears instantly
        const myTeamNumber = useAuthStore.getState().user?.teamNumber;
        const eventKey = await AsyncStorage.getItem(SELECTED_EVENT_KEY);
        if (myTeamNumber && eventKey && scoutName) {
          const qk = queryKeys.scouterAssignments.forScouter(myTeamNumber, eventKey, scoutName);
          queryClient.setQueryData(qk, (old: { assignments: any[]; scoutedSet: Set<string> } | undefined) => {
            if (!old) return old;
            const key = `${matchData.matchNumber}:${matchData.teamNumber}`;
            const newSet = new Set(old.scoutedSet);
            newSet.add(key);
            return { ...old, scoutedSet: newSet };
          });
        }
        if (isTBAMode) {
          try {
            const matchKey = await AsyncStorage.getItem(SELECTED_MATCH_KEY);
            if (matchKey) {
              const resolutions = await bettingService.checkAndResolveBets(matchKey);
              await refreshBalance();
              const first = resolutions?.[0];
              if (first) {
                showBetNotification({
                  matchNumber: first.matchNumber,
                  won: first.won,
                  payout: first.payout,
                });
              }
            }
          } catch (error) {
            console.error('Error checking/resolving bets after match save:', error);
          }
        }
        Alert.alert(
          'Success',
          `Match ${matchNumber} for team ${teamNumber} saved! You earned ${EARNED_PER_MATCH} ebucks!`,
          [
            {
              text: 'Done',
              onPress: async () => {
                resetMatchAndTimerState();
                await AsyncStorage.multiRemove([
                  SELECTED_MATCH_KEY,
                  SELECTED_MATCH_NUMBER_KEY,
                  SELECTED_TEAM_NUMBER_KEY,
                  SELECTED_ALLIANCE_KEY,
                ]);
                setMatchNumber('');
                setTeamNumber('');
                setAllianceColor(null);
                matchNumberRef.current = '';
                teamNumberRef.current = '';
                setMetrics(getInitialMatchData());
                setCurrentPhaseIndex(0);
              },
            },
          ]
        );
      } catch (error: any) {
        const errMsg = error?.message ?? String(error);
        console.error('[Submit Match] Failed:', errMsg);
        Alert.alert('Error', `Failed to save match: ${errMsg.slice(0, 80)}`);
      } finally {
        setIsSaving(false);
      }
    },
    [
      matchNumber,
      teamNumber,
      metrics,
      allianceColor,
      isTBAMode,
      getScoutName,
      getEffectiveYear,
      earnEbucks,
      refreshBalance,
      showBetNotification,
    ]
  );

  return (
    <SafeAreaView style={styles.container} edges={[]}>
      <KeyboardAvoidingView
        style={styles.keyboardAvoidingView}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
      >
      <ScrollView 
        ref={scrollViewRef}
        style={styles.scrollView}
        contentContainerStyle={[
          styles.content,
          isRapidCounterExpanded && { paddingBottom: 16 + 320 },
        ]}
        scrollEnabled={!isRapidCounterExpanded}
        nestedScrollEnabled={!isRapidCounterExpanded}
        onScroll={(event: NativeSyntheticEvent<NativeScrollEvent>) => {
          // Track current scroll position for auto-scroll calculations
          scrollYRef.current = event.nativeEvent.contentOffset.y;
        }}
        scrollEventThrottle={16}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          onScrollBeginDrag={handleScrollBeginDrag}
      >
        {/* Match Info */}
        {isTBAMode ? (
          <View style={styles.tbaInfoContainer}>
            <TouchableOpacity
              style={[styles.demoModeButton, isDemoMode && styles.demoModeButtonActive]}
              onPress={handleToggleDemoMode}
            >
              <Text style={[styles.demoModeButtonText, isDemoMode && styles.demoModeButtonTextActive]}>
                {isDemoMode ? 'Demo Mode: On' : 'Demo Mode: Off'}
              </Text>
            </TouchableOpacity>
            {selectedEventName ? (
              <View style={styles.tbaInfoCard}>
                <Text style={styles.tbaInfoLabel}>Event</Text>
                <Text style={styles.tbaInfoValue}>{selectedEventName}</Text>
                <TouchableOpacity
                  style={styles.changeButton}
                  onPress={handleSelectEvent}
                >
                  <Text 
                    style={styles.changeButtonText}
                    numberOfLines={1}
                    adjustsFontSizeToFit={true}
                    minimumFontScale={0.7}
                  >
                    Change Event
                  </Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.tbaInfoCard}>
                <Text style={styles.tbaInfoLabel}>No Event Selected</Text>
                <TouchableOpacity
                  style={styles.selectButton}
                  onPress={handleSelectEvent}
                >
                  <Text 
                    style={styles.selectButtonText}
                    numberOfLines={1}
                    adjustsFontSizeToFit={true}
                    minimumFontScale={0.7}
                  >
                    Select Event
                  </Text>
                </TouchableOpacity>
              </View>
            )}

            {selectedEventName && (
              <>
                <TouchableOpacity
                  style={styles.selectMatchButton}
                  onPress={() => router.push('/my-schedule' as any)}
                >
                  <Text 
                    style={styles.selectMatchButtonText}
                    numberOfLines={1}
                    adjustsFontSizeToFit={true}
                    minimumFontScale={0.7}
                  >
                    Use Scouter Schedule
                  </Text>
                </TouchableOpacity>
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
                  <Text 
                    style={styles.selectMatchButtonText}
                    numberOfLines={1}
                    adjustsFontSizeToFit={true}
                    minimumFontScale={0.7}
                  >
                    Choose Match and Team
                  </Text>
                </TouchableOpacity>
              </>
            )}

            <View style={styles.matchInfo}>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Match #</Text>
                <TextInput
                  style={styles.input}
                  value={matchNumber}
                  onChangeText={handleMatchNumberChange}
                  keyboardType="number-pad"
                  placeholder="1"
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Team #</Text>
                <TextInput
                  style={styles.input}
                  value={teamNumber}
                  onChangeText={handleTeamNumberChange}
                  keyboardType="number-pad"
                  placeholder="1234"
                />
              </View>
            </View>

            {/* Alliance Color Selection */}
            <View style={styles.allianceSection}>
              <Text style={styles.inputLabel}>Alliance</Text>
              <View style={styles.allianceRow}>
                <TouchableOpacity
                  style={[
                    styles.allianceButton,
                    styles.redAllianceButton,
                    allianceColor === 'red' && styles.redAllianceButtonActive,
                  ]}
                  onPress={async () => {
                    setAllianceColor('red');
                    await AsyncStorage.setItem(SELECTED_ALLIANCE_KEY, 'red');
                  }}
                >
                  <Text style={[
                    styles.allianceButtonText,
                    allianceColor === 'red' && styles.allianceButtonTextActive,
                  ]}>
                    Red
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.allianceButton,
                    styles.blueAllianceButton,
                    allianceColor === 'blue' && styles.blueAllianceButtonActive,
                  ]}
                  onPress={async () => {
                    setAllianceColor('blue');
                    await AsyncStorage.setItem(SELECTED_ALLIANCE_KEY, 'blue');
                  }}
                >
                  <Text style={[
                    styles.allianceButtonText,
                    allianceColor === 'blue' && styles.allianceButtonTextActive,
                  ]}>
                    Blue
                  </Text>
                </TouchableOpacity>
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
                onChangeText={handleMatchNumberChange}
                keyboardType="number-pad"
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Team #</Text>
              <TextInput
                style={styles.input}
                value={teamNumber}
                onChangeText={handleTeamNumberChange}
                keyboardType="number-pad"
                placeholder="1234"
              />
            </View>
          </View>
        )}

        {/* Alliance Color - Manual mode */}
        {!isTBAMode && (
          <View style={styles.allianceSection}>
            <Text style={styles.inputLabel}>Alliance</Text>
            <View style={styles.allianceRow}>
              <TouchableOpacity
                style={[
                  styles.allianceButton,
                  styles.redAllianceButton,
                  allianceColor === 'red' && styles.redAllianceButtonActive,
                ]}
                onPress={async () => {
                  setAllianceColor('red');
                  await AsyncStorage.setItem(SELECTED_ALLIANCE_KEY, 'red');
                }}
              >
                <Text style={[
                  styles.allianceButtonText,
                  allianceColor === 'red' && styles.allianceButtonTextActive,
                ]}>
                  Red
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.allianceButton,
                  styles.blueAllianceButton,
                  allianceColor === 'blue' && styles.blueAllianceButtonActive,
                ]}
                onPress={async () => {
                  setAllianceColor('blue');
                  await AsyncStorage.setItem(SELECTED_ALLIANCE_KEY, 'blue');
                }}
              >
                <Text style={[
                  styles.allianceButtonText,
                  allianceColor === 'blue' && styles.allianceButtonTextActive,
                ]}>
                  Blue
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Tracking Mode Chooser */}
        <View style={styles.trackingModeSection}>
          <Text style={styles.inputLabel}>Tracking</Text>
          <View style={styles.trackingModeRow}>
            {(['rate', 'static'] as const).map((mode) => (
              <TouchableOpacity
                key={mode}
                style={[styles.trackingModeBtn, trackingMode === mode && styles.trackingModeBtnActive]}
                onPress={() => {
                  setTrackingMode(mode);
                  AsyncStorage.setItem(TRACKING_MODE_KEY, mode);
                }}
              >
                <Text style={[styles.trackingModeBtnText, trackingMode === mode && styles.trackingModeBtnTextActive]}>
                  {mode === 'rate' ? 'Rate' : 'Static'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Phase Tabs */}
        <View style={styles.phaseTabs}>
          {ACTIVE_GAME_CONFIG.phases.map((phase, index) => (
            <TouchableOpacity
              key={phase.id}
              style={[
                styles.phaseTab,
                currentPhaseIndex === index && styles.phaseTabActive
              ]}
              onPress={() => {
                const targetPhase = ACTIVE_GAME_CONFIG.phases[index];
                const isSwitchingToAutonomous = targetPhase.id === 'auto';
                const isSwitchingFromAutonomous = isAutonomousPhase;
                
                // Only prevent switching AWAY from autonomous if timer is actively running
                // Always allow switching TO autonomous (or any phase) after timer completes
                if (isSwitchingFromAutonomous && !isSwitchingToAutonomous) {
                  // Trying to switch away from autonomous
                  if (matchStarted && !autonomousTimerCompleted && autonomousTimeRemaining !== null && autonomousTimeRemaining > 0) {
                    console.log('[Phase Switch] Blocked - timer still running:', autonomousTimeRemaining);
                    return;
                  }
                }
                
                console.log('[Phase Switch] Allowing switch to:', targetPhase.label, 'from:', currentPhase.label);
                setCurrentPhaseIndex(index);
              }}
            >
              <Text 
                style={[
                styles.phaseTabText,
                currentPhaseIndex === index && styles.phaseTabTextActive
                ]}
                numberOfLines={1}
                adjustsFontSizeToFit={true}
                minimumFontScale={0.7}
              >
                {phase.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Current Phase Metrics */}
        <View style={styles.metricsSection}>
          <Text style={styles.phaseTitle}>{currentPhase.label}</Text>
          
          {/* Countdown Toast - shows when 3 seconds remain in autonomous */}
          {showCountdownToast && autonomousTimeRemaining !== null && autonomousTimeRemaining > 0 && (
            <View style={styles.countdownToast}>
              <Text style={styles.countdownToastText}>
                Teleop starts in: {autonomousTimeRemaining}
              </Text>
            </View>
          )}
          
          {/* Muted/Darkened metrics when match hasn't started in autonomous (and timer hasn't completed) */}
          <View style={[
            isAutonomousPhase && !matchStarted && !autonomousTimerCompleted && styles.metricsMuted
          ]}>
          {currentPhase.metrics.map(metric => renderMetricInput(metric))}
        </View>

          {/* Begin Match Overlay - shows when autonomous is selected but match hasn't started and timer hasn't completed */}
          {isAutonomousPhase && !matchStarted && !autonomousTimerCompleted && (
            <TouchableOpacity
              style={styles.beginMatchOverlay}
              activeOpacity={1}
              onPress={() => {
                if (isKeyboardVisible) {
                  Keyboard.dismiss();
                } else {
                  startMatch();
                }
              }}
            >
              <View style={styles.beginMatchButton}>
                <Text style={styles.beginMatchButtonText}>Click to Begin Match</Text>
              </View>
            </TouchableOpacity>
          )}
        </View>

        {/* End Match Button */}
        <View ref={saveButtonContainerRef} onLayout={handleSaveButtonLayout}>
        <TouchableOpacity
          style={[
            styles.saveButton,
            (isSaving || !matchStarted) && styles.saveButtonDisabled,
          ]}
          onPress={handleEndMatch}
          disabled={isSaving || !matchStarted}
        >
          <Text style={styles.saveButtonText}>
            {isSaving ? 'Submitting...' : !matchStarted ? 'Start match first' : 'End Match'}
          </Text>
        </TouchableOpacity>
        </View>
      </ScrollView>
      </KeyboardAvoidingView>
      <SurveyModal
        visible={showSurveyModal}
        onClose={async () => {
          const id = pendingMatchIdRef.current;
          if (id) {
            try {
              await db.deleteMatch(id);
            } catch (_) {}
            pendingMatchIdRef.current = null;
          }
          setShowSurveyModal(false);
        }}
        onSubmit={handleSurveySubmit}
        isSubmitting={isSaving}
      />
    </SafeAreaView>
  );
}

const styles = {
  container: {
    flex: 1,
    backgroundColor: '#1a1a1a',
  },
  keyboardAvoidingView: {
    flex: 1,
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
    paddingBottom: 16,
  },
  matchInfo: {
    flexDirection: 'row' as const,
    gap: 12,
    marginTop: 16,
    marginBottom: 16,
  },
  allianceSection: {
    marginBottom: 16,
  },
  allianceRow: {
    flexDirection: 'row' as const,
    gap: 12,
  },
  allianceButton: {
    flex: 1,
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 12,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    borderWidth: 2,
  },
  redAllianceButton: {
    backgroundColor: '#2a2222',
    borderColor: '#5a4040',
  },
  redAllianceButtonActive: {
    backgroundColor: '#3a2a2a',
    borderColor: '#ef4444',
  },
  blueAllianceButton: {
    backgroundColor: '#22222a',
    borderColor: '#40405a',
  },
  blueAllianceButtonActive: {
    backgroundColor: '#2a2a3a',
    borderColor: '#3b82f6',
  },
  allianceButtonText: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: '#888',
  },
  allianceButtonTextActive: {
    color: '#fff',
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
    textAlign: 'center' as const,
  },
  phaseTabTextActive: {
    color: 'white',
  },
  metricsSection: {
    backgroundColor: '#2a2a2a',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    position: 'relative' as const,
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
    textAlign: 'center' as const,
  },
  selectOptionButtonTextActive: {
    color: 'white',
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
  demoModeButton: {
    alignSelf: 'flex-start',
    backgroundColor: '#2a2a2a',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#404040',
  },
  demoModeButtonActive: {
    backgroundColor: '#3a2a1a',
    borderColor: '#ff6600',
  },
  demoModeButtonText: {
    color: '#b0b0b0',
    fontSize: 13,
    fontWeight: '600' as const,
  },
  demoModeButtonTextActive: {
    color: '#ff6600',
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
    textAlign: 'center' as const,
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
    textAlign: 'center' as const,
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
    textAlign: 'center' as const,
  },
  beginMatchOverlay: {
    position: 'absolute' as const,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    zIndex: 10,
    borderRadius: 12,
  },
  beginMatchButton: {
    backgroundColor: '#ff6600',
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 12,
    minWidth: 200,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  beginMatchButtonText: {
    fontSize: 18,
    fontWeight: 'bold' as const,
    color: 'white',
    textAlign: 'center' as const,
  },
  metricsMuted: {
    opacity: 0.5,
  },
  countdownToast: {
    backgroundColor: '#ff6600',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    marginBottom: 16,
    alignSelf: 'center' as const,
    zIndex: 5,
  },
  countdownToastText: {
    fontSize: 18,
    fontWeight: 'bold' as const,
    color: 'white',
    textAlign: 'center' as const,
  },
  // Tracking mode chooser
  trackingModeSection: {
    marginBottom: 16,
  },
  trackingModeRow: {
    flexDirection: 'row' as const,
    gap: 8,
  },
  trackingModeBtn: {
    flex: 1,
    backgroundColor: '#2a2a2a',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    borderWidth: 2,
    borderColor: '#404040',
  },
  trackingModeBtnActive: {
    backgroundColor: '#2a2a2a',
    borderColor: '#ff6600',
  },
  trackingModeBtnText: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: '#b0b0b0',
  },
  trackingModeBtnTextActive: {
    color: '#ff6600',
  },
  // Static counter (replaces RapidCounter in static tracking mode)
  staticCounterRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 6,
  },
  staticCounterBtn: {
    flex: 1,
    backgroundColor: '#3a2a2a',
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    borderWidth: 1,
    borderColor: '#5a3030',
  },
  staticCounterBtnPos: {
    backgroundColor: '#2a3a2a',
    borderColor: '#305a30',
  },
  staticCounterBtnText: {
    fontSize: 13,
    fontWeight: '700' as const,
    color: '#e5e5e5',
  },
  staticCounterValue: {
    flex: 1.2,
    backgroundColor: '#1a1a1a',
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    borderWidth: 1,
    borderColor: '#404040',
  },
};