import { AdminPanel } from '@/components/admin/AdminPanel';
import { AdminUnlockGate } from '@/components/admin/AdminUnlockGate';
import { useAdminStore } from '@/stores/adminStore';
import React from 'react';
import { StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function AdminTabScreen() {
  const isUnlocked = useAdminStore((s) => s.isUnlocked());

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


