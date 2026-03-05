// app/scouter-schedules.tsx - View/Edit scouter schedule assignments
import { queryClient } from '@/config/queryClient';
import { queryKeys } from '@/config/queryKeys';
import { useEventMatches } from '@/hooks/useEventMatches';
import {
  useScouterAssignments,
  useTeamScouters,
} from '@/hooks/useScouterAssignments';
import { useTeamContext } from '@/hooks/useTeamContext';
import { scouterScheduleService } from '@/services/scouterScheduleService';
import { useAuthStore } from '@/stores/authStore';
import { useScouterScheduleStore } from '@/stores/scouterScheduleStore';
import { TBAMatch } from '@/api/types';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  SectionList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

function SkeletonBox({ style }: { style?: object }) {
  const opacity = useRef(new Animated.Value(0.3)).current;
  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 0.6,
          duration: 600,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0.3,
          duration: 600,
          useNativeDriver: true,
        }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, [opacity]);
  return <Animated.View style={[styles.skeletonBox, style, { opacity }]} />;
}

function MatchScheduleCardSkeleton({ match }: { match: TBAMatch }) {
  const redCount = match.alliances.red.team_keys.length;
  const blueCount = match.alliances.blue.team_keys.length;

  return (
    <View style={styles.matchCard}>
      <SkeletonBox style={styles.skeletonMatchNumber} />
      <View style={styles.cardContent}>
        <View style={styles.allianceSection}>
          <Text style={styles.allianceLabel}>Red Alliance</Text>
          <View style={styles.teamRow}>
            {Array.from({ length: redCount }).map((_, i) => (
              <View key={`r-${i}`} style={[styles.teamCard, styles.redTeamCard]}>
                <SkeletonBox style={styles.skeletonTeamNum} />
                <SkeletonBox style={styles.skeletonScouter} />
              </View>
            ))}
          </View>
        </View>
        <View style={styles.allianceSection}>
          <Text style={styles.allianceLabel}>Blue Alliance</Text>
          <View style={styles.teamRow}>
            {Array.from({ length: blueCount }).map((_, i) => (
              <View key={`b-${i}`} style={[styles.teamCard, styles.blueTeamCard]}>
                <SkeletonBox style={styles.skeletonTeamNum} />
                <SkeletonBox style={styles.skeletonScouter} />
              </View>
            ))}
          </View>
        </View>
      </View>
    </View>
  );
}

function getCompLevelLabel(level: string) {
  const labels: Record<string, string> = {
    qm: 'Qualification',
    qf: 'Quarterfinal',
    sf: 'Semifinal',
    f: 'Final',
  };
  return labels[level] || level.toUpperCase();
}

