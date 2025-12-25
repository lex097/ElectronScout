import { AdminCodeInput } from '@/components/admin/AdminCodeInput';
import { adminService } from '@/services/adminService';
import { useAdminStore } from '@/stores/adminStore';
import { useAuthStore } from '@/stores/authStore';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, AppState, AppStateStatus, Keyboard, StyleSheet, Text, TouchableWithoutFeedback, View } from 'react-native';

function formatMsRemaining(ms: number) {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes <= 0) return `${seconds}s`;
  return `${minutes}m ${seconds}s`;
}

export function AdminUnlockGate() {
  const user = useAuthStore((s) => s.user);
  const unlock = useAdminStore((s) => s.unlock);
  const lock = useAdminStore((s) => s.lock);
  const canAttempt = useAdminStore((s) => s.canAttempt);
  const recordFailure = useAdminStore((s) => s.recordFailure);

  const [isVerifying, setIsVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lockTicker, setLockTicker] = useState(0);

  const teamNumber = useMemo(() => {
    const num = parseInt(user?.teamNumber || '', 10);
    return Number.isFinite(num) ? num : null;
  }, [user?.teamNumber]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (nextState: AppStateStatus) => {
      if (nextState !== 'active') lock();
    });
    return () => sub.remove();
  }, [lock]);

  // keep lock countdown UI fresh
  useEffect(() => {
    const id = setInterval(() => setLockTicker((x) => x + 1), 250);
    return () => clearInterval(id);
  }, []);

  const handleSubmit = useCallback(
    async (code: string) => {
      if (!teamNumber) {
        setError('Team context missing. Please log out and log in again.');
        return;
      }

      const attempt = canAttempt();
      if (!attempt.ok) {
        const msRemaining = attempt.lockUntilMs - Date.now();
        setError(`Too many attempts. Try again in ${formatMsRemaining(msRemaining)}.`);
        return;
      }

      setIsVerifying(true);
      setError(null);
      try {
        const { teamId } = await adminService.getTeamContext(teamNumber);
        const ok = await adminService.verifyAdminCode(teamId, code);
        if (!ok) {
          const result = recordFailure();
          if (result.locked && result.lockUntilMs) {
            setError(`Too many attempts. Try again in ${formatMsRemaining(result.lockUntilMs - Date.now())}.`);
          } else {
            setError('Incorrect code. Please try again.');
          }
          return;
        }

        unlock();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Unable to verify admin code.');
      } finally {
        setIsVerifying(false);
      }
    },
    [teamNumber, canAttempt, recordFailure, unlock]
  );

  const lockState = canAttempt();
  // ensure periodic re-render updates countdown
  void lockTicker;
  const lockMessage =
    !lockState.ok ? `Locked. Try again in ${formatMsRemaining(lockState.lockUntilMs - Date.now())}.` : null;

  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
    <View style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.title}>Admin Access</Text>
          <Text style={styles.subtitle}>Enter your 4-digit admin code</Text>

        <AdminCodeInput
          disabled={isVerifying || !teamNumber}
          error={error}
          helperText={`Forgot your code? Contact support at [PLACEHOLDER_EMAIL]`}
          onSubmit={handleSubmit}
        />

        {lockMessage ? <Text style={styles.lockText}>{lockMessage}</Text> : null}

        {isVerifying ? (
          <View style={styles.loadingRow}>
              <ActivityIndicator color="#ff6600" />
            <Text style={styles.loadingText}>Verifying…</Text>
          </View>
        ) : null}
      </View>
    </View>
    </TouchableWithoutFeedback>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a1a',
    paddingHorizontal: 24,
    justifyContent: 'center',
    paddingBottom: 0,
  },
  card: {
    backgroundColor: '#2a2a2a',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: '#404040',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#ff6600',
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    color: '#b0b0b0',
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 20,
  },
  lockText: {
    marginTop: 10,
    color: '#ff9900',
    textAlign: 'center',
    fontSize: 13,
  },
  loadingRow: {
    marginTop: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  loadingText: {
    color: '#b0b0b0',
    fontSize: 13,
  },
});


