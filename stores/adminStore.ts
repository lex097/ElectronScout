import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';

type AdminState = {
  unlockedAtMs: number | null;
  failedAttempts: number;
  lockUntilMs: number | null;
  lastFailureAtMs: number | null;

  // Config
  sessionTtlMs: number; // auto-lock after unlock
  maxAttemptsBeforeLock: number;
  baseLockMs: number;

  // Derived
  isUnlocked: (nowMs?: number) => boolean;
  canAttempt: (nowMs?: number) => { ok: true } | { ok: false; reason: 'locked'; lockUntilMs: number };

  // Actions
  unlock: (nowMs?: number) => void;
  lock: () => void;
  recordFailure: (nowMs?: number) => { locked: boolean; lockUntilMs?: number };
  resetFailures: () => void;
  initialize: () => Promise<void>; // Load persisted state
};

const ADMIN_UNLOCK_KEY = 'admin_unlocked_at_ms';
const ADMIN_SESSION_TTL_KEY = 'admin_session_ttl_ms';

function now() {
  return Date.now();
}

// Load persisted unlock state from AsyncStorage
async function loadPersistedUnlock(sessionTtlMs: number = 15 * 60 * 1000): Promise<number | null> {
  try {
    const stored = await AsyncStorage.getItem(ADMIN_UNLOCK_KEY);
    if (!stored) return null;
    const unlockedAtMs = parseInt(stored, 10);
    if (isNaN(unlockedAtMs)) return null;
    
    // Check if session is still valid
    const nowMs = Date.now();
    if (nowMs - unlockedAtMs > sessionTtlMs) {
      // Session expired, clear it
      await AsyncStorage.removeItem(ADMIN_UNLOCK_KEY);
      return null;
    }
    
    return unlockedAtMs;
  } catch (error) {
    console.error('Error loading persisted admin unlock:', error);
    return null;
  }
}

// Save unlock state to AsyncStorage
async function savePersistedUnlock(unlockedAtMs: number | null) {
  try {
    if (unlockedAtMs === null) {
      await AsyncStorage.removeItem(ADMIN_UNLOCK_KEY);
    } else {
      await AsyncStorage.setItem(ADMIN_UNLOCK_KEY, unlockedAtMs.toString());
    }
  } catch (error) {
    console.error('Error saving persisted admin unlock:', error);
  }
}

function computeLockMs(failedAttempts: number, baseLockMs: number) {
  // escalating: 1x, 2x, 4x, 8x... capped at 15 minutes
  const multiplier = Math.min(2 ** Math.max(0, failedAttempts - 1), 2 ** 8); // cap exponent
  return Math.min(baseLockMs * multiplier, 15 * 60 * 1000);
}

export const useAdminStore = create<AdminState>((set, get) => ({
  unlockedAtMs: null,
  failedAttempts: 0,
  lockUntilMs: null,
  lastFailureAtMs: null,

  sessionTtlMs: 15 * 60 * 1000,
  maxAttemptsBeforeLock: 5,
  baseLockMs: 60 * 1000,

  isUnlocked: (nowMs = now()) => {
    const { unlockedAtMs, sessionTtlMs } = get();
    if (!unlockedAtMs) return false;
    return nowMs - unlockedAtMs <= sessionTtlMs;
  },

  canAttempt: (nowMs = now()) => {
    const { lockUntilMs } = get();
    if (lockUntilMs && nowMs < lockUntilMs) return { ok: false, reason: 'locked', lockUntilMs };
    return { ok: true };
  },

  unlock: (nowMs = now()) => {
    set({
      unlockedAtMs: nowMs,
      failedAttempts: 0,
      lockUntilMs: null,
      lastFailureAtMs: null,
    });
    // Persist unlock state
    savePersistedUnlock(nowMs);
  },

  lock: () => {
    set({
      unlockedAtMs: null,
    });
    // Clear persisted unlock state
    savePersistedUnlock(null);
  },

  recordFailure: (nowMs = now()) => {
    const { failedAttempts, maxAttemptsBeforeLock, baseLockMs } = get();
    const nextFailed = failedAttempts + 1;

    if (nextFailed >= maxAttemptsBeforeLock) {
      const lockMs = computeLockMs(nextFailed - maxAttemptsBeforeLock + 1, baseLockMs);
      const lockUntilMs = nowMs + lockMs;
      set({
        failedAttempts: nextFailed,
        lockUntilMs,
        lastFailureAtMs: nowMs,
      });
      return { locked: true, lockUntilMs };
    }

    set({
      failedAttempts: nextFailed,
      lastFailureAtMs: nowMs,
    });
    return { locked: false };
  },

  resetFailures: () => {
    set({
      failedAttempts: 0,
      lockUntilMs: null,
      lastFailureAtMs: null,
    });
  },

  initialize: async () => {
    const { sessionTtlMs } = get();
    const unlockedAtMs = await loadPersistedUnlock(sessionTtlMs);
    if (unlockedAtMs !== null) {
      set({ unlockedAtMs });
    }
  },
}));


