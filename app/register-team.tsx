// app/register-team.tsx - Team Registration Screen
import { getAllTeams } from '@/api/services/teams';
import { TBATeam } from '@/api/types';
import { authService } from '@/services/authService';
import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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

const TEAMS_PER_PAGE = 500;

export default function RegisterTeamScreen() {
  const [allTeams, setAllTeams] = useState<TBATeam[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRegistering, setIsRegistering] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(0);
  const [hasMorePages, setHasMorePages] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch teams from TBA API with pagination
  const fetchTeams = useCallback(async (pageNum: number, isInitialLoad: boolean = false) => {
    if (isInitialLoad) {
      setIsLoading(true);
    }
    
    try {
      const teams = await getAllTeams(pageNum);
      
      if (teams.length === 0) {
        setHasMorePages(false);
        if (isInitialLoad) {
          setIsLoading(false);
        }
        return;
      }

      setAllTeams((prev) => {
        // Check if we already have teams from this page to avoid duplicates
        const existingTeamNumbers = new Set(prev.map(t => t.team_number));
        const newTeams = teams.filter(t => !existingTeamNumbers.has(t.team_number));
        
        if (newTeams.length === 0) {
          return prev; // No new teams, return previous state
        }
        
        // Merge and sort by team_number
        const merged = [...prev, ...newTeams];
        return merged.sort((a, b) => a.team_number - b.team_number);
      });

      // Update current page if this is a higher page number
      setCurrentPage((prev) => Math.max(prev, pageNum));

      // If we got less than 500 teams, we've reached the end
      if (teams.length < TEAMS_PER_PAGE) {
        setHasMorePages(false);
      }
      
      if (isInitialLoad) {
        setIsLoading(false);
      }
    } catch (err) {
      console.error('Error fetching teams:', err);
      setError('Failed to load teams. Please try again.');
      setIsLoading(false);
    }
  }, []);

  // Load initial teams - load enough pages to cover all FRC teams (up to ~9000+)
  const loadInitialTeams = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    setAllTeams([]);
    setCurrentPage(0);
    setHasMorePages(true);
    
    // Load pages in batches to cover all FRC teams (currently up to ~9000+)
    // Each page has ~500 teams, so 20 pages covers ~10,000 teams
    try {
      // Load pages in batches to avoid too many parallel requests
      const totalPagesToLoad = 20;
      const batchSize = 5; // Load 5 pages at a time
      const allResults: TBATeam[][] = [];
      
      for (let i = 0; i < totalPagesToLoad; i += batchSize) {
        const pages = [];
        for (let j = i; j < Math.min(i + batchSize, totalPagesToLoad); j++) {
          pages.push(j);
        }
        
        const promises = pages.map((page) => getAllTeams(page));
        const batchResults = await Promise.all(promises);
        allResults.push(...batchResults);
        
        // Update current page as we load
        setCurrentPage(Math.min(i + batchSize - 1, totalPagesToLoad - 1));
      }
      
      // Flatten and deduplicate
      const all = allResults.flat();
      const unique = all.filter(
        (team, index, self) =>
          index === self.findIndex((t) => t.team_number === team.team_number)
      );
      
      setAllTeams(unique.sort((a, b) => a.team_number - b.team_number));
      setCurrentPage(totalPagesToLoad - 1);
      
      // Check if there are more pages (if last page had 500 teams, there might be more)
      const lastPageResults = allResults[allResults.length - 1];
      if (lastPageResults?.length === TEAMS_PER_PAGE) {
        setHasMorePages(true);
      } else {
        setHasMorePages(false);
      }
    } catch (err) {
      console.error('Error loading initial teams:', err);
      setError('Failed to load teams. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadInitialTeams();
  }, [loadInitialTeams]);

  // Load additional pages if searching for a team number not yet loaded
  useEffect(() => {
    if (!searchQuery.trim()) return;

    const query = searchQuery.trim();
    const isNumericQuery = /^\d+$/.test(query);
    
    if (isNumericQuery) {
      const teamNumber = parseInt(query, 10);
      if (!isNaN(teamNumber) && teamNumber > 0) {
        // Check if this team is already in our loaded teams
        const teamExists = allTeams.some(t => t.team_number === teamNumber);
        
        if (!teamExists) {
          // Estimate which page this team would be on (approximately)
          const estimatedPage = Math.floor(teamNumber / TEAMS_PER_PAGE);
          
          // If we haven't loaded this page yet and it's reasonable (within ~30 pages)
          if (estimatedPage > currentPage && estimatedPage < 30 && !isLoading) {
            // Load the estimated page and adjacent pages
            fetchTeams(estimatedPage, false);
            if (estimatedPage > 0) {
              fetchTeams(estimatedPage - 1, false);
            }
            fetchTeams(estimatedPage + 1, false);
          }
        }
      }
    }
  }, [searchQuery, allTeams, currentPage, isLoading, fetchTeams]);

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

  // Load more teams when scrolling
  const handleLoadMore = useCallback(() => {
    if (!isLoading && hasMorePages && !searchQuery.trim()) {
      const nextPage = currentPage + 1;
      setCurrentPage(nextPage);
      fetchTeams(nextPage, false);
    }
  }, [isLoading, hasMorePages, currentPage, searchQuery, fetchTeams]);

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
              <Text style={styles.errorText}>{error}</Text>
              <TouchableOpacity
                style={styles.retryButton}
                onPress={loadInitialTeams}
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
              onEndReached={handleLoadMore}
              onEndReachedThreshold={0.5}
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
                isLoading && allTeams.length > 0 ? (
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

