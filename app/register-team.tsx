// app/register-team.tsx - Team Registration Screen
import { TBATeam } from '@/api/types';
import { authService } from '@/services/authService';
import { useTeamsForRegister } from '@/hooks/useTeamsForRegister';
import { router } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  FlatList,
  Keyboard,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function RegisterTeamScreen() {
  const [isRegistering, setIsRegistering] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const { allTeams, isLoading, isFetching, error, refetch } = useTeamsForRegister();

  // Filter teams based on search query
  const filteredTeams = useMemo(() => {
    if (!searchQuery.trim()) {
      return allTeams;
    }

    const query = searchQuery.toLowerCase().trim();
    return allTeams.filter((team) => {
      const teamNumStr = team.team_number.toString();
      const nickname = team.nickname?.toLowerCase() || '';
      const name = team.name?.toLowerCase() || '';

      return (
        teamNumStr.includes(query) ||
        nickname.includes(query) ||
        name.includes(query)
      );
    });
  }, [allTeams, searchQuery]);

  // Handle team selection
  const handleSelectTeam = async (team: TBATeam) => {
    if (isRegistering) return;

    // Check if team already exists
    const teamSearch = await authService.searchTeamByNumber(team.team_number);
    if (teamSearch.exists) {
      Alert.alert(
        'Team Already Registered',
        `Team ${team.team_number} is already registered. Please use the team code to log in.`,
        [{ text: 'OK' }]
      );
      return;
    }

    setIsRegistering(true);
    try {
      const teamName = team.nickname || team.name || `Team ${team.team_number}`;
      const { teamCode, adminCode } = await authService.createTeam(
        team.team_number,
        teamName
      );

      // Navigate to team created screen
      router.push({
        pathname: '/team-created' as any,
        params: {
          teamCode: teamCode,
          teamNumber: team.team_number.toString(),
          adminCode: adminCode,
        },
      });
    } catch (error) {
      console.error('Error creating team:', error);
      Alert.alert(
        'Error',
        error instanceof Error
          ? error.message
          : 'Failed to register team. Please try again.'
      );
    } finally {
      setIsRegistering(false);
    }
  };

  // Skeleton loader component
  const SkeletonBox = ({ width, height, style }: { width?: number | string; height: number; style?: any }) => {
    const opacity = useRef(new Animated.Value(0.3)).current;

    useEffect(() => {
      const animation = Animated.loop(
        Animated.sequence([
          Animated.timing(opacity, {
            toValue: 0.7,
            duration: 1000,
            useNativeDriver: true,
          }),
          Animated.timing(opacity, {
            toValue: 0.3,
            duration: 1000,
            useNativeDriver: true,
          }),
        ])
      );
      animation.start();
      return () => animation.stop();
    }, [opacity]);

    return (
      <Animated.View
        style={[
          {
            width: width || '100%',
            height,
            backgroundColor: '#3a3a3a',
            borderRadius: 8,
            opacity,
          },
          style,
        ]}
      />
    );
  };

  // Render skeleton loader
  const renderSkeletonLoader = () => (
    <View style={styles.listContent}>
      {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((i) => (
        <View key={i} style={styles.teamCard}>
          <SkeletonBox width={120} height={18} style={{ marginBottom: 8, backgroundColor: '#3a3a3a' }} />
          <SkeletonBox width={200} height={14} style={{ backgroundColor: '#3a3a3a' }} />
        </View>
      ))}
    </View>
  );

  // Render team card
  const renderTeamCard = ({ item }: { item: TBATeam }) => (
    <TouchableOpacity
      style={styles.teamCard}
      onPress={() => handleSelectTeam(item)}
      disabled={isRegistering}
    >
      <Text style={styles.teamNumber}>Team {item.team_number}</Text>
      <Text style={styles.teamName} numberOfLines={2}>
        {item.nickname || item.name || 'No name available'}
      </Text>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container}>
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <View style={styles.content}>
          <View style={styles.header}>
            <Text style={styles.title}>Register a Team</Text>
            <Text style={styles.subtitle}>Select your team from the list below</Text>

            <View style={styles.searchContainer}>
              <TextInput
                style={styles.searchInput}
                value={searchQuery}
                onChangeText={setSearchQuery}
                placeholder="Search by team number or name..."
                placeholderTextColor="#888"
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>
          </View>

          {error && (
            <View style={styles.errorContainer}>
              <Text style={styles.errorText}>Failed to load teams. Please try again.</Text>
              <TouchableOpacity
                style={styles.retryButton}
                onPress={() => refetch()}
              >
                <Text style={styles.retryButtonText}>Retry</Text>
              </TouchableOpacity>
            </View>
          )}

          {isLoading && allTeams.length === 0 ? (
            renderSkeletonLoader()
          ) : (
            <FlatList
              data={filteredTeams}
              renderItem={renderTeamCard}
              keyExtractor={(item) => item.key}
              contentContainerStyle={styles.listContent}
              keyboardShouldPersistTaps="handled"
              ListEmptyComponent={
                <View style={styles.emptyContainer}>
                  <Text style={styles.emptyText}>
                    {searchQuery.trim()
                      ? 'No teams found matching your search'
                      : 'No teams available'}
                  </Text>
                </View>
              }
              ListFooterComponent={
                isFetching && allTeams.length > 0 ? (
                  <View style={styles.footerLoader}>
                    <ActivityIndicator size="small" color="#ff6600" />
                  </View>
                ) : null
              }
            />
          )}
        </View>
      </TouchableWithoutFeedback>

      {isRegistering && (
        <View style={styles.overlay}>
          <View style={styles.overlayContent}>
            <ActivityIndicator size="large" color="#ff6600" />
            <Text style={styles.overlayText}>Registering team...</Text>
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a1a',
  },
  content: {
    flex: 1,
  },
  header: {
    padding: 24,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#2a2a2a',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#ff6600',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: '#b0b0b0',
    marginBottom: 16,
  },
  searchContainer: {
    marginTop: 8,
  },
  searchInput: {
    backgroundColor: '#2a2a2a',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#404040',
    color: '#fff',
  },
  errorContainer: {
    padding: 16,
    backgroundColor: '#3a1a1a',
    borderBottomWidth: 1,
    borderBottomColor: '#ef4444',
  },
  errorText: {
    color: '#ef4444',
    fontSize: 14,
    marginBottom: 8,
  },
  retryButton: {
    alignSelf: 'flex-start',
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#ef4444',
    borderRadius: 6,
  },
  retryButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
    color: '#b0b0b0',
    fontSize: 16,
  },
  listContent: {
    padding: 16,
  },
  teamCard: {
    backgroundColor: '#2a2a2a',
    borderRadius: 8,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#404040',
  },
  teamNumber: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#ff6600',
    marginBottom: 4,
  },
  teamName: {
    fontSize: 14,
    color: '#e5e5e5',
  },
  emptyContainer: {
    padding: 32,
    alignItems: 'center',
  },
  emptyText: {
    color: '#b0b0b0',
    fontSize: 16,
    textAlign: 'center',
  },
  footerLoader: {
    padding: 16,
    alignItems: 'center',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  overlayContent: {
    backgroundColor: '#2a2a2a',
    borderRadius: 12,
    padding: 24,
    alignItems: 'center',
  },
  overlayText: {
    marginTop: 16,
    color: '#fff',
    fontSize: 16,
  },
});

