// stores/authStore.ts
import { User } from '@/types/auth';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { setAuthTokenProvider } from '@/lib/authTokenProvider';
import { edgeFunctions } from '@/lib/edgeFunctions';
import { useAdminStore } from '@/stores/adminStore';
import { supabaseSyncService } from '@/services/supabase.sync';

const SCOUT_NAME_KEY = 'scout_name';
const TEAM_NUMBER_KEY = 'team_number';
const TEAM_ID_KEY = 'team_id';
const TEAM_CODE_KEY = 'team_code';
const ACCESS_TOKEN_KEY = 'auth_access_token';
const REFRESH_TOKEN_KEY = 'auth_refresh_token';
const TOKEN_EXPIRES_AT_KEY = 'auth_token_expires_at';

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (teamCode: string, scoutName: string) => Promise<void>;
  logout: () => Promise<void>;
  checkAuth: () => Promise<void>;
  getScoutName: () => Promise<string | null>;
  getTeamNumber: () => Promise<string | null>;
  getTeamId: () => Promise<string | null>;
  clearAuth: () => Promise<void>;
}

async function getStoredAccessToken(): Promise<string | null> {
  return AsyncStorage.getItem(ACCESS_TOKEN_KEY);
}

async function getStoredRefreshToken(): Promise<string | null> {
  return AsyncStorage.getItem(REFRESH_TOKEN_KEY);
}

async function getTokenExpiresAt(): Promise<number | null> {
  const s = await AsyncStorage.getItem(TOKEN_EXPIRES_AT_KEY);
  return s ? parseInt(s, 10) : null;
}

function isNetworkError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error);
  return (
    msg.includes('fetch') ||
    msg.includes('network') ||
    msg.includes('Network') ||
    msg.includes('ECONNREFUSED') ||
    msg.includes('ETIMEDOUT') ||
    msg.includes('Failed to fetch')
  );
}

async function getAccessTokenForSupabase(): Promise<string | null> {
  const token = await getStoredAccessToken();
  const expiresAt = await getTokenExpiresAt();
  if (!token) return null;
  if (expiresAt && Date.now() >= expiresAt - 60 * 1000) {
    const refreshToken = await getStoredRefreshToken();
    if (refreshToken) {
      try {
        const res = await edgeFunctions.refreshToken(refreshToken);
        const newToken = res.access_token;
        const expiresIn = res.expires_in ?? 24 * 3600;
        await AsyncStorage.setItem(ACCESS_TOKEN_KEY, newToken);
        await AsyncStorage.setItem(TOKEN_EXPIRES_AT_KEY, String(Math.floor(Date.now() / 1000) + expiresIn));
        return newToken;
      } catch (error) {
        // Only logout on auth errors (invalid/expired refresh token), not network errors
        if (!isNetworkError(error)) {
          await useAuthStore.getState().logout();
        }
        return token; // Return existing token when offline so user stays logged in
      }
    }
    await useAuthStore.getState().logout();
    return null;
  }
  return token;
}

export const useAuthStore = create<AuthState>((set, get) => {
  setAuthTokenProvider(getAccessTokenForSupabase);

  return {
    user: null,
    isAuthenticated: false,
    isLoading: true,

    login: async (teamCode: string, scoutName: string) => {
      const res = await edgeFunctions.signInWithTeamCode(teamCode, scoutName);
      const { access_token, refresh_token, expires_in, user } = res;

      await AsyncStorage.setItem(ACCESS_TOKEN_KEY, access_token);
      await AsyncStorage.setItem(REFRESH_TOKEN_KEY, refresh_token);
      await AsyncStorage.setItem(TOKEN_EXPIRES_AT_KEY, String(Math.floor(Date.now() / 1000) + expires_in));
      await AsyncStorage.setItem(SCOUT_NAME_KEY, scoutName);
      await AsyncStorage.setItem(TEAM_NUMBER_KEY, String(user.team_number));
      await AsyncStorage.setItem(TEAM_ID_KEY, user.team_id);
      await AsyncStorage.setItem(TEAM_CODE_KEY, teamCode);
      supabaseSyncService.invalidateCache();

      set({
        user: {
          id: user.team_id,
          name: scoutName,
          teamNumber: String(user.team_number),
          role: 'scouter',
        },
        isAuthenticated: true,
      });
    },

    logout: async () => {
      await AsyncStorage.multiRemove([
        SCOUT_NAME_KEY, TEAM_NUMBER_KEY, TEAM_ID_KEY, TEAM_CODE_KEY,
        ACCESS_TOKEN_KEY, REFRESH_TOKEN_KEY, TOKEN_EXPIRES_AT_KEY,
      ]);
      supabaseSyncService.invalidateCache();
      useAdminStore.getState().lock();
      set({ user: null, isAuthenticated: false });
    },

    checkAuth: async () => {
      try {
        const token = await getStoredAccessToken();
        const refreshToken = await getStoredRefreshToken();
        const scoutName = await AsyncStorage.getItem(SCOUT_NAME_KEY);
        const teamNumber = await AsyncStorage.getItem(TEAM_NUMBER_KEY);

        if (!token || !refreshToken || !scoutName || !teamNumber) {
          set({ user: null, isAuthenticated: false, isLoading: false });
          return;
        }

        const expiresAt = await getTokenExpiresAt();
        if (expiresAt && Date.now() >= expiresAt - 60 * 1000) {
          try {
            const res = await edgeFunctions.refreshToken(refreshToken);
            await AsyncStorage.setItem(ACCESS_TOKEN_KEY, res.access_token);
            await AsyncStorage.setItem(TOKEN_EXPIRES_AT_KEY, String(Math.floor(Date.now() / 1000) + (res.expires_in ?? 86400)));
          } catch (error) {
            // Only logout on auth errors, not network errors (offline)
            if (!isNetworkError(error)) {
              await get().logout();
              set({ isLoading: false });
              return;
            }
            // Network error: stay logged in with stored tokens, refresh when back online
          }
        }

        set({
          user: {
            id: await AsyncStorage.getItem(TEAM_ID_KEY) ?? '',
            name: scoutName,
            teamNumber,
            role: 'scouter',
          },
          isAuthenticated: true,
          isLoading: false,
        });
      } catch (error) {
        console.error('Error checking auth:', error);
        set({ user: null, isAuthenticated: false, isLoading: false });
      }
    },

    getScoutName: async () => AsyncStorage.getItem(SCOUT_NAME_KEY),
    getTeamNumber: async () => AsyncStorage.getItem(TEAM_NUMBER_KEY),
    getTeamId: async () => AsyncStorage.getItem(TEAM_ID_KEY),
    clearAuth: async () => get().logout(),
  };
});
