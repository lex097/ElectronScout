// app/select-match.tsx - Match Selection Screen
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEventMatches } from '@/hooks/useEventMatches';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';
import {
  ActivityIndicator,
  FlatList,
  SectionList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { TBAMatch } from '../api/types';

export default function SelectMatchScreen() {
  const params = useLocalSearchParams<{ eventKey: string }>();
  const { eventKey } = params;

  const { data: matches, isLoading, error } = useEventMatches(eventKey || null);

  const handleSelectMatch = async (matchKey: string, match: TBAMatch) => {
    // Save selected match info to AsyncStorage
    await AsyncStorage.setItem('selected_match_key', matchKey);
    await AsyncStorage.setItem('selected_match_number', match.match_number.toString());
    
    router.push({
      pathname: '/select-team' as any,
      params: {
        matchKey,
        matchNumber: match.match_number.toString(),
        compLevel: match.comp_level,
        eventKey: eventKey || '',
      },
    });
  };

  const formatTime = (timestamp?: number) => {
    if (!timestamp) return null;
    try {
      const date = new Date(timestamp * 1000);
      return date.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
      });
    } catch {
      return null;
    }
  };

  const getCompLevelLabel = (compLevel: string) => {
    const labels: Record<string, string> = {
      qm: 'Qualification',
      qf: 'Quarterfinal',
      sf: 'Semifinal',
      f: 'Final',
    };
    return labels[compLevel] || compLevel.toUpperCase();
  };

  // Group matches by comp_level
  const groupedMatches = useMemo(() => {
    if (!matches) return [];

    const groups: Record<string, TBAMatch[]> = {};
    matches.forEach((match) => {
      if (!groups[match.comp_level]) {
        groups[match.comp_level] = [];
      }
      groups[match.comp_level].push(match);
    });

    // Convert to section list format
    const compLevelOrder = ['qm', 'qf', 'sf', 'f'];
    return compLevelOrder
      .filter((level) => groups[level] && groups[level].length > 0)
      .map((level) => ({
        title: getCompLevelLabel(level),
        data: groups[level],
      }));
  }, [matches]);

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#1e40af" />
          <Text style={styles.loadingText}>Loading matches...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.errorContainer}>
          <Text style={styles.errorTitle}>Error Loading Matches</Text>
          <Text style={styles.errorText}>
            {error.message || 'Unable to load matches. Please check your internet connection.'}
          </Text>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => router.back()}
          >
            <Text style={styles.backButtonText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (!matches || matches.length === 0) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyTitle}>No Matches Found</Text>
          <Text style={styles.emptyText}>
            No matches found for this event. Matches may not be scheduled yet.
          </Text>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => router.back()}
          >
            <Text style={styles.backButtonText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Select Match</Text>
        <Text style={styles.subtitle}>{matches.length} matches available</Text>
      </View>

      <SectionList
        sections={groupedMatches}
        keyExtractor={(item) => item.key}
        renderItem={({ item }) => {
          const scheduledTime = formatTime(item.time);
          return (
            <TouchableOpacity
              style={styles.matchCard}
              onPress={() => handleSelectMatch(item.key, item)}
            >
              <View style={styles.matchCardHeader}>
                <Text style={styles.matchNumber}>
                  Match {item.match_number}
                </Text>
                {scheduledTime && (
                  <Text style={styles.matchTime}>{scheduledTime}</Text>
                )}
              </View>
              <View style={styles.alliancePreview}>
                <View style={styles.allianceBadge}>
                  <Text style={styles.allianceLabel}>Red</Text>
                  <Text style={styles.allianceTeams}>
                    {item.alliances.red.team_keys
                      .map((key) => key.replace('frc', ''))
                      .join(', ')}
                  </Text>
                </View>
                <View style={styles.allianceBadge}>
                  <Text style={styles.allianceLabel}>Blue</Text>
                  <Text style={styles.allianceTeams}>
                    {item.alliances.blue.team_keys
                      .map((key) => key.replace('frc', ''))
                      .join(', ')}
                  </Text>
                </View>
              </View>
            </TouchableOpacity>
          );
        }}
        renderSectionHeader={({ section: { title } }) => (
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionHeaderText}>{title}</Text>
          </View>
        )}
        contentContainerStyle={styles.listContent}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    backgroundColor: '#1e40af',
    padding: 20,
    alignItems: 'center',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: 'white',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 16,
    color: 'rgba(255, 255, 255, 0.9)',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#6b7280',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  errorTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#ef4444',
    marginBottom: 8,
  },
  errorText: {
    fontSize: 14,
    color: '#6b7280',
    textAlign: 'center',
    marginBottom: 24,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1f2937',
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    color: '#6b7280',
    textAlign: 'center',
    marginBottom: 24,
  },
  backButton: {
    backgroundColor: '#1e40af',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  backButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  listContent: {
    padding: 16,
  },
  sectionHeader: {
    backgroundColor: '#e5e7eb',
    padding: 12,
    marginTop: 8,
    marginBottom: 8,
    borderRadius: 8,
  },
  sectionHeaderText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#374151',
  },
  matchCard: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  matchCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  matchNumber: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1f2937',
  },
  matchTime: {
    fontSize: 14,
    color: '#6b7280',
  },
  alliancePreview: {
    flexDirection: 'row',
    gap: 12,
  },
  allianceBadge: {
    flex: 1,
    backgroundColor: '#f3f4f6',
    padding: 8,
    borderRadius: 6,
  },
  allianceLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6b7280',
    marginBottom: 4,
  },
  allianceTeams: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1f2937',
  },
});

