// app/scouter-schedule-edit.tsx - Edit scouter assignments for a single match
import { queryClient } from '@/config/queryClient';
import { queryKeys } from '@/config/queryKeys';
import {
  useScouterAssignments,
  useTeamScouters,
} from '@/hooks/useScouterAssignments';
import { useTeamContext } from '@/hooks/useTeamContext';
import {
  scouterScheduleService,
  ScouterAssignment,
} from '@/services/scouterScheduleService';
import { useAuthStore } from '@/stores/authStore';
import { useScouterScheduleStore } from '@/stores/scouterScheduleStore';
import { useLocalSearchParams, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

function getCompLevelLabel(level: string) {
  const labels: Record<string, string> = {
    qm: 'Qualification',
    qf: 'Quarterfinal',
    sf: 'Semifinal',
    f: 'Final',
  };
  return labels[level] || level.toUpperCase();
}

export default function ScouterScheduleEditScreen() {
  const params = useLocalSearchParams<{
    eventKey: string;
    matchKey: string;
    matchNumber: string;
    compLevel: string;
    redTeams: string;
    blueTeams: string;
  }>();
  const { eventKey, matchKey, matchNumber, compLevel, redTeams, blueTeams } =
    params;

  const user = useAuthStore((s) => s.user);
  const teamNumber = parseInt(user?.teamNumber || '0', 10);

  const { data: teamContext, isLoading: teamContextLoading } = useTeamContext(
    teamNumber && Number.isFinite(teamNumber) ? teamNumber : null
  );
  const teamId = teamContext?.teamId ?? null;

  const {
    data: assignments = [],
    isLoading: assignmentsLoading,
    isFetched: assignmentsFetched,
  } = useScouterAssignments(teamId, eventKey);
  const { data: scouters = [], isLoading: scoutersLoading } = useTeamScouters(teamId);

  const loading =
    teamContextLoading ||
    (!!teamId && !!eventKey && assignmentsLoading) ||
    (!!teamId && scoutersLoading);

  const [pickerTeam, setPickerTeam] = useState<{
    teamNumber: number;
    alliance: 'red' | 'blue';
  } | null>(null);
  const [saving, setSaving] = useState(false);
  // Local assignments: team_number -> scouter_name | null (null = None)
  const [localAssignments, setLocalAssignments] = useState<Record<number, string | null>>({});
  const localAssignmentsRef = useRef(localAssignments);
  localAssignmentsRef.current = localAssignments;

  const redTeamNums = useMemo(
    () => (redTeams ? redTeams.split(',').map((s) => parseInt(s.trim(), 10)).filter(Boolean) : []),
    [redTeams]
  );
  const blueTeamNums = useMemo(
    () => (blueTeams ? blueTeams.split(',').map((s) => parseInt(s.trim(), 10)).filter(Boolean) : []),
    [blueTeams]
  );

  const assignmentMap = useMemo(
    () => scouterScheduleService.getAssignmentMap(assignments),
    [assignments]
  );

  useFocusEffect(
    useCallback(() => {
      return () => {
        saveAssignments();
      };
    }, [saveAssignments])
  );

  // Init localAssignments from DB only when assignments have been fetched (avoids overwriting with [] before load)
  useEffect(() => {
    if (!assignmentsFetched || !redTeamNums.length) return;
    const map = scouterScheduleService.getAssignmentMap(assignments);
    const initial: Record<number, string | null> = {};
    for (const tn of [...redTeamNums, ...blueTeamNums]) {
      initial[tn] = map.get(`${matchKey}:${tn}`) ?? null;
    }
    localAssignmentsRef.current = initial;
    setLocalAssignments(initial);
  }, [assignmentsFetched, assignments, matchKey, redTeamNums, blueTeamNums]);

  const getScouter = (tn: number): string | null => {
    if (tn in localAssignments) return localAssignments[tn];
    return assignmentMap.get(`${matchKey}:${tn}`) ?? null;
  };

  const availableScoutersForPicker = useMemo(() => {
    if (!pickerTeam) return scouters;
    const excludeTeam = pickerTeam.teamNumber;
    const assignedElsewhere = new Set<string>();
    for (const tn of [...redTeamNums, ...blueTeamNums]) {
      if (tn === excludeTeam) continue;
      const name = tn in localAssignments ? localAssignments[tn] : (assignmentMap.get(`${matchKey}:${tn}`) ?? null);
      if (name) assignedElsewhere.add(name);
    }
    return scouters.filter((s) => !assignedElsewhere.has(s));
  }, [scouters, pickerTeam, localAssignments, assignmentMap, redTeamNums, blueTeamNums, matchKey]);

  const handleTeamPress = (teamNumber: number, alliance: 'red' | 'blue') => {
    setPickerTeam({ teamNumber, alliance });
  };

  const handleSelectScouter = (scouterName: string) => {
    if (!pickerTeam) return;
    const { teamNumber: tn } = pickerTeam;
    const value = scouterName === '__none__' ? null : scouterName;
    const next = { ...localAssignmentsRef.current, [tn]: value };
    localAssignmentsRef.current = next; // Update ref immediately so save has latest
    setLocalAssignments(next);
    setPickerTeam(null);
  };

  const setReturningFromEdit = useScouterScheduleStore((s) => s.setReturningFromEdit);

  const saveAssignments = useCallback(async () => {
    if (!teamId || !eventKey || !matchKey) return;
    const toSave = localAssignmentsRef.current;
    setSaving(true);
    try {
      const matchNum = parseInt(matchNumber, 10);
      const allTeams = redTeamNums.map((tn) => ({ tn, alliance: 'red' as const })).concat(
        blueTeamNums.map((tn) => ({ tn, alliance: 'blue' as const }))
      );
      for (const { tn, alliance } of allTeams) {
        const value = toSave[tn];
        // Only mutate when we have an explicit value (user touched this team)
        if (value !== undefined) {
          if (value) {
            await scouterScheduleService.upsertAssignment(
              teamId,
              eventKey,
              matchKey,
              matchNum,
              tn,
              alliance,
              value
            );
          } else {
            await scouterScheduleService.deleteAssignment(teamId, eventKey, matchKey, tn);
          }
        }
      }
      // Optimistic cache update so list shows new data immediately without refetch
      const queryKey = queryKeys.scouterAssignments.byTeamAndEvent(teamId, eventKey);
      const prev = queryClient.getQueryData<ScouterAssignment[]>(queryKey) ?? [];
      const otherMatches = prev.filter((a) => a.match_key !== matchKey);
      const updated: ScouterAssignment[] = [...otherMatches];
      for (const { tn, alliance } of allTeams) {
        const value = toSave[tn];
        if (value !== undefined && value) {
          updated.push({
            id: `opt-${matchKey}-${tn}`,
            team_id: teamId,
            event_key: eventKey,
            match_key: matchKey,
            match_number: matchNum,
            team_number: tn,
            alliance,
            scouter_name: value,
          });
        }
      }
      queryClient.setQueryData(queryKey, updated);
      setReturningFromEdit(false);
    } catch (e) {
      console.error('Error saving assignments:', e);
      Alert.alert('Error', 'Failed to save assignments. Please try again.');
      setReturningFromEdit(false);
      queryClient.invalidateQueries({
        queryKey: queryKeys.scouterAssignments.byTeamAndEvent(teamId, eventKey),
      });
    } finally {
      setSaving(false);
    }
  }, [teamId, eventKey, matchKey, matchNumber, redTeamNums, blueTeamNums, setReturningFromEdit]);


  const handleClosePicker = () => {
    setPickerTeam(null);
  };

  if (loading) {
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
        <Text style={styles.title}>
          {getCompLevelLabel(compLevel || '')} Match {matchNumber}
        </Text>
        <Text style={styles.subtitle}>Tap a team to assign a scouter</Text>
      </View>

      <View style={styles.content}>
        <View style={styles.allianceSection}>
          <Text style={styles.allianceLabel}>Red Alliance</Text>
          <View style={styles.teamRow}>
            {redTeamNums.map((tn) => (
              <TouchableOpacity
                key={tn}
                style={[styles.teamCard, styles.redTeamCard]}
                onPress={() => handleTeamPress(tn, 'red')}
              >
                <Text style={styles.teamNumber}>{tn}</Text>
                <Text style={styles.scouterLabel} numberOfLines={1}>
                  {getScouter(tn) || 'None'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={styles.allianceSection}>
          <Text style={styles.allianceLabel}>Blue Alliance</Text>
          <View style={styles.teamRow}>
            {blueTeamNums.map((tn) => (
              <TouchableOpacity
                key={tn}
                style={[styles.teamCard, styles.blueTeamCard]}
                onPress={() => handleTeamPress(tn, 'blue')}
              >
                <Text style={styles.teamNumber}>{tn}</Text>
                <Text style={styles.scouterLabel} numberOfLines={1}>
                  {getScouter(tn) || 'None'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </View>

      <Modal
        visible={!!pickerTeam}
        transparent
        animationType="fade"
        onRequestClose={handleClosePicker}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={handleClosePicker}
        >
          <View style={styles.modalContent} onStartShouldSetResponder={() => true}>
            <Text style={styles.modalTitle}>
              Assign scouter for Team {pickerTeam?.teamNumber}
            </Text>
            <TouchableOpacity
              style={styles.pickerOption}
              onPress={() => handleSelectScouter('__none__')}
            >
              <Text style={styles.pickerOptionText}>None</Text>
            </TouchableOpacity>
            <FlatList
              data={availableScoutersForPicker}
              keyExtractor={(item) => item}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.pickerOption}
                  onPress={() => handleSelectScouter(item)}
                >
                  <Text style={styles.pickerOptionText}>{item}</Text>
                </TouchableOpacity>
              )}
              style={styles.pickerList}
            />
            <TouchableOpacity style={styles.cancelButton} onPress={handleClosePicker}>
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
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
  content: {
    flex: 1,
    padding: 16,
  },
  allianceSection: {
    marginBottom: 24,
  },
  allianceLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#e5e5e5',
    marginBottom: 12,
  },
  teamRow: {
    flexDirection: 'row',
    gap: 12,
  },
  teamCard: {
    flex: 1,
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    minHeight: 80,
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
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 4,
  },
  scouterLabel: {
    fontSize: 12,
    color: '#b0b0b0',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalContent: {
    backgroundColor: '#2a2a2a',
    borderRadius: 16,
    padding: 20,
    width: '100%',
    maxWidth: 320,
    maxHeight: '70%',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 16,
    textAlign: 'center',
  },
  pickerList: {
    maxHeight: 240,
  },
  pickerOption: {
    padding: 16,
    borderRadius: 8,
    marginBottom: 8,
    backgroundColor: '#3a3a3a',
  },
  pickerOptionText: {
    fontSize: 16,
    color: '#fff',
    textAlign: 'center',
  },
  cancelButton: {
    marginTop: 16,
    padding: 12,
    alignItems: 'center',
  },
  cancelButtonText: {
    fontSize: 16,
    color: '#b0b0b0',
  },
});
