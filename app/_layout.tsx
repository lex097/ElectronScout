import FontAwesome from '@expo/vector-icons/FontAwesome';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { QueryClientProvider } from '@tanstack/react-query';
import { useFonts } from 'expo-font';
import { Stack, router } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import 'react-native-reanimated';

import { MatchesCacheHydrator } from '@/components/MatchesCacheHydrator';
import { UpdateAppModal } from '@/components/UpdateAppModal';
import { useColorScheme } from '@/components/useColorScheme';
import { queryClient } from '@/config/queryClient';
import { useVersionCheck } from '@/hooks/useVersionCheck';
import { useAuthStore } from '@/stores/authStore';
import { useDemoStore } from '@/stores/demoStore';
import { useEbucksStore } from '@/stores/ebucksStore';
import * as Sentry from '@sentry/react-native';

Sentry.init({
  dsn: 'https://231c578472c2942afdfc4b074dee9a04@o4510829492895744.ingest.us.sentry.io/4510829498073088',

  // Adds more context data to events (IP address, cookies, user, etc.)
  // For more information, visit: https://docs.sentry.io/platforms/react-native/data-management/data-collected/
  sendDefaultPii: true,

  // Enable Logs
  enableLogs: true,

  // Configure Session Replay
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1,
  integrations: [Sentry.mobileReplayIntegration(), Sentry.feedbackIntegration()],

  // uncomment the line below to enable Spotlight (https://spotlightjs.com)
  // spotlight: __DEV__,
});

export {
  // Catch any errors thrown by the Layout component.
  ErrorBoundary
} from 'expo-router';

export const unstable_settings = {
  initialRouteName: 'login',
};

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

export default Sentry.wrap(function RootLayout() {
  const [loaded, error] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
    ...FontAwesome.font,
  });

  // Expo Router uses Error Boundaries to catch errors in the navigation tree.
  useEffect(() => {
    if (error) throw error;
  }, [error]);

  if (!loaded) {
    return null;
  }

  return <RootLayoutNav onReadyToHideSplash={SplashScreen.hideAsync} />;
});

function RootLayoutNav({ onReadyToHideSplash }: { onReadyToHideSplash: () => void }) {
  const colorScheme = useColorScheme();
  const { isAuthenticated, user, isLoading, checkAuth } = useAuthStore();
  const initializeEbucks = useEbucksStore((state) => state.initialize);
  const initializeDemo = useDemoStore((state) => state.initialize);
  const { showModal, storeUrl, latestVersion, dismissModal } = useVersionCheck();

  useEffect(() => {
    checkAuth();
    initializeDemo();
  }, [checkAuth, initializeDemo]);

  // Hide splash only when auth check is complete (avoids black flash between splash and first screen)
  useEffect(() => {
    if (!isLoading) {
      onReadyToHideSplash();
    }
  }, [isLoading, onReadyToHideSplash]);

  useEffect(() => {
    if (isAuthenticated && user) {
      // Initialize ebucks store when user is authenticated
      initializeEbucks();
    }
  }, [isAuthenticated, user, initializeEbucks]);

  useEffect(() => {
    if (!isLoading) {
      if (!isAuthenticated) {
        router.replace('/login');
      } else if (user?.role === 'administrator') {
        router.replace('/(admin)/dashboard');
      } else {
        // Default to tabs for scouter or any authenticated user
        router.replace('/(tabs)');
      }
    }
  }, [isAuthenticated, user, isLoading]);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
    <QueryClientProvider client={queryClient}>
      <MatchesCacheHydrator />
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
          <UpdateAppModal
            visible={showModal}
            storeUrl={storeUrl}
            latestVersion={latestVersion}
            onDismiss={dismissModal}
          />
          <Stack screenOptions={{ headerShown: false, gestureEnabled: false }}>
          <Stack.Screen 
            name="login" 
            options={{ 
              gestureEnabled: true,
              animationTypeForReplace: 'pop',
            }} 
          />
          <Stack.Screen name="register-team" options={{ gestureEnabled: true }} />
          <Stack.Screen name="enter-name" options={{ gestureEnabled: true }} />
          <Stack.Screen name="verify-team-code" options={{ gestureEnabled: true }} />
          <Stack.Screen name="create-admin-code" options={{ gestureEnabled: true }} />
          <Stack.Screen name="team-created" options={{ gestureEnabled: true }} />
            <Stack.Screen name="select-event" options={{ gestureEnabled: true }} />
            <Stack.Screen name="select-match" options={{ gestureEnabled: true }} />
          <Stack.Screen name="select-team" options={{ gestureEnabled: true }} />
          <Stack.Screen name="my-schedule" options={{ gestureEnabled: true }} />
          <Stack.Screen name="scouter-schedules" options={{ gestureEnabled: true }} />
          <Stack.Screen name="scouter-schedule-edit" options={{ gestureEnabled: true }} />
          <Stack.Screen name="qr-codes" options={{ gestureEnabled: true }} />
          <Stack.Screen name="scan-qr" options={{ gestureEnabled: true }} />
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="(admin)" />
        </Stack>
      </ThemeProvider>
    </QueryClientProvider>
    </GestureHandlerRootView>
  );
}