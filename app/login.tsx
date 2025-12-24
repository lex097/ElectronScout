// app/login.tsx - Login Screen
import { authService } from '@/services/authService';
import { useAuthStore } from '@/stores/authStore';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
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

export default function LoginScreen() {
  const [name, setName] = useState('');
  const [teamNumber, setTeamNumber] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const login = useAuthStore((state) => state.login);

  const handleContinue = async () => {
    if (!name.trim() || !teamNumber.trim()) {
      Alert.alert('Error', 'Please enter name and team number');
      return;
    }

    // Validate team number is numeric
    const teamNum = parseInt(teamNumber, 10);
    if (isNaN(teamNum) || teamNum < 1 || teamNum > 9999) {
      Alert.alert('Error', 'Please enter a valid team number (1-9999)');
      return;
    }

    setIsLoading(true);
    try {
      // Store name in AsyncStorage first (will be used in verification/creation screens)
      await AsyncStorage.setItem('scout_name', name);

      // Search for team by number
      const teamSearch = await authService.searchTeamByNumber(teamNum);

      if (teamSearch.exists && teamSearch.teamId) {
        // Team exists - navigate to team code verification
        router.push({
          pathname: '/verify-team-code' as any,
          params: {
            teamId: teamSearch.teamId,
            teamNumber: teamNumber,
          },
        });
      } else {
        // Team doesn't exist - create it
        try {
          const { teamId, teamCode } = await authService.createTeam(teamNum);
          
          // Navigate to admin code creation screen
          router.push({
            pathname: '/create-admin-code' as any,
            params: {
              teamId: teamId,
              teamCode: teamCode,
              teamNumber: teamNumber,
            },
          });
        } catch (createError) {
          Alert.alert(
            'Error',
            createError instanceof Error ? createError.message : 'Failed to create team. Please try again.'
          );
        }
      }
    } catch (error) {
      console.error('Login error:', error);
      Alert.alert(
        'Error',
        'Unable to connect. Please check your internet connection and try again.'
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <View style={styles.content}>
          <Text style={styles.title}>ElectronScout</Text>
          <Text style={styles.subtitle}>FRC Scouting System</Text>

          <View style={styles.form}>
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Name</Text>
              <TextInput
                style={styles.input}
                value={name}
                onChangeText={setName}
                placeholder="Enter name"
                placeholderTextColor="#888"
                autoCapitalize="none"
                autoCorrect={false}
                editable={!isLoading}
                returnKeyType="next"
                onSubmitEditing={() => {
                  // Focus next input or dismiss keyboard
                  Keyboard.dismiss();
                }}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Team Number</Text>
              <TextInput
                style={styles.input}
                value={teamNumber}
                onChangeText={setTeamNumber}
                placeholder="Enter team number"
                placeholderTextColor="#888"
                keyboardType="number-pad"
                autoCapitalize="none"
                autoCorrect={false}
                editable={!isLoading}
                returnKeyType="done"
                onSubmitEditing={() => {
                  Keyboard.dismiss();
                  if (name.trim() && teamNumber.trim()) {
                    handleContinue();
                  }
                }}
              />
            </View>

            <View style={styles.buttonContainer}>
              <TouchableOpacity
                style={[styles.button, styles.continueButton]}
                onPress={handleContinue}
                disabled={isLoading}
              >
                {isLoading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.buttonText}>Continue</Text>
                )}
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
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#404040',
    color: '#fff',
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
  buttonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
});

