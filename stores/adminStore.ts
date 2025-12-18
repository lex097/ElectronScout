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
};

function now() {
  return Date.now();
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
  },

  lock: () => {
    set({
      unlockedAtMs: null,
    });
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
}));


