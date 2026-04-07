import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { supabase } from '@/lib/supabase';

export type DataVisibility = 'my_team' | 'teams_at_event' | 'all_teams';

const VISIBILITY_KEY = 'data_visibility';

interface DataVisibilityState {
  visibility: DataVisibility;
  setVisibility: (v: DataVisibility) => Promise<void>;
  loadVisibility: () => Promise<void>;
}

export const useDataVisibilityStore = create<DataVisibilityState>((set) => ({
  visibility: 'my_team',

  // Called by admin — writes to Supabase (team-wide) and caches locally
  setVisibility: async (v: DataVisibility) => {
    set({ visibility: v });
    await AsyncStorage.setItem(VISIBILITY_KEY, v);
    try {
      await supabase.rpc('set_team_data_visibility', { p_visibility: v });
    } catch {
      // Non-fatal: local cache is already updated; will re-sync on next load
    }
  },

  // Called on app start — fetches from Supabase so all members get the latest value
  loadVisibility: async () => {
    try {
      const teamId = await AsyncStorage.getItem('team_id');
      if (teamId) {
        const { data } = await supabase
          .from('teams')
          .select('data_visibility')
          .eq('id', teamId)
          .single();
        if (
          data?.data_visibility === 'my_team' ||
          data?.data_visibility === 'teams_at_event' ||
          data?.data_visibility === 'all_teams'
        ) {
          set({ visibility: data.data_visibility });
          await AsyncStorage.setItem(VISIBILITY_KEY, data.data_visibility);
          return;
        }
      }
    } catch {
      // Fall back to local cache
    }
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
