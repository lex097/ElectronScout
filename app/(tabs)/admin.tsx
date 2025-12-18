import { AdminPanel } from '@/components/admin/AdminPanel';
import { AdminUnlockGate } from '@/components/admin/AdminUnlockGate';
import { useAdminStore } from '@/stores/adminStore';
import React from 'react';
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

  return <SafeAreaView style={{ flex: 1 }}>{isUnlocked ? <AdminPanel /> : <AdminUnlockGate />}</SafeAreaView>;
}


