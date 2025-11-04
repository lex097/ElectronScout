// stores/authStore.ts
import { User, UserRole } from '@/types/auth';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (username: string, password: string, role: UserRole) => Promise<void>;
  logout: () => Promise<void>;
  checkAuth: () => Promise<void>;
}

const STORAGE_KEY = '@auth_user';

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isAuthenticated: false,
  isLoading: true,

  login: async (username: string, password: string, role: UserRole) => {
    // TODO: Replace with actual authentication logic
    // For now, simple validation
    if (!username || !password) {
      throw new Error('Username and password are required');
    }

    // Simulate login - replace with real auth API call
    const user: User = {
      id: `user-${Date.now()}`,
      username,
      role,
    };

    // Store user in AsyncStorage
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(user));

    set({ user, isAuthenticated: true });
  },

  logout: async () => {
    await AsyncStorage.removeItem(STORAGE_KEY);
    set({ user: null, isAuthenticated: false });
  },

  checkAuth: async () => {
    try {
      const storedUser = await AsyncStorage.getItem(STORAGE_KEY);
      if (storedUser) {
        const user = JSON.parse(storedUser) as User;
        set({ user, isAuthenticated: true, isLoading: false });
      } else {
        set({ user: null, isAuthenticated: false, isLoading: false });
      }
    } catch (error) {
      console.error('Error checking auth:', error);
      set({ user: null, isAuthenticated: false, isLoading: false });
    }
  },
}));