function MatchScheduleCard({
  match,
  assignments,
  onPress,
}: {
  match: TBAMatch;
  assignments: Map<string, string>;
  onPress: () => void;
}) {
  const getScouter = (teamNum: number) =>
    assignments.get(`${match.key}:${teamNum}`) ?? null;

  const redTeams = match.alliances.red.team_keys.map((k) =>
    parseInt(k.replace('frc', ''), 10)
  );
  const blueTeams = match.alliances.blue.team_keys.map((k) =>
    parseInt(k.replace('frc', ''), 10)
  );

  return (
    <TouchableOpacity style={styles.matchCard} onPress={onPress} activeOpacity={0.8}>
      <Text style={styles.matchNumber}>Match {match.match_number}</Text>
      <View style={styles.cardContent}>
        <View style={styles.allianceSection}>
          <Text style={styles.allianceLabel}>Red Alliance</Text>
          <View style={styles.teamRow}>
            {redTeams.map((tn) => (
              <View key={tn} style={[styles.teamCard, styles.redTeamCard]}>
                <Text style={styles.teamNumber}>{tn}</Text>
                <Text style={styles.scouterLabel} numberOfLines={1}>
                  {getScouter(tn) || 'None'}
                </Text>
              </View>
            ))}
          </View>
        </View>
        <View style={styles.allianceSection}>
          <Text style={styles.allianceLabel}>Blue Alliance</Text>
          <View style={styles.teamRow}>
            {blueTeams.map((tn) => (
              <View key={tn} style={[styles.teamCard, styles.blueTeamCard]}>
                <Text style={styles.teamNumber}>{tn}</Text>
                <Text style={styles.scouterLabel} numberOfLines={1}>
                  {getScouter(tn) || 'None'}
                </Text>
              </View>
            ))}
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
}

const STALE_TIME_MS = 500;

export default function ScouterSchedulesScreen() {
  const user = useAuthStore((s) => s.user);
  const teamNumber = parseInt(user?.teamNumber || '0', 10);
  const [eventKey, setEventKey] = useState<string | null>(null);
  const [eventName, setEventName] = useState<string | null>(null);

  const loadEventFromStorage = useCallback(async () => {
    const [storedKey, storedName] = await Promise.all([
      AsyncStorage.getItem('selected_event_key'),
      AsyncStorage.getItem('selected_event_name'),
    ]);
    setEventKey(storedKey);
    setEventName(storedName);
  }, []);

  const returningFromEdit = useScouterScheduleStore((s) => s.returningFromEdit);
  const setReturningFromEdit = useScouterScheduleStore((s) => s.setReturningFromEdit);
  const scheduleGenerating = useScouterScheduleStore((s) => s.scheduleGenerating);
  const setScheduleGenerating = useScouterScheduleStore((s) => s.setScheduleGenerating);

  useFocusEffect(
    useCallback(() => {
      loadEventFromStorage();
      // Refetch when returning from elsewhere, but skip when coming back from edit
      // (edit does optimistic cache update, so no refetch needed)
      if (teamId && eventKey?.trim() && !returningFromEdit) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.scouterAssignments.byTeamAndEvent(teamId, eventKey),
        });
      }
    }, [loadEventFromStorage, teamId, eventKey, returningFromEdit])
  );

  const { data: teamContext, isLoading: teamContextLoading } = useTeamContext(
    teamNumber && Number.isFinite(teamNumber) ? teamNumber : null
  );
  const teamId = teamContext?.teamId ?? null;

  const { data: matches, isLoading: matchesLoading } = useEventMatches(eventKey, {
    staleTime: STALE_TIME_MS,
  });
  const {
    data: assignments = [],
    isLoading: assignmentsLoading,
    isFetching: assignmentsFetching,
  } = useScouterAssignments(teamId, eventKey);
  const { data: scouters = [] } = useTeamScouters(teamId);

  const showSkeletonCards =
    assignmentsFetching && !assignmentsLoading && !!matches?.length && assignments.length === 0;

  const assignmentMap = useMemo(
    () => scouterScheduleService.getAssignmentMap(assignments),
    [assignments]
  );

  const groupedMatches = useMemo(() => {
    if (!matches || matches.length === 0) return [];
    const groups: Record<string, TBAMatch[]> = {};
    matches.forEach((m) => {
      if (!groups[m.comp_level]) groups[m.comp_level] = [];
      groups[m.comp_level].push(m);
    });
    const order = ['qm', 'qf', 'sf', 'f'];
    return order
      .filter((l) => groups[l]?.length)
      .map((l) => ({ title: getCompLevelLabel(l), data: groups[l] }));
  }, [matches]);

  const handleSelectEvent = () => {
    router.push('/select-event' as any);
  };

  const handleGenerateSchedule = useCallback(async () => {
    if (!teamId || !eventKey?.trim()) return;
    if (scheduleGenerating) return;
    if (scouters.length < 6) {
      Alert.alert(
        'Not Enough Scouters',
        `Need at least 6 scouters registered. You have ${scouters.length}.`
      );
      return;
    }
    setScheduleGenerating(true);
    try {
      const result = await scouterScheduleService.generateSchedule(teamId, eventKey);
      if (result.success) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.scouterAssignments.byTeamAndEvent(teamId, eventKey),
        });
        Alert.alert('Success', 'Schedule generated for all matches.');
      } else {
        Alert.alert('Error', result.error);
      }
    } catch (e) {
      console.error('Error generating schedule:', e);
      Alert.alert('Error', 'Failed to generate schedule. Please try again.');
    } finally {
      setScheduleGenerating(false);
    }
  }, [teamId, eventKey, scouters.length, scheduleGenerating, setScheduleGenerating]);

  const handleMatchPress = (match: TBAMatch) => {
    if (!teamId || !eventKey) return;
    setReturningFromEdit(true);
    const redTeams = match.alliances.red.team_keys.map((k) =>
      parseInt(k.replace('frc', ''), 10)
    );
    const blueTeams = match.alliances.blue.team_keys.map((k) =>
      parseInt(k.replace('frc', ''), 10)
    );
    router.push({
      pathname: '/scouter-schedule-edit' as any,
      params: {
        eventKey,
        matchKey: match.key,
        matchNumber: String(match.match_number),
        compLevel: match.comp_level,
        redTeams: redTeams.join(','),
        blueTeams: blueTeams.join(','),
      },
    });
  };

  if (!eventKey?.trim()) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centerContent}>
          <Text style={styles.emptyTitle}>No Event Selected</Text>
          <Text style={styles.emptyText}>
            Select an event to view and edit scouter schedules.
          </Text>
          <TouchableOpacity style={styles.primaryButton} onPress={handleSelectEvent}>
            <Text style={styles.primaryButtonText}>Select Event</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Text style={styles.backButtonText}>Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const isLoading =
    (!!eventKey?.trim() && teamContextLoading) ||
    (!!teamId && !!eventKey?.trim() && assignmentsLoading) ||
    matchesLoading;

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#ff6600" />
          <Text style={styles.loadingText}>Loading...</Text>
        </View>
      </SafeAreaView>
    );
  }

  const canGenerate = scouters.length >= 6;
  const scouterCountText = `${scouters.length} scouters registered`;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Scouter Schedules</Text>
        <Text style={styles.subtitle}>{eventName || eventKey}</Text>
        <Text style={styles.scouterCount}>{scouterCountText}</Text>
        <TouchableOpacity
          style={[
            styles.generateButton,
            (!canGenerate || scheduleGenerating) && styles.generateButtonDisabled,
          ]}
          onPress={handleGenerateSchedule}
          disabled={!canGenerate || scheduleGenerating}
        >
          {scheduleGenerating ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.generateButtonText}>
              {canGenerate ? 'Generate Schedule' : 'Need 6+ Scouters'}
            </Text>
          )}
        </TouchableOpacity>
        {scheduleGenerating && (
          <Text style={styles.generatingHint}>Generating schedule, you can leave the page</Text>
        )}
      </View>
      {!matches || matches.length === 0 ? (
        <View style={styles.centerContent}>
          <Text style={styles.emptyTitle}>No Matches</Text>
          <Text style={styles.emptyText}>
            No matches found for this event.
          </Text>
        </View>
      ) : (
        <SectionList
          sections={groupedMatches}
          keyExtractor={(item) => item.key}
          renderItem={({ item }) =>
            showSkeletonCards ? (
              <MatchScheduleCardSkeleton match={item} />
            ) : (
              <MatchScheduleCard
                match={item}
                assignments={assignmentMap}
                onPress={() => handleMatchPress(item)}
              />
            )
          }
          renderSectionHeader={({ section: { title } }) => (
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionHeaderText}>{title}</Text>
            </View>
          )}
          contentContainerStyle={styles.listContent}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a1a',
  },
  header: {
    backgroundColor: '#ff6600',
    padding: 20,
    paddingBottom: 16,
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    color: 'white',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.9)',
    marginBottom: 4,
  },
  scouterCount: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.8)',
    marginBottom: 12,
  },
  generateButton: {
    backgroundColor: '#2a2a2a',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignSelf: 'flex-start',
    minWidth: 160,
    alignItems: 'center',
  },
  generateButtonDisabled: {
    opacity: 0.6,
  },
  generateButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  generatingHint: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.85)',
    marginTop: 8,
    fontStyle: 'italic',
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
  centerContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    color: '#b0b0b0',
    textAlign: 'center',
    marginBottom: 24,
  },
  primaryButton: {
    backgroundColor: '#ff6600',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
    marginBottom: 12,
  },
  primaryButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  backButton: {
    paddingVertical: 8,
  },
  backButtonText: {
    color: '#b0b0b0',
    fontSize: 16,
  },
  listContent: {
    padding: 16,
    paddingBottom: 32,
  },
  sectionHeader: {
    backgroundColor: '#404040',
    padding: 12,
    marginTop: 8,
    marginBottom: 8,
    borderRadius: 8,
  },
  sectionHeaderText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#e5e5e5',
  },
  matchCard: {
    backgroundColor: '#2a2a2a',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#404040',
  },
  matchNumber: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 10,
  },
  cardContent: {
    gap: 0,
  },
  allianceSection: {
    marginBottom: 12,
  },
  allianceLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#e5e5e5',
    marginBottom: 6,
  },
  teamRow: {
    flexDirection: 'row',
    gap: 8,
  },
  teamCard: {
    flex: 1,
    padding: 8,
    borderRadius: 8,
    alignItems: 'center',
    minHeight: 44,
    justifyContent: 'center',
  },
  redTeamCard: {
    backgroundColor: '#3a2a2a',
    borderWidth: 2,
    borderColor: '#ef4444',
  },
  blueTeamCard: {
    backgroundColor: '#2a2a3a',
    borderWidth: 2,
    borderColor: '#3b82f6',
  },
  teamNumber: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 2,
  },
  scouterLabel: {
    fontSize: 10,
    color: '#b0b0b0',
  },
  skeletonBox: {
    backgroundColor: '#404040',
    borderRadius: 4,
  },
  skeletonMatchNumber: {
    width: 80,
    height: 16,
    marginBottom: 10,
  },
  skeletonTeamNum: {
    width: 24,
    height: 14,
    alignSelf: 'center',
    marginBottom: 4,
  },
  skeletonScouter: {
    width: 40,
    height: 8,
    alignSelf: 'center',
  },
});
