// app/(admin)/_layout.tsx - Admin Layout
import { useAuthStore } from '@/stores/authStore';
import { router, Stack } from 'expo-router';
import { useEffect } from 'react';

export default function AdminLayout() {
  const { user, isAuthenticated, checkAuth, isLoading } = useAuthStore();

  useEffect(() => {
    checkAuth();
  }, []);

  useEffect(() => {
    if (!isLoading && (!isAuthenticated || user?.role !== 'administrator')) {
      router.replace('/login');
    }
  }, [isAuthenticated, user, isLoading]);

  if (isLoading || !isAuthenticated || user?.role !== 'administrator') {
    return null; // Will redirect to login
  }

  return (
    <Stack>
      <Stack.Screen
        name="dashboard"
        options={{
          title: 'Admin Dashboard',
          headerShown: true,
          headerStyle: {
            backgroundColor: '#1a1a1a',
          },
          headerTintColor: '#fff',
          headerTitleStyle: {
            color: '#ff6600',
            fontWeight: 'bold',
          },
        }}
      />
    </Stack>
  );
}

