import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { adminService } from '@/services/adminService';
import { DataVisibility, useDataVisibilityStore } from '@/stores/dataVisibilityStore';
import { supabase } from '@/lib/supabase';

export default function SettingsScreen() {
  const { visibility, setVisibility } = useDataVisibilityStore();
  const [teamCode, setTeamCode] = useState<string>('');
  const [adminCode, setAdminCode] = useState<string | null>(null);
  const [adminCodeVisible, setAdminCodeVisible] = useState(false);
  const [loadingAdminCode, setLoadingAdminCode] = useState(false);

  useEffect(() => {
    const loadTeamCode = async () => {
      const stored = await AsyncStorage.getItem('team_code');
      if (stored) {
        setTeamCode(stored);
        return;
      }
      const teamId = await AsyncStorage.getItem('team_id');
      if (!teamId) return;
      const { data } = await supabase
        .from('teams')
        .select('team_code')
        .eq('id', teamId)
        .single();
      if (data?.team_code) {
        setTeamCode(data.team_code);
        await AsyncStorage.setItem('team_code', data.team_code);
      }
    };
    loadTeamCode();

    const loadAdminCode = async () => {
      setLoadingAdminCode(true);
      try {
        const teamId = await AsyncStorage.getItem('team_id');
        if (teamId) {
          const code = await adminService.getAdminCode(teamId);
          setAdminCode(code);
        }
      } catch {
        // silently fail
      } finally {
        setLoadingAdminCode(false);
      }
    };
    loadAdminCode();
  }, []);

  const visibilityOptions: { value: DataVisibility; label: string; description: string }[] = [
    {
      value: 'my_team',
      label: 'My Team',
      description: 'Only data scouted by your team members',
    },
    {
      value: 'teams_at_event',
      label: 'Teams at Event',
      description: 'Data scouted by any team at your selected event',
    },
    {
      value: 'all_teams',
      label: 'All Teams',
      description: 'Data scouted by any team in the database',
    },
  ];

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Account Section */}
        <Text style={styles.sectionHeader}>Account</Text>
        <View style={styles.card}>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Team Code</Text>
            <Text style={styles.rowValue}>{teamCode || '—'}</Text>
          </View>
          <View style={styles.rowDivider} />
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Admin Code</Text>
            <View style={styles.adminCodeRow}>
              {loadingAdminCode ? (
                <ActivityIndicator size="small" color="#ff6600" />
              ) : (
                <>
                  <Text style={styles.rowValue}>
                    {adminCode
                      ? adminCodeVisible
                        ? adminCode
                        : '••••'
                      : '—'}
                  </Text>
                  {adminCode && (
                    <TouchableOpacity
                      onPress={() => setAdminCodeVisible((v) => !v)}
                      style={styles.eyeButton}
                    >
                      <Ionicons
                        name={adminCodeVisible ? 'eye-off-outline' : 'eye-outline'}
                        size={20}
                        color="#b0b0b0"
                      />
                    </TouchableOpacity>
                  )}
                </>
              )}
            </View>
          </View>
        </View>

        {/* Data Visibility Section */}
        <Text style={styles.sectionHeader}>Data Visibility</Text>
        <Text style={styles.sectionDescription}>
          Controls what scouting data is shown in Analytics
        </Text>
        <View style={styles.card}>
          {visibilityOptions.map((opt, index) => (
            <View key={opt.value}>
              {index > 0 && <View style={styles.rowDivider} />}
              <TouchableOpacity
                style={styles.visibilityRow}
                onPress={() => setVisibility(opt.value)}
                activeOpacity={0.7}
              >
                <View style={styles.visibilityText}>
                  <Text style={styles.visibilityLabel}>{opt.label}</Text>
                  <Text style={styles.visibilityDescription}>{opt.description}</Text>
                </View>
                <View
                  style={[
                    styles.radio,
                    visibility === opt.value && styles.radioSelected,
                  ]}
                >
                  {visibility === opt.value && <View style={styles.radioDot} />}
                </View>
              </TouchableOpacity>
            </View>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a1a',
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },
  sectionHeader: {
    color: '#ff6600',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 8,
    marginTop: 20,
    marginLeft: 4,
  },
  sectionDescription: {
    color: '#888',
    fontSize: 13,
    marginBottom: 10,
    marginLeft: 4,
  },
  card: {
    backgroundColor: '#2a2a2a',
    borderRadius: 14,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  rowLabel: {
    color: '#e5e5e5',
    fontSize: 15,
    fontWeight: '500',
  },
  rowValue: {
    color: '#b0b0b0',
    fontSize: 15,
  },
  rowDivider: {
    height: 1,
    backgroundColor: '#333',
    marginHorizontal: 16,
  },
  adminCodeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  eyeButton: {
    padding: 2,
  },
  visibilityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
  },
  visibilityText: {
    flex: 1,
  },
  visibilityLabel: {
    color: '#e5e5e5',
    fontSize: 15,
    fontWeight: '500',
  },
  visibilityDescription: {
    color: '#888',
    fontSize: 13,
    marginTop: 2,
  },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: '#555',
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioSelected: {
    borderColor: '#ff6600',
  },
  radioDot: {
    width: 11,
    height: 11,
    borderRadius: 5.5,
    backgroundColor: '#ff6600',
  },
});
