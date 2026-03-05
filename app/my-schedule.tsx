// app/my-schedule.tsx - Scouter's assigned matches from schedule
import { TBAMatch } from '@/api/types';
import BettingModal from '@/components/betting/BettingModal';
import { bettingService } from '@/services/bettingService';
import { useEventMatches } from '@/hooks/useEventMatches';
import { useMySchedule, type AssignmentRow } from '@/hooks/useMySchedule';
import { useAuthStore } from '@/stores/authStore';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const SELECTED_EVENT_KEY = 'selected_event_key';
const SELECTED_EVENT_NAME_KEY = 'selected_event_name';
const SELECTED_MATCH_KEY = 'selected_match_key';
const SELECTED_MATCH_NUMBER_KEY = 'selected_match_number';
const SELECTED_TEAM_NUMBER_KEY = 'selected_team_number';
const SELECTED_ALLIANCE_KEY = 'selected_alliance_color';

export default function MyScheduleScreen() {
  const user = useAuthStore((s) => s.user);
  const getScoutName = useAuthStore((s) => s.getScoutName);

  const [eventKey, setEventKey] = useState<string | null>(null);
  const [eventName, setEventName] = useState<string | null>(null);
  const [scoutName, setScoutName] = useState<string | null>(null);

  const loadEventFromStorage = useCallback(async () => {
    const [storedKey, storedName, name] = await Promise.all([
      AsyncStorage.getItem(SELECTED_EVENT_KEY),
      AsyncStorage.getItem(SELECTED_EVENT_NAME_KEY),
      getScoutName(),
    ]);
    setEventKey(storedKey);
    setEventName(storedName);
    setScoutName(name);
  }, [getScoutName]);

  useFocusEffect(useCallback(() => void loadEventFromStorage(), [loadEventFromStorage]));

  const teamNumber = parseInt(user?.teamNumber || '0', 10);
  const { data, isLoading } = useMySchedule(
    teamNumber && Number.isFinite(teamNumber) ? teamNumber : null,
    eventKey,
    scoutName
  );

  const assignments = data?.assignments ?? [];
  const scoutedSet = data?.scoutedSet ?? new Set<string>();

  const { data: matches } = useEventMatches(eventKey, { staleTime: 10_000 });
  const matchByKey = useMemo(() => {
    const map = new Map<string, TBAMatch>();
    matches?.forEach((m) => map.set(m.key, m));
    return map;
  }, [matches]);

  const [bettingMatch, setBettingMatch] = useState<TBAMatch | null>(null);

  const handlePlaceBet = useCallback(
    async (item: AssignmentRow) => {
      let match = matchByKey.get(item.match_key);
      if (!match) {
        match = await bettingService.getMatchResult(item.match_key);
      }
      if (match) setBettingMatch(match);
    },
    [matchByKey]
  );

  const handleSelectEvent = () => {
    router.push('/select-event' as any);
  };

  const handleCardPress = async (item: AssignmentRow) => {
    const key = `${item.match_number}:${item.team_number}`;
    const isScouted = scoutedSet.has(key);

    if (isScouted) {
      Alert.alert(
        'Already scouted',
        'You have already scouted this match. Rescout?',
        [
          { text: 'No', style: 'cancel' },
          { text: 'Yes', onPress: () => proceedToScout(item) },
        ]
      );
    } else {
      await proceedToScout(item);
    }
  };

  const proceedToScout = async (item: AssignmentRow) => {
    await AsyncStorage.setItem(SELECTED_MATCH_KEY, item.match_key);
    await AsyncStorage.setItem(SELECTED_MATCH_NUMBER_KEY, String(item.match_number));
    await AsyncStorage.setItem(SELECTED_TEAM_NUMBER_KEY, String(item.team_number));
    await AsyncStorage.setItem(SELECTED_ALLIANCE_KEY, item.alliance);

    router.replace({
      pathname: '/(tabs)' as any,
      params: {
        matchNumber: String(item.match_number),
        teamNumber: String(item.team_number),
        fromTBA: 'true',
        allianceColor: item.alliance,
      },
    });
  };

  if (!eventKey?.trim()) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centerContent}>
          <Text style={styles.emptyTitle}>No Event Selected</Text>
          <Text style={styles.emptyText}>
            Select an event to view your scouter schedule.
          </Text>
          <TouchableOpacity style={styles.primaryButton} onPress={handleSelectEvent}>
            <Text style={styles.primaryButtonText}>Select Event</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

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

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>My Schedule</Text>
        <Text style={styles.subtitle}>{eventName || eventKey}</Text>
      </View>

      {assignments.length === 0 ? (
        <View style={styles.centerContent}>
          <Text style={styles.emptyTitle}>No Assignments</Text>
          <Text style={styles.emptyText}>
            You have no matches assigned for this event.
          </Text>
        </View>
      ) : (
        <FlatList
          data={assignments}
          keyExtractor={(item) => `${item.match_key}-${item.team_number}`}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => {
            const key = `${item.match_number}:${item.team_number}`;
            const isScouted = scoutedSet.has(key);
            const isRed = item.alliance === 'red';
            return (
              <View
                style={[
                  styles.card,
                  isRed ? styles.redCard : styles.blueCard,
                  isScouted && styles.cardScouted,
                ]}
              >
                <TouchableOpacity
                  style={styles.cardContent}
                  onPress={() => handleCardPress(item)}
                  activeOpacity={0.8}
                >
                  <View style={styles.cardTextRow}>
                    <Text style={styles.cardMatch}>Match {item.match_number}</Text>
                    <Text style={styles.cardTeam}>Team {item.team_number}</Text>
                  </View>
                  {isScouted && (
                    <Text style={styles.scoutedBadge}>Scouted</Text>
                  )}
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.placeBetButton}
                  onPress={() => handlePlaceBet(item)}
                >
                  <Text style={styles.placeBetButtonText}>Place Bet</Text>
                </TouchableOpacity>
              </View>
            );
          }}
        />
      )}

      {bettingMatch && eventKey && (
        <BettingModal
          visible={!!bettingMatch}
          onClose={() => setBettingMatch(null)}
          match={bettingMatch}
          eventKey={eventKey}
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
  },
  primaryButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  listContent: {
    padding: 16,
    paddingBottom: 32,
  },
  card: {
    padding: 12,
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 2,
    position: 'relative',
  },
  cardContent: {
    flex: 1,
    position: 'relative',
  },
  cardTextRow: {
    marginBottom: 4,
  },
  redCard: {
    backgroundColor: '#3a2a2a',
    borderColor: '#ef4444',
  },
  blueCard: {
    backgroundColor: '#2a2a3a',
    borderColor: '#3b82f6',
  },
  cardScouted: {
    opacity: 0.6,
  },
  cardMatch: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 4,
  },
  cardTeam: {
    fontSize: 16,
    color: '#e5e5e5',
  },
  scoutedBadge: {
    position: 'absolute',
    top: 0,
    right: 0,
    fontSize: 12,
    fontWeight: '600',
    color: '#10b981',
  },
  placeBetButton: {
    backgroundColor: '#ff6600',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignSelf: 'flex-start',
    marginTop: 12,
  },
  placeBetButtonText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
  },
});
