import { adminService, MatchRow, TeamContext } from '@/services/adminService';
import { useAdminStore } from '@/stores/adminStore';
import { useAuthStore } from '@/stores/authStore';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { format } from 'date-fns';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  AppState,
  AppStateStatus,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

function formatTimestamp(ts: number) {
  // heuristic: ms vs seconds
  const ms = ts > 1_000_000_000_000 ? ts : ts * 1000;
  return format(new Date(ms), 'MMM d, h:mm a');
}

function Toast({ message, kind }: { message: string; kind: 'success' | 'error' }) {
  return (
    <View style={[styles.toast, kind === 'success' ? styles.toastSuccess : styles.toastError]}>
      <Text style={styles.toastText}>{message}</Text>
    </View>
  );
}

export function AdminPanel() {
  const user = useAuthStore((s) => s.user);
  const lock = useAdminStore((s) => s.lock);

  const [team, setTeam] = useState<TeamContext | null>(null);
  const [matches, setMatches] = useState<MatchRow[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [toast, setToast] = useState<{ message: string; kind: 'success' | 'error' } | null>(null);

  const teamNumber = useMemo(() => {
    const num = parseInt(user?.teamNumber || '', 10);
    return Number.isFinite(num) ? num : null;
  }, [user?.teamNumber]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (nextState: AppStateStatus) => {
      if (nextState !== 'active') lock();
    });
    return () => sub.remove();
  }, [lock]);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 2500);
    return () => clearTimeout(id);
  }, [toast]);

  const load = useCallback(async () => {
    if (!teamNumber) {
      setToast({ message: 'Team context missing. Please log out and log in again.', kind: 'error' });
      setLoading(false);
      return;
    }

    try {
      const ctx = await adminService.getTeamContext(teamNumber);
      setTeam(ctx);
      const rows = await adminService.listTeamMatches(ctx.teamId);
      setMatches(rows);
    } catch (e) {
      setToast({ message: e instanceof Error ? e.message : 'Failed to load data.', kind: 'error' });
    } finally {
      setLoading(false);
    }
  }, [teamNumber]);

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await load();
    } finally {
      setRefreshing(false);
    }
  }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return matches;
    return matches.filter((m) => {
      const parts = [
        String(m.match_number),
        String(m.team_number),
        String(m.scout_name || ''),
        String(m.event_id || ''),
      ];
      return parts.some((p) => p.toLowerCase().includes(q));
    });
  }, [matches, search]);

  const handleLock = () => {
    Alert.alert('Lock Admin', 'Lock the admin panel?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Lock', style: 'destructive', onPress: () => lock() },
    ]);
  };

  const handleDelete = (item: MatchRow) => {
    if (!team?.teamId) return;

    Alert.alert(
      'Delete Entry',
      'Are you sure you want to delete this entry? This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await adminService.deleteMatch(team.teamId, item.id);
              setMatches((prev) => prev.filter((m) => m.id !== item.id));
              setToast({ message: 'Entry deleted.', kind: 'success' });
            } catch (e) {
              setToast({ message: e instanceof Error ? e.message : 'Delete failed.', kind: 'error' });
            }
          },
        },
      ]
    );
  };

  const handleResetAdminCode = () => {
    if (!team?.teamId) return;

    Alert.alert('Reset Admin Code', 'Generate a new admin code? Old code will stop working immediately.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Reset',
        style: 'destructive',
        onPress: async () => {
          try {
            const { newAdminCode } = await adminService.resetAdminCode(team.teamId);
            Alert.alert('New Admin Code', `Your new admin code is: ${newAdminCode}\n\nWrite it down now.`);
            setToast({ message: 'Admin code reset.', kind: 'success' });
            lock();
          } catch (e) {
            setToast({ message: e instanceof Error ? e.message : 'Reset failed.', kind: 'error' });
          }
        },
      },
    ]);
  };

  const headerText = useMemo(() => {
    if (!team) return 'Admin Panel';
    const name = team.teamName ? `${team.teamName} ` : '';
    return `${name}(#${team.teamNumber})`;
  }, [team]);

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator color="#ff6600" />
        <Text style={styles.loadingText}>Loading…</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {toast ? <Toast message={toast.message} kind={toast.kind} /> : null}

      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Admin Panel</Text>
          <Text style={styles.subtitle}>{headerText}</Text>
        </View>
        <TouchableOpacity
          style={styles.iconButton}
          onPress={onRefresh}
          disabled={refreshing}
          accessibilityRole="button"
        >
          <FontAwesome name="refresh" size={18} color="#ff6600" />
        </TouchableOpacity>
        <TouchableOpacity style={styles.lockButton} onPress={handleLock}>
          <FontAwesome name="lock" size={16} color="#fff" />
          <Text style={styles.lockButtonText}>Lock</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.searchRow}>
        <FontAwesome name="search" size={16} color="#b0b0b0" />
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Search match #, team #, scout, event…"
          placeholderTextColor="#888"
          style={styles.searchInput}
          autoCapitalize="none"
          autoCorrect={false}
        />
      </View>

      <View style={styles.actionsRow}>
        <TouchableOpacity style={styles.resetButton} onPress={handleResetAdminCode}>
          <FontAwesome name="refresh" size={16} color="#ff6600" />
          <Text style={styles.resetButtonText}>Reset Admin Code</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        contentContainerStyle={[
          filtered.length === 0 ? styles.emptyContainer : undefined,
          { paddingBottom: 0 }
        ]}
        ListEmptyComponent={<Text style={styles.emptyText}>No scouting entries found.</Text>}
        renderItem={({ item }) => (
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle}>
                Match {item.match_number} • Team {item.team_number}
              </Text>
              <Text style={styles.rowMeta}>
                {formatTimestamp(item.timestamp)}
                {item.scout_name ? ` • ${item.scout_name}` : ''}
                {typeof item.calculated_points === 'number' ? ` • ${item.calculated_points} pts` : ''}
              </Text>
              {item.notes ? <Text style={styles.rowNotes} numberOfLines={2}>{item.notes}</Text> : null}
            </View>

            <TouchableOpacity style={styles.deleteButton} onPress={() => handleDelete(item)}>
              <FontAwesome name="trash" size={18} color="#ef4444" />
            </TouchableOpacity>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a1a',
    padding: 16,
    paddingBottom: 0,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#ff6600',
  },
  subtitle: {
    marginTop: 2,
    color: '#b0b0b0',
  },
  lockButton: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    backgroundColor: '#2a2a2a',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#404040',
  },
  lockButtonText: {
    color: '#fff',
    fontWeight: '700',
  },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2a2a2a',
    borderWidth: 1,
    borderColor: '#404040',
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#2a2a2a',
    borderWidth: 1,
    borderColor: '#404040',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 12,
  },
  searchInput: {
    flex: 1,
    color: '#fff',
    fontSize: 14,
  },
  actionsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    marginBottom: 12,
  },
  resetButton: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    backgroundColor: '#2a2a2a',
    borderWidth: 1,
    borderColor: '#404040',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
  },
  resetButtonText: {
    color: '#ff6600',
    fontWeight: '700',
  },
  row: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'flex-start',
    backgroundColor: '#2a2a2a',
    borderWidth: 1,
    borderColor: '#404040',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
  },
  rowTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#fff',
  },
  rowMeta: {
    marginTop: 4,
    color: '#b0b0b0',
    fontSize: 13,
  },
  rowNotes: {
    marginTop: 8,
    color: '#e5e5e5',
    fontSize: 13,
  },
  deleteButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#ef4444',
    backgroundColor: '#3a2a2a',
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: '#1a1a1a',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  loadingText: {
    color: '#b0b0b0',
  },
  emptyContainer: {
    paddingTop: 40,
    paddingBottom: 0,
  },
  emptyText: {
    textAlign: 'center',
    color: '#b0b0b0',
  },
  toast: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    marginBottom: 10,
    borderWidth: 1,
  },
  toastSuccess: {
    backgroundColor: '#2a3a2a',
    borderColor: '#10b981',
  },
  toastError: {
    backgroundColor: '#3a2a2a',
    borderColor: '#ef4444',
  },
  toastText: {
    color: '#fff',
    fontWeight: '600',
    textAlign: 'center',
  },
});


