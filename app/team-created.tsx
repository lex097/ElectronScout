// app/team-created.tsx - Team Creation Success Screen
import { router, useLocalSearchParams } from 'expo-router';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function TeamCreatedScreen() {
  const params = useLocalSearchParams<{ teamCode: string; teamNumber: string; adminCode?: string }>();
  const { teamCode, teamNumber, adminCode } = params;

  const handleContinue = async () => {
    // Navigate to name entry screen
    router.push({
      pathname: '/enter-name' as any,
      params: {
        teamNumber: teamNumber,
      },
    });
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
    backgroundColor: '#1a1a1a',
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
    color: '#ff6600',
  },
  message: {
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 32,
    color: '#b0b0b0',
  },
  codeContainer: {
    backgroundColor: '#2a2a2a',
    borderRadius: 12,
    padding: 24,
    marginBottom: 24,
    width: '100%',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#ff6600',
  },
  codeLabel: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 12,
    color: '#e5e5e5',
  },
  code: {
    fontSize: 36,
    fontWeight: 'bold',
    letterSpacing: 4,
    color: '#ff6600',
    fontFamily: 'monospace',
  },
  adminCodeContainer: {
    marginTop: 0,
    marginBottom: 24,
    borderColor: '#10b981',
  },
  warningContainer: {
    backgroundColor: '#3a3a3a',
    borderRadius: 8,
    padding: 16,
    marginBottom: 32,
    width: '100%',
    borderWidth: 1,
    borderColor: '#ff9900',
  },
  warningText: {
    fontSize: 14,
    color: '#ffcc00',
    textAlign: 'center',
  },
  button: {
    backgroundColor: '#ff6600',
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

