// app/verify-team-code.tsx - Team Code Verification Screen
import { authService } from '@/services/authService';
import { useAuthStore } from '@/stores/authStore';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Keyboard,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    TouchableWithoutFeedback,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function VerifyTeamCodeScreen() {
  const params = useLocalSearchParams<{ teamId: string; teamNumber: string }>();
  const { teamId, teamNumber } = params;
  const [teamCode, setTeamCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const login = useAuthStore((state) => state.login);
  const getScoutName = useAuthStore((state) => state.getScoutName);

  const handleVerify = async () => {
    if (!teamCode.trim() || teamCode.length !== 6) {
      setError('Please enter a valid 6-character team code');
      return;
    }

    if (!teamId) {
      Alert.alert('Error', 'Team ID is missing');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Validate team code
      const validatedTeamId = await authService.validateTeamCode(teamCode.toUpperCase());

      if (!validatedTeamId || validatedTeamId !== teamId) {
        setError('Invalid team code. Please try again.');
        setIsLoading(false);
        return;
      }

      // Get scout name from AsyncStorage (should be set in login screen)
      const scoutName = await getScoutName();
      if (!scoutName) {
        Alert.alert('Error', 'Scout name not found. Please log in again.');
        router.replace('/login');
        return;
      }

      // Complete authentication
      await login(scoutName, teamNumber);

      // Navigate to main app
      router.replace('/(tabs)');
    } catch (error) {
      console.error('Verification error:', error);
      setError('Unable to verify team code. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <View style={styles.content}>
          <Text style={styles.title}>Enter Team Code</Text>
          <Text style={styles.subtitle}>
            Enter your team's 6-character code to continue
          </Text>

          <View style={styles.form}>
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Team Code</Text>
              <TextInput
                style={[styles.input, error && styles.inputError]}
                value={teamCode}
                onChangeText={(text) => {
                  setTeamCode(text.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6));
                  setError(null);
                }}
                placeholder="ABC123"
                placeholderTextColor="#888"
                autoCapitalize="characters"
                autoCorrect={false}
                maxLength={6}
                editable={!isLoading}
              />
              {error && <Text style={styles.errorText}>{error}</Text>}
            </View>

            <TouchableOpacity
              style={[styles.button, isLoading && styles.buttonDisabled]}
              onPress={handleVerify}
              disabled={isLoading}
            >
              {isLoading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.buttonText}>Verify</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </TouchableWithoutFeedback>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a1a',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    padding: 24,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 8,
    color: '#ff6600',
  },
  subtitle: {
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 48,
    color: '#b0b0b0',
  },
  form: {
    width: '100%',
  },
  inputGroup: {
    marginBottom: 24,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
    color: '#e5e5e5',
  },
  input: {
    backgroundColor: '#2a2a2a',
    borderRadius: 8,
    padding: 12,
    fontSize: 24,
    fontWeight: '600',
    letterSpacing: 4,
    textAlign: 'center',
    borderWidth: 1,
    borderColor: '#404040',
    textTransform: 'uppercase',
    color: '#fff',
  },
  inputError: {
    borderColor: '#ef4444',
  },
  errorText: {
    color: '#ef4444',
    fontSize: 14,
    marginTop: 8,
  },
  button: {
    backgroundColor: '#ff6600',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 50,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
});

