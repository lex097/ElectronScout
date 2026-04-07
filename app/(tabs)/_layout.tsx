import FontAwesome from '@expo/vector-icons/FontAwesome';
import { Ionicons } from '@expo/vector-icons';
import { Tabs, router } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { BetNotificationCard } from '@/components/betting/BetNotificationCard';
import { HamburgerSidebar } from '@/components/HamburgerSidebar';
import { useClientOnlyValue } from '@/components/useClientOnlyValue';
import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';
import { useAuthStore } from '@/stores/authStore';
import { useAdminStore } from '@/stores/adminStore';
import { useEbucksStore, useEffectiveBalance } from '@/stores/ebucksStore';
import { supabase } from '@/lib/supabase';

// You can explore the built-in icon families and icons on the web at https://icons.expo.fyi/
function TabBarIcon(props: {
  name: React.ComponentProps<typeof FontAwesome>['name'];
  color: string;
}) {
  return <FontAwesome size={28} style={{ marginBottom: -3 }} {...props} />;
}

export default function TabLayout() {
  const colorScheme = useColorScheme();
  const { user, isAuthenticated, isLoading, logout } = useAuthStore();
  const initializeEbucks = useEbucksStore((state) => state.initialize);
  const balance = useEffectiveBalance();
  const isAdminUnlocked = useAdminStore((s) => s.isUnlocked());

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [teamCode, setTeamCode] = useState('');

  useEffect(() => {
    const loadTeamCode = async () => {
      const stored = await AsyncStorage.getItem('team_code');
      if (stored) {
        setTeamCode(stored);
        return;
      }
      // Fallback: fetch from DB for users who logged in before team_code was cached
      const teamId = await AsyncStorage.getItem('team_id');
      if (!teamId) return;
      const { data } = await supabase
        .from('teams')
        .select('team_code')
        .eq('id', teamId)
        .single();
      if (data?.team_code) {
        setTeamCode(data.team_code);
        await AsyncStorage.setItem('team_code', data.team_code);
      }
    };
    loadTeamCode();
  }, []);

  useEffect(() => {
    if (!isLoading) {
      if (!isAuthenticated || user?.role !== 'scouter') {
        router.replace('/login');
      } else {
        initializeEbucks();
      }
    }
  }, [isAuthenticated, user, isLoading, initializeEbucks]);

  const handleLogout = async () => {
    await logout();
    router.replace('/login');
  };

  if (isLoading || !isAuthenticated || user?.role !== 'scouter') {
    return null; // Will redirect to login
  }

  const HamburgerButton = () => (
    <Pressable
      onPress={() => setSidebarOpen(true)}
      style={({ pressed }) => ({
        marginLeft: 15,
        opacity: pressed ? 0.5 : 1,
        padding: 4,
      })}
    >
      <Ionicons name="menu" size={26} color={Colors[colorScheme ?? 'light'].text} />
    </Pressable>
  );

  return (
    <>
      <BetNotificationCard />
      <HamburgerSidebar
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        onLogout={handleLogout}
        teamCode={teamCode}
        teamNumber={user?.teamNumber ?? ''}
        isAdmin={isAdminUnlocked}
      />
      <Tabs
        screenOptions={{
        tabBarActiveTintColor: Colors[colorScheme ?? 'light'].tint,
        tabBarInactiveTintColor: '#888',
        tabBarStyle: {
          backgroundColor: '#1a1a1a',
          borderTopWidth: 0,
          elevation: 0,
        },
        headerStyle: {
          backgroundColor: '#1a1a1a',
        },
        headerTintColor: '#fff',
        // Disable the static render of the header on web
        // to prevent a hydration error in React Navigation v6.
        headerShown: useClientOnlyValue(false, true),
        headerLeft: () => <HamburgerButton />,
        headerRight: () => (
          <View style={{ marginRight: 15, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text style={{ color: '#ff6600', fontSize: 16, fontWeight: '600' }}>
              {balance} ebucks
            </Text>
          </View>
        ),
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Scouting',
          tabBarIcon: ({ color }) => <TabBarIcon name="search" color={color} />,
        }}
      />
      <Tabs.Screen
        name="analytics"
        options={{
          title: 'Analytics',
          tabBarIcon: ({ color }) => <TabBarIcon name="bar-chart" color={color} />,
        }}
      />
      <Tabs.Screen
        name="picklists"
        options={{
          title: 'Picklists',
          tabBarIcon: ({ color }) => <TabBarIcon name="list" color={color} />,
        }}
      />
      <Tabs.Screen
        name="betting-history"
        options={{
          title: 'Bets',
          tabBarIcon: ({ color }) => <TabBarIcon name="trophy" color={color} />,
        }}
      />
      <Tabs.Screen
        name="admin"
        options={{
          title: 'Admin',
          tabBarIcon: ({ color }) => <TabBarIcon name="shield" color={color} />,
        }}
      />
    </Tabs>
    </>
  );
}
