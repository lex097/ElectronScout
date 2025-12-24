// app/select-team.tsx - Team Selection Screen
import { useEventMatches } from '@/hooks/useEventMatches';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';
import {
    ActivityIndicator,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function SelectTeamScreen() {
  const params = useLocalSearchParams<{
    matchKey: string;
    matchNumber: string;
    compLevel: string;
    eventKey: string;
  }>();
  const { matchKey, matchNumber, compLevel, eventKey } = params;

  // Fetch matches to get the specific match
  const { data: matches, isLoading } = useEventMatches(eventKey || null);

  const match = useMemo(() => {
    if (!matches || !matchKey) return null;
    return matches.find((m) => m.key === matchKey);
  }, [matches, matchKey]);

  const handleSelectTeam = (teamNumber: number) => {
    // Navigate back to match scouting screen with pre-filled data
    router.push({
      pathname: '/(tabs)' as any,
      params: {
        matchNumber,
        teamNumber: teamNumber.toString(),
        fromTBA: 'true',
      },
    });
  };

  if (isLoading || !match) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#ff6600" />
          <Text style={styles.loadingText}>Loading match details...</Text>
        </View>
      </SafeAreaView>
    );
  }

  const redTeams = match.alliances.red.team_keys.map((key) =>
    parseInt(key.replace('frc', ''), 10)
  );
  const blueTeams = match.alliances.blue.team_keys.map((key) =>
    parseInt(key.replace('frc', ''), 10)
  );

  const getCompLevelLabel = (level: string) => {
    const labels: Record<string, string> = {
      qm: 'Qualification',
      qf: 'Quarterfinal',
      sf: 'Semifinal',
      f: 'Final',
    };
    return labels[level] || level.toUpperCase();
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Select Team to Scout</Text>
        <Text style={styles.subtitle}>
          {getCompLevelLabel(compLevel)} Match {matchNumber}
        </Text>
      </View>

      <View style={styles.content}>
        {/* Red Alliance */}
        <View style={styles.allianceSection}>
          <View style={styles.allianceHeader}>
            <View style={[styles.allianceIndicator, styles.redIndicator]} />
            <Text style={styles.allianceTitle}>Red Alliance</Text>
          </View>
          <View style={styles.teamGrid}>
            {redTeams.map((teamNumber) => (
              <TouchableOpacity
                key={teamNumber}
                style={[styles.teamCard, styles.redTeamCard]}
                onPress={() => handleSelectTeam(teamNumber)}
              >
                <Text style={styles.teamNumber}>{teamNumber}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Blue Alliance */}
        <View style={styles.allianceSection}>
          <View style={styles.allianceHeader}>
            <View style={[styles.allianceIndicator, styles.blueIndicator]} />
            <Text style={styles.allianceTitle}>Blue Alliance</Text>
          </View>
          <View style={styles.teamGrid}>
            {blueTeams.map((teamNumber) => (
              <TouchableOpacity
                key={teamNumber}
                style={[styles.teamCard, styles.blueTeamCard]}
                onPress={() => handleSelectTeam(teamNumber)}
              >
                <Text style={styles.teamNumber}>{teamNumber}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </View>
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
    color: '#b0b0b0',
  },
  content: {
    flex: 1,
    padding: 16,
  },
  allianceSection: {
    marginBottom: 24,
  },
  allianceHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  allianceIndicator: {
    width: 16,
    height: 16,
    borderRadius: 8,
    marginRight: 8,
  },
  redIndicator: {
    backgroundColor: '#ef4444',
  },
  blueIndicator: {
    backgroundColor: '#3b82f6',
  },
  allianceTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
  },
  teamGrid: {
    flexDirection: 'row',
    gap: 12,
  },
  teamCard: {
    flex: 1,
    aspectRatio: 1,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
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
    fontSize: 32,
    fontWeight: 'bold',
    color: '#fff',
  },
});

