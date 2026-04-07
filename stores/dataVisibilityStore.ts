import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';

export type DataVisibility = 'my_team' | 'teams_at_event' | 'all_teams';

const VISIBILITY_KEY = 'data_visibility';

interface DataVisibilityState {
  visibility: DataVisibility;
  setVisibility: (v: DataVisibility) => Promise<void>;
  loadVisibility: () => Promise<void>;
}

export const useDataVisibilityStore = create<DataVisibilityState>((set) => ({
  visibility: 'my_team',

  setVisibility: async (v: DataVisibility) => {
    set({ visibility: v });
    await AsyncStorage.setItem(VISIBILITY_KEY, v);
  },

  loadVisibility: async () => {
    try {
      const stored = await AsyncStorage.getItem(VISIBILITY_KEY);
      if (stored === 'my_team' || stored === 'teams_at_event' || stored === 'all_teams') {
        set({ visibility: stored });
      }
    } catch {
      // Keep default
    }
  },
}));
