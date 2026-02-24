import FontAwesome from '@expo/vector-icons/FontAwesome';
import { Tabs, router } from 'expo-router';
import React, { useEffect } from 'react';
import { Pressable, Text, View } from 'react-native';

import { BetNotificationCard } from '@/components/betting/BetNotificationCard';
import { useClientOnlyValue } from '@/components/useClientOnlyValue';
import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';
import { useAuthStore } from '@/stores/authStore';
import { useEbucksStore } from '@/stores/ebucksStore';

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
  const balance = useEbucksStore((state) => state.balance);

  useEffect(() => {
    if (!isLoading) {
      if (!isAuthenticated || user?.role !== 'scouter') {
        router.replace('/login');
      } else {
        // Initialize ebucks store when authenticated
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

  return (
    <>
      <BetNotificationCard />
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
          headerLeft: () => (
            <Pressable
              onPress={handleLogout}
              style={({ pressed }) => ({
                marginLeft: 15,
                opacity: pressed ? 0.5 : 1,
              })}
            >
              <FontAwesome
                name="sign-out"
                size={22}
                color={Colors[colorScheme ?? 'light'].text}
              />
            </Pressable>
          ),
        }}
      />
      <Tabs.Screen
        name="analytics"
        options={{
          title: 'Analytics',
          tabBarIcon: ({ color }) => <TabBarIcon name="bar-chart" color={color} />,
          headerLeft: () => (
            <Pressable
              onPress={handleLogout}
              style={({ pressed }) => ({
                marginLeft: 15,
                opacity: pressed ? 0.5 : 1,
              })}
            >
              <FontAwesome
                name="sign-out"
                size={22}
                color={Colors[colorScheme ?? 'light'].text}
              />
            </Pressable>
          ),
        }}
      />
      <Tabs.Screen
        name="picklists"
        options={{
          title: 'Picklists',
          tabBarIcon: ({ color }) => <TabBarIcon name="list" color={color} />,
          headerLeft: () => (
            <Pressable
              onPress={handleLogout}
              style={({ pressed }) => ({
                marginLeft: 15,
                opacity: pressed ? 0.5 : 1,
              })}
            >
              <FontAwesome
                name="sign-out"
                size={22}
                color={Colors[colorScheme ?? 'light'].text}
              />
            </Pressable>
          ),
        }}
      />
      <Tabs.Screen
        name="betting-history"
        options={{
          title: 'Bets',
          tabBarIcon: ({ color }) => <TabBarIcon name="trophy" color={color} />,
          headerLeft: () => (
            <Pressable
              onPress={handleLogout}
              style={({ pressed }) => ({
                marginLeft: 15,
                opacity: pressed ? 0.5 : 1,
              })}
            >
              <FontAwesome
                name="sign-out"
                size={22}
                color={Colors[colorScheme ?? 'light'].text}
              />
            </Pressable>
          ),
        }}
      />
      <Tabs.Screen
        name="admin"
        options={{
          title: 'Admin',
          tabBarIcon: ({ color }) => <TabBarIcon name="shield" color={color} />,
          headerLeft: () => (
            <Pressable
              onPress={handleLogout}
              style={({ pressed }) => ({
                marginLeft: 15,
                opacity: pressed ? 0.5 : 1,
              })}
            >
              <FontAwesome
                name="sign-out"
                size={22}
                color={Colors[colorScheme ?? 'light'].text}
              />
            </Pressable>
          ),
        }}
      />
    </Tabs>
    </>
  );
}