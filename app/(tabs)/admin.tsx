import { AdminPanel } from '@/components/admin/AdminPanel';
import { AdminUnlockGate } from '@/components/admin/AdminUnlockGate';
import { useAdminStore } from '@/stores/adminStore';
import React from 'react';
import { StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function AdminTabScreen() {
  const unlockedAtMs = useAdminStore((s) => s.unlockedAtMs);
  const sessionTtlMs = useAdminStore((s) => s.sessionTtlMs);
  const [nowMs, setNowMs] = React.useState(() => Date.now());

  React.useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 5000);
    return () => clearInterval(id);
  }, []);

  const isUnlocked = !!unlockedAtMs && nowMs - unlockedAtMs <= sessionTtlMs;

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      {isUnlocked ? <AdminPanel /> : <AdminUnlockGate />}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a1a',
  },
});


