// app/create-admin-code.tsx - Admin Code Creation Screen
import { authService } from '@/services/authService';
import { router, useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
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

export default function CreateAdminCodeScreen() {
  const params = useLocalSearchParams<{ teamId: string; teamCode: string; teamNumber: string }>();
  const { teamId, teamCode, teamNumber } = params;
  const [adminCode, setAdminCode] = useState('');
  const [confirmCode, setConfirmCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const confirmInputRef = useRef<TextInput>(null);

  const handleAdminCodeChange = (text: string) => {
    // Only allow digits, max 6 characters
    const digitsOnly = text.replace(/[^0-9]/g, '').slice(0, 6);
    setAdminCode(digitsOnly);
    setError(null);
    
    // Auto-advance to confirm input when 6 digits entered
    if (digitsOnly.length === 6) {
      confirmInputRef.current?.focus();
    }
  };

  const handleConfirmCodeChange = (text: string) => {
    // Only allow digits, max 6 characters
    const digitsOnly = text.replace(/[^0-9]/g, '').slice(0, 6);
    setConfirmCode(digitsOnly);
    setError(null);
  };

  const validateCodes = (): boolean => {
    if (adminCode.length !== 6) {
      setError('Admin code must be exactly 6 digits');
      return false;
    }

    if (confirmCode.length !== 6) {
      setError('Please confirm your admin code');
      return false;
    }

    if (adminCode !== confirmCode) {
      setError('Admin codes do not match');
      return false;
    }

    return true;
  };

  const handleCreate = async () => {
    if (!validateCodes()) {
      return;
    }

    if (!teamId) {
      Alert.alert('Error', 'Team ID is missing');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const success = await authService.setAdminCode(teamId, adminCode);

      if (!success) {
        setError('Failed to save admin code. Please try again.');
        setIsLoading(false);
        return;
      }

      // Navigate to team created screen with admin code
      router.push({
        pathname: '/team-created' as any,
        params: {
          teamCode: teamCode || '',
          teamNumber: teamNumber || '',
          adminCode: adminCode,
        },
      });
    } catch (error) {
      console.error('Error creating admin code:', error);
      setError('Unable to connect. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <View style={styles.content}>
          <Text style={styles.title}>Create Admin Code</Text>
          <Text style={styles.subtitle}>
            Set a 6-digit code for team administrators
          </Text>

          <View style={styles.form}>
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Admin Code</Text>
              <TextInput
                style={[styles.input, error && styles.inputError]}
                value={adminCode}
                onChangeText={handleAdminCodeChange}
                placeholder="000000"
                placeholderTextColor="#888"
                keyboardType="number-pad"
                maxLength={6}
                editable={!isLoading}
                returnKeyType="next"
                onSubmitEditing={() => confirmInputRef.current?.focus()}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Confirm Admin Code</Text>
              <TextInput
                ref={confirmInputRef}
                style={[styles.input, error && styles.inputError]}
                value={confirmCode}
                onChangeText={handleConfirmCodeChange}
                placeholder="000000"
                placeholderTextColor="#888"
                keyboardType="number-pad"
                maxLength={6}
                editable={!isLoading}
                returnKeyType="done"
                onSubmitEditing={() => {
                  Keyboard.dismiss();
                  if (adminCode.length === 6 && confirmCode.length === 6) {
                    handleCreate();
                  }
                }}
              />
              {error && <Text style={styles.errorText}>{error}</Text>}
            </View>

            <TouchableOpacity
              style={[styles.button, isLoading && styles.buttonDisabled]}
              onPress={handleCreate}
              disabled={isLoading || adminCode.length !== 6 || confirmCode.length !== 6}
            >
              {isLoading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.buttonText}>Create</Text>
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
    letterSpacing: 8,
    textAlign: 'center',
    borderWidth: 1,
    borderColor: '#404040',
    fontFamily: 'monospace',
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
    marginTop: 8,
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

