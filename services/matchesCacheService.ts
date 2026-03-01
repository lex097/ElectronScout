// services/matchesCacheService.ts - Persist match data to AsyncStorage
// Stores matches for the selected event; new event selection overwrites previous
import AsyncStorage from '@react-native-async-storage/async-storage';
import { TBAMatch } from '@/api/types';
import { getEventMatches } from '@/api/services/matches';

const CACHE_KEY = 'cached_event_matches';

interface CachedMatches {
  eventKey: string;
  matches: TBAMatch[];
}

export const matchesCacheService = {
  /** Fetch matches from API and persist to AsyncStorage (overwrites previous event) */
  async fetchAndCache(eventKey: string): Promise<TBAMatch[]> {
    const matches = await getEventMatches(eventKey);
    await this.save(eventKey, matches);
    return matches;
  },

  async save(eventKey: string, matches: TBAMatch[]): Promise<void> {
    try {
      await AsyncStorage.setItem(
        CACHE_KEY,
        JSON.stringify({ eventKey, matches } as CachedMatches)
      );
    } catch (error) {
      console.error('[MatchesCache] Failed to save:', error);
    }
  },

  async get(): Promise<CachedMatches | null> {
    try {
      const raw = await AsyncStorage.getItem(CACHE_KEY);
      if (!raw) return null;
      return JSON.parse(raw) as CachedMatches;
    } catch (error) {
      console.error('[MatchesCache] Failed to load:', error);
      return null;
    }
  },

  async clear(): Promise<void> {
    try {
      await AsyncStorage.removeItem(CACHE_KEY);
    } catch (error) {
      console.error('[MatchesCache] Failed to clear:', error);
    }
  },
};
