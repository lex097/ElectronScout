// app/login.tsx - Login Screen
import { authService } from '@/services/authService';
import { router } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Keyboard,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function LoginScreen() {
  const [teamCode, setTeamCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleContinue = async () => {
    if (!teamCode.trim() || teamCode.length !== 6) {
      setError('Please enter a valid 6-character team code');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Validate team code
      const teamId = await authService.validateTeamCode(teamCode.toUpperCase());

      if (!teamId) {
        setError('Invalid team code. Please try again.');
        setIsLoading(false);
        return;
      }

      // Get team number from team_id
      const teamNumber = await authService.getTeamNumberByTeamId(teamId);

      if (!teamNumber) {
        setError('Unable to retrieve team information. Please try again.');
        setIsLoading(false);
        return;
      }

      // Navigate to name entry screen (pass teamCode for auth)
      router.push({
        pathname: '/enter-name' as any,
        params: {
          teamId: teamId,
          teamNumber: teamNumber.toString(),
          teamCode: teamCode.toUpperCase().trim(),
        },
      });
    } catch (error) {
      console.error('Login error:', error);
      setError('Unable to connect. Please check your internet connection and try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRegisterTeam = () => {
    router.push('/register-team' as any);
  };

  return (
    <SafeAreaView style={styles.container}>
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <View style={styles.content}>
          <Text style={styles.title}>ElectronScout</Text>
          <Text style={styles.subtitle}>FRC Scouting System</Text>

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
                returnKeyType="done"
                onSubmitEditing={handleContinue}
              />
              {error && <Text style={styles.errorText}>{error}</Text>}
            </View>

            <View style={styles.buttonContainer}>
              <TouchableOpacity
                style={[styles.button, styles.continueButton, isLoading && styles.buttonDisabled]}
                onPress={handleContinue}
                disabled={isLoading}
              >
                {isLoading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.buttonText}>Continue</Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.button, styles.registerButton, isLoading && styles.buttonDisabled]}
                onPress={handleRegisterTeam}
                disabled={isLoading}
              >
                <Text style={styles.buttonText}>Register a team</Text>
              </TouchableOpacity>
            </View>
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
    marginBottom: 20,
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
  buttonContainer: {
    marginTop: 24,
    gap: 12,
  },
  button: {
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 50,
  },
  continueButton: {
    backgroundColor: '#ff6600',
  },
  registerButton: {
    backgroundColor: '#404040',
    borderWidth: 1,
    borderColor: '#ff6600',
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

