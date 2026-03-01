import { ACTIVE_GAME_CONFIG } from '@/config/gameConfig';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';

const DEMO_MODE_KEY = 'demo_mode_enabled';

interface DemoState {
  isDemoMode: boolean;
  initialized: boolean;
  setDemoMode: (enabled: boolean) => Promise<void>;
  toggleDemoMode: () => Promise<boolean>;
  initialize: () => Promise<void>;
}

export const useDemoStore = create<DemoState>((set, get) => ({
  isDemoMode: false,
  initialized: false,

  setDemoMode: async (enabled: boolean) => {
    await AsyncStorage.setItem(DEMO_MODE_KEY, enabled ? 'true' : 'false');
    set({ isDemoMode: enabled });
  },

  toggleDemoMode: async () => {
    const next = !get().isDemoMode;
    await get().setDemoMode(next);
    return next;
  },

  initialize: async () => {
    try {
      const stored = await AsyncStorage.getItem(DEMO_MODE_KEY);
      set({ isDemoMode: stored === 'true', initialized: true });
    } catch {
      set({ initialized: true });
    }
  },
}));

/** Year used for fetching events, matches, and EPA data. Use this instead of ACTIVE_GAME_CONFIG.year when demo mode may be active. */
export function getEffectiveYear(): number {
  const isDemoMode = useDemoStore.getState().isDemoMode;
  return isDemoMode ? ACTIVE_GAME_CONFIG.year - 1 : ACTIVE_GAME_CONFIG.year;
}
