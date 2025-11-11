// app/team-created.tsx - Team Creation Success Screen
import { useAuthStore } from '@/stores/authStore';
import { router, useLocalSearchParams } from 'expo-router';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function TeamCreatedScreen() {
  const params = useLocalSearchParams<{ teamCode: string; teamNumber: string; adminCode?: string }>();
  const { teamCode, teamNumber, adminCode } = params;
  const getScoutName = useAuthStore((state) => state.getScoutName);

  const handleContinue = async () => {
    // Get scout name from AsyncStorage (should be set in login screen)
    const scoutName = await getScoutName();
    if (!scoutName) {
      // If scout name is missing, go back to login
      router.replace('/login');
      return;
    }

    // Complete authentication
    const login = useAuthStore.getState().login;
    await login(scoutName, teamNumber);

    // Navigate to main app
    router.replace('/(tabs)');
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <View style={styles.iconContainer}>
          <Text style={styles.icon}>✓</Text>
        </View>

        <Text style={styles.title}>Team Profile Created!</Text>
        <Text style={styles.message}>
          Your team profile has been created successfully.
        </Text>

        <View style={styles.codeContainer}>
          <Text style={styles.codeLabel}>Your Team Code:</Text>
          <Text style={styles.code}>{teamCode || 'N/A'}</Text>
        </View>

        {adminCode && (
          <View style={[styles.codeContainer, styles.adminCodeContainer]}>
            <Text style={styles.codeLabel}>Your Admin Code:</Text>
            <Text style={styles.code}>{adminCode}</Text>
          </View>
        )}

        <View style={styles.warningContainer}>
          <Text style={styles.warningText}>
            ⚠️ Write down {adminCode ? 'these codes' : 'this code'}! You'll need {adminCode ? 'them' : 'it'} to log in next time.
            {adminCode && '\n\nTeam Code: For regular team members\nAdmin Code: For administrators'}
          </Text>
        </View>

        <TouchableOpacity style={styles.button} onPress={handleContinue}>
          <Text style={styles.buttonText}>Continue</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    padding: 24,
    alignItems: 'center',
  },
  iconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#10b981',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  icon: {
    fontSize: 48,
    color: 'white',
    fontWeight: 'bold',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 12,
    color: '#1e40af',
  },
  message: {
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 32,
    color: '#6b7280',
  },
  codeContainer: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 24,
    marginBottom: 24,
    width: '100%',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#1e40af',
  },
  codeLabel: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 12,
    color: '#374151',
  },
  code: {
    fontSize: 36,
    fontWeight: 'bold',
    letterSpacing: 4,
    color: '#1e40af',
    fontFamily: 'monospace',
  },
  adminCodeContainer: {
    marginTop: 0,
    marginBottom: 24,
    borderColor: '#10b981',
  },
  warningContainer: {
    backgroundColor: '#fef3c7',
    borderRadius: 8,
    padding: 16,
    marginBottom: 32,
    width: '100%',
  },
  warningText: {
    fontSize: 14,
    color: '#92400e',
    textAlign: 'center',
  },
  button: {
    backgroundColor: '#1e40af',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 50,
    width: '100%',
  },
  buttonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
});

