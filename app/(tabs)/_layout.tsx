import FontAwesome from '@expo/vector-icons/FontAwesome';
import { Link, Tabs, router } from 'expo-router';
import React, { useEffect } from 'react';
import { Pressable } from 'react-native';

import { useClientOnlyValue } from '@/components/useClientOnlyValue';
import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';
import { useAuthStore } from '@/stores/authStore';

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

  useEffect(() => {
    if (!isLoading) {
      if (!isAuthenticated || user?.role !== 'scouter') {
        router.replace('/login');
      }
    }
  }, [isAuthenticated, user, isLoading]);

  const handleLogout = async () => {
    await logout();
    router.replace('/login');
  };

  if (isLoading || !isAuthenticated || user?.role !== 'scouter') {
    return null; // Will redirect to login
  }

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: Colors[colorScheme ?? 'light'].tint,
        // Disable the static render of the header on web
        // to prevent a hydration error in React Navigation v6.
        headerShown: useClientOnlyValue(false, true),
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Match Scouting',
          tabBarIcon: ({ color }) => <TabBarIcon name="code" color={color} />,
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
          headerRight: () => (
            <Link href="/modal" asChild>
              <Pressable>
                {({ pressed }) => (
                  <FontAwesome
                    name="info-circle"
                    size={25}
                    color={Colors[colorScheme ?? 'light'].text}
                    style={{ marginRight: 15, opacity: pressed ? 0.5 : 1 }}
                  />
                )}
              </Pressable>
            </Link>
          ),
        }}
      />
      <Tabs.Screen
        name="analytics"
        options={{
          title: 'Analytics',
          tabBarIcon: ({ color }) => <TabBarIcon name="code" color={color} />,
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
  );
}