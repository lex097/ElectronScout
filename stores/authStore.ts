// stores/authStore.ts
import { User } from '@/types/auth';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (name: string, teamNumber: string) => Promise<void>;
  logout: () => Promise<void>;
  checkAuth: () => Promise<void>;
  getScoutName: () => Promise<string | null>;
  getTeamNumber: () => Promise<string | null>;
  clearAuth: () => Promise<void>;
}

const SCOUT_NAME_KEY = 'scout_name';
const TEAM_NUMBER_KEY = 'team_number';

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isAuthenticated: false,
  isLoading: true,

  login: async (name: string, teamNumber: string) => {
    if (!name || !teamNumber) {
      throw new Error('Name and team number are required');
    }

    // Store scout name and team number separately
    await AsyncStorage.setItem(SCOUT_NAME_KEY, name);
    await AsyncStorage.setItem(TEAM_NUMBER_KEY, teamNumber);

    // Create user object for state
    const user: User = {
      id: `user-${Date.now()}`,
      name,
      teamNumber,
      role: 'scouter', // Default role
    };

    set({ user, isAuthenticated: true });
  },

  logout: async () => {
    await AsyncStorage.removeItem(SCOUT_NAME_KEY);
    await AsyncStorage.removeItem(TEAM_NUMBER_KEY);
    set({ user: null, isAuthenticated: false });
  },

  checkAuth: async () => {
    try {
      const scoutName = await AsyncStorage.getItem(SCOUT_NAME_KEY);
      const teamNumber = await AsyncStorage.getItem(TEAM_NUMBER_KEY);
      
      if (scoutName && teamNumber) {
        const user: User = {
          id: `user-${Date.now()}`,
          name: scoutName,
          teamNumber,
          role: 'scouter', // Default role
        };
        set({ user, isAuthenticated: true, isLoading: false });
      } else {
        set({ user: null, isAuthenticated: false, isLoading: false });
      }
    } catch (error) {
      console.error('Error checking auth:', error);
      set({ user: null, isAuthenticated: false, isLoading: false });
    }
  },

  getScoutName: async () => {
    try {
      return await AsyncStorage.getItem(SCOUT_NAME_KEY);
    } catch (error) {
      console.error('Error getting scout name:', error);
      return null;
    }
  },

  getTeamNumber: async () => {
    try {
      return await AsyncStorage.getItem(TEAM_NUMBER_KEY);
    } catch (error) {
      console.error('Error getting team number:', error);
      return null;
    }
  },

  clearAuth: async () => {
    await AsyncStorage.removeItem(SCOUT_NAME_KEY);
    await AsyncStorage.removeItem(TEAM_NUMBER_KEY);
    set({ user: null, isAuthenticated: false });
  },
}));

