// app/select-event.tsx - Event Selection Screen
import { useEvents } from '@/hooks/useEvents';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import {
    ActivityIndicator,
    FlatList,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ACTIVE_GAME_CONFIG } from '../config/gameConfig';

const CURRENT_YEAR = ACTIVE_GAME_CONFIG.year;

const getLocationString = (event: any) => {
  const parts = [event.city, event.state_prov, event.country].filter(Boolean);
  return parts.join(', ') || 'Location TBD';
};

export default function SelectEventScreen() {
  const [selectedYear, setSelectedYear] = useState(CURRENT_YEAR);
  const [searchQuery, setSearchQuery] = useState('');
  const { data: events, isLoading, error } = useEvents(selectedYear);

  // Filter events based on search query (real-time filtering)
  const filteredEvents = useMemo(() => {
    if (!events) return [];
    if (!searchQuery.trim()) return events;

    const query = searchQuery.toLowerCase().trim();
    return events.filter((event) => {
      const name = event.name?.toLowerCase() || '';
      const location = getLocationString(event).toLowerCase();
      const eventCode = event.event_code?.toLowerCase() || '';
      
      return (
        name.includes(query) ||
        location.includes(query) ||
        eventCode.includes(query)
      );
    });
  }, [events, searchQuery]);

  const handleSelectEvent = async (event: any) => {
    // Save selected event info to AsyncStorage
    await AsyncStorage.setItem('selected_event_key', event.key);
    await AsyncStorage.setItem('selected_event_name', event.name);
    
    router.push({
      pathname: '/select-match' as any,
      params: { eventKey: event.key },
    });
  };

  const formatDate = (dateString: string) => {
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
    } catch {
      return dateString;
    }
  };

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#1e40af" />
          <Text style={styles.loadingText}>Loading events...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.errorContainer}>
          <Text style={styles.errorTitle}>Error Loading Events</Text>
          <Text style={styles.errorText}>
            {error.message || 'Unable to load events. Please check your internet connection.'}
          </Text>
          <TouchableOpacity
            style={styles.retryButton}
            onPress={() => router.back()}
          >
            <Text style={styles.retryButtonText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (!events || events.length === 0) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyTitle}>No Events Found</Text>
          <Text style={styles.emptyText}>
            No events found for {selectedYear}. Please try a different year.
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
        <Text style={styles.title}>Select Event</Text>
        <Text style={styles.subtitle}>{selectedYear} Season</Text>
      </View>

      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search events by name, location, or code..."
          placeholderTextColor="#9ca3af"
          value={searchQuery}
          onChangeText={setSearchQuery}
          autoCapitalize="none"
          autoCorrect={false}
        />
      </View>

      <FlatList
        data={filteredEvents}
        keyExtractor={(item) => item.key}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.eventCard}
            onPress={() => handleSelectEvent(item)}
          >
            <View style={styles.eventCardHeader}>
              <Text style={styles.eventName}>{item.name}</Text>
              <Text style={styles.eventCode}>{item.event_code}</Text>
            </View>
            <Text style={styles.eventLocation}>{getLocationString(item)}</Text>
            <Text style={styles.eventDates}>
              {formatDate(item.start_date)} - {formatDate(item.end_date)}
            </Text>
          </TouchableOpacity>
        )}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>
              {searchQuery.trim() 
                ? `No events found matching "${searchQuery}"` 
                : 'No events available'}
            </Text>
          </View>
        }
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
  retryButton: {
    backgroundColor: '#1e40af',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  retryButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
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
  searchContainer: {
    backgroundColor: 'white',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  searchInput: {
    backgroundColor: '#f3f4f6',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: '#1f2937',
  },
  listContent: {
    padding: 16,
  },
  eventCard: {
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
  eventCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  eventName: {
    flex: 1,
    fontSize: 18,
    fontWeight: '600',
    color: '#1f2937',
    marginRight: 8,
  },
  eventCode: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1e40af',
    backgroundColor: '#eff6ff',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  eventLocation: {
    fontSize: 14,
    color: '#6b7280',
    marginBottom: 4,
  },
  eventDates: {
    fontSize: 12,
    color: '#9ca3af',
  },
});

