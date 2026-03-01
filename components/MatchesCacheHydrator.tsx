// components/MatchesCacheHydrator.tsx - Hydrate matches cache from AsyncStorage on app init
// Runs once to show cached matches immediately when reopening app
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useRef } from 'react';
import { queryClient } from '@/config/queryClient';
import { queryKeys } from '@/config/queryKeys';
import { matchesCacheService } from '@/services/matchesCacheService';

const SELECTED_EVENT_KEY = 'selected_event_key';

export function MatchesCacheHydrator() {
  const hasHydrated = useRef(false);

  useEffect(() => {
    if (hasHydrated.current) return;
    hasHydrated.current = true;

    const hydrate = async () => {
      try {
        const [selectedEventKey, cached] = await Promise.all([
          AsyncStorage.getItem(SELECTED_EVENT_KEY),
          matchesCacheService.get(),
        ]);
        if (
          selectedEventKey &&
          cached &&
          cached.eventKey === selectedEventKey &&
          cached.matches?.length
        ) {
          queryClient.setQueryData(
            queryKeys.matches.byEvent(selectedEventKey),
            cached.matches
          );
        }
      } catch (error) {
        console.error('[MatchesCache] Hydration failed:', error);
      }
    };

    hydrate();
  }, []);

  return null;
}
