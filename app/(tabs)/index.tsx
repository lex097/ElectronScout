// app/(tabs)/index.tsx - Match Scouting Screen
import { useEffect, useState } from 'react';
import { Alert, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ACTIVE_GAME_CONFIG, getInitialMatchData, Metric } from '../../config/gameConfig';
import { db } from '../../services/database';
import { supabaseSyncService } from '../../services/supabase.sync';
import { MatchData } from '../../types/match';

export default function MatchScoutScreen() {
  const [matchNumber, setMatchNumber] = useState('1');
  const [teamNumber, setTeamNumber] = useState('');
  const [currentPhaseIndex, setCurrentPhaseIndex] = useState(0);
  const [metrics, setMetrics] = useState(getInitialMatchData());
  const [notes, setNotes] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [duplicateWarning, setDuplicateWarning] = useState<string | null>(null);
  const [isCheckingDuplicate, setIsCheckingDuplicate] = useState(false);

  const currentPhase = ACTIVE_GAME_CONFIG.phases[currentPhaseIndex];

  useEffect(() => {
    // Initialize database on mount
    db.init().catch(console.error);
  }, []);

  // Check for duplicate matches when match number or team number changes
  useEffect(() => {
    const checkDuplicate = async () => {
      const matchNum = parseInt(matchNumber);
      const teamNum = parseInt(teamNumber);

      // Only check if both values are valid numbers
      if (!matchNumber || !teamNumber || isNaN(matchNum) || isNaN(teamNum)) {
        setDuplicateWarning(null);
        return;
      }

      setIsCheckingDuplicate(true);
      try {
        // Check local database
        const localExists = await db.checkMatchExists(matchNum, teamNum);
        
        // Check Supabase
        const remoteExists = await supabaseSyncService.checkMatchExists(matchNum, teamNum);

        if (localExists || remoteExists) {
          const sources = [];
          if (localExists) sources.push('local');
          if (remoteExists) sources.push('global');
          setDuplicateWarning(
            `Warning: A match with Match #${matchNum} and Team #${teamNum} already exists in your ${sources.join(' and ')} data. You can still continue to save if this is intentional.`
          );
        } else {
          setDuplicateWarning(null);
        }
      } catch (error) {
        console.error('Error checking for duplicate:', error);
        // Don't show error to user, just silently fail
        setDuplicateWarning(null);
      } finally {
        setIsCheckingDuplicate(false);
      }
    };

    // Debounce the check to avoid too many queries
    const timeoutId = setTimeout(checkDuplicate, 500);
    return () => clearTimeout(timeoutId);
  }, [matchNumber, teamNumber]);

  const updateMetric = (metricId: string, value: any) => {
    setMetrics(prev => ({
      ...prev,
      [metricId]: value
    }));
  };

  const renderMetricInput = (metric: Metric) => {
    const value = metrics[metric.id];

    switch (metric.type) {
      case 'counter':
        return (
          <View key={metric.id} style={styles.metricContainer}>
            <Text style={styles.metricLabel}>{metric.label}</Text>
            <View style={styles.counterContainer}>
              <TouchableOpacity
                style={styles.counterButton}
                onPress={() => updateMetric(metric.id, Math.max(0, value - 1))}
              >
                <Text style={styles.counterButtonText}>-</Text>
              </TouchableOpacity>
              
              <View style={styles.counterValue}>
                <Text style={styles.counterValueText}>{value}</Text>
              </View>
              
              <TouchableOpacity
                style={styles.counterButton}
                onPress={() => {
                  const newValue = value + 1;
                  if (!metric.max || newValue <= metric.max) {
                    updateMetric(metric.id, newValue);
                  }
                }}
              >
                <Text style={styles.counterButtonText}>+</Text>
              </TouchableOpacity>
            </View>
            {metric.max && (
              <Text style={styles.maxLabel}>Max: {metric.max}</Text>
            )}
          </View>
        );

      case 'boolean':
        return (
          <TouchableOpacity
            key={metric.id}
            style={[
              styles.booleanButton,
              value && styles.booleanButtonActive
            ]}
            onPress={() => updateMetric(metric.id, !value)}
          >
            <Text style={[
              styles.booleanButtonText,
              value && styles.booleanButtonTextActive
            ]}>
              {metric.label}: {value ? 'YES' : 'NO'}
            </Text>
          </TouchableOpacity>
        );

      case 'select':
        return (
          <View key={metric.id} style={styles.metricContainer}>
            <Text style={styles.metricLabel}>{metric.label}</Text>
            <View style={styles.selectContainer}>
              {metric.options?.map(option => (
                <TouchableOpacity
                  key={option}
                  style={[
                    styles.selectButton,
                    value === option && styles.selectButtonActive
                  ]}
                  onPress={() => updateMetric(metric.id, option)}
                >
                  <Text style={[
                    styles.selectButtonText,
                    value === option && styles.selectButtonTextActive
                  ]}>
                    {option}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        );

      default:
        return null;
    }
  };

  const handleSave = async () => {
    if (!teamNumber || !matchNumber) {
      Alert.alert('Error', 'Please enter match and team number');
      return;
    }

    setIsSaving(true);

    try {
      const matchData: MatchData = {
        id: `${Date.now()}-${matchNumber}-${teamNumber}`,
        matchNumber: parseInt(matchNumber),
        teamNumber: parseInt(teamNumber),
        scouterId: 'local-user', // TODO: Replace with actual user ID
        gameYear: ACTIVE_GAME_CONFIG.year,
        metrics,
        timestamp: Date.now(),
        synced: false,
        notes
      };

      await db.saveMatch(matchData);
      
      Alert.alert(
        'Success',
        `Match ${matchNumber} for team ${teamNumber} saved!`,
        [
          {
            text: 'New Match',
            onPress: () => {
              setMatchNumber((parseInt(matchNumber) + 1).toString());
              setTeamNumber('');
              setMetrics(getInitialMatchData());
              setNotes('');
              setCurrentPhaseIndex(0);
            }
          }
        ]
      );
    } catch (error) {
      Alert.alert('Error', 'Failed to save match data');
      console.error(error);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <View style={styles.header}>
        <Text style={styles.title}>FRC Scout - {ACTIVE_GAME_CONFIG.gameName}</Text>
      </View>

      <ScrollView style={styles.content}>
        {/* Match Info */}
        <View style={styles.matchInfo}>
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Match #</Text>
            <TextInput
              style={styles.input}
              value={matchNumber}
              onChangeText={setMatchNumber}
              keyboardType="number-pad"
              placeholder="1"
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Team #</Text>
            <TextInput
              style={styles.input}
              value={teamNumber}
              onChangeText={setTeamNumber}
              keyboardType="number-pad"
              placeholder="1234"
            />
          </View>
        </View>

        {/* Duplicate Warning */}
        {duplicateWarning && (
          <View style={styles.warningContainer}>
            <Text style={styles.warningText}>{duplicateWarning}</Text>
          </View>
        )}

        {/* Phase Tabs */}
        <View style={styles.phaseTabs}>
          {ACTIVE_GAME_CONFIG.phases.map((phase, index) => (
            <TouchableOpacity
              key={phase.id}
              style={[
                styles.phaseTab,
                currentPhaseIndex === index && styles.phaseTabActive
              ]}
              onPress={() => setCurrentPhaseIndex(index)}
            >
              <Text style={[
                styles.phaseTabText,
                currentPhaseIndex === index && styles.phaseTabTextActive
              ]}>
                {phase.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Current Phase Metrics */}
        <View style={styles.metricsSection}>
          <Text style={styles.phaseTitle}>{currentPhase.label}</Text>
          {currentPhase.metrics.map(metric => renderMetricInput(metric))}
        </View>

        {/* Notes */}
        <View style={styles.notesSection}>
          <Text style={styles.inputLabel}>Notes (Optional)</Text>
          <TextInput
            style={styles.notesInput}
            value={notes}
            onChangeText={setNotes}
            placeholder="Additional observations..."
            multiline
            numberOfLines={3}
          />
        </View>

        {/* Save Button */}
        <TouchableOpacity
          style={[styles.saveButton, isSaving && styles.saveButtonDisabled]}
          onPress={handleSave}
          disabled={isSaving}
        >
          <Text style={styles.saveButtonText}>
            {isSaving ? 'Saving...' : 'Save Match'}
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = {
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    backgroundColor: '#1e40af',
    padding: 16,
    alignItems: 'center' as const,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold' as const,
    color: 'white',
  },
  content: {
    flex: 1,
    padding: 16,
  },
  matchInfo: {
    flexDirection: 'row' as const,
    gap: 12,
    marginBottom: 16,
  },
  inputGroup: {
    flex: 1,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600' as const,
    marginBottom: 6,
    color: '#374151',
  },
  input: {
    backgroundColor: 'white',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#d1d5db',
  },
  phaseTabs: {
    flexDirection: 'row' as const,
    marginBottom: 16,
    gap: 8,
  },
  phaseTab: {
    flex: 1,
    backgroundColor: 'white',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center' as const,
    borderWidth: 2,
    borderColor: '#e5e7eb',
  },
  phaseTabActive: {
    backgroundColor: '#1e40af',
    borderColor: '#1e40af',
  },
  phaseTabText: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: '#6b7280',
  },
  phaseTabTextActive: {
    color: 'white',
  },
  metricsSection: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  phaseTitle: {
    fontSize: 18,
    fontWeight: 'bold' as const,
    marginBottom: 16,
    color: '#1f2937',
  },
  metricContainer: {
    marginBottom: 20,
  },
  metricLabel: {
    fontSize: 16,
    fontWeight: '600' as const,
    marginBottom: 8,
    color: '#374151',
  },
  counterContainer: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 12,
  },
  counterButton: {
    backgroundColor: '#1e40af',
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  counterButtonText: {
    fontSize: 32,
    color: 'white',
    fontWeight: 'bold' as const,
  },
  counterValue: {
    flex: 1,
    backgroundColor: '#f3f4f6',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center' as const,
  },
  counterValueText: {
    fontSize: 32,
    fontWeight: 'bold' as const,
    color: '#1f2937',
  },
  maxLabel: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: 4,
  },
  booleanButton: {
    backgroundColor: '#e5e7eb',
    padding: 20,
    borderRadius: 8,
    marginBottom: 12,
    alignItems: 'center' as const,
  },
  booleanButtonActive: {
    backgroundColor: '#10b981',
  },
  booleanButtonText: {
    fontSize: 18,
    fontWeight: '600' as const,
    color: '#374151',
  },
  booleanButtonTextActive: {
    color: 'white',
  },
  selectContainer: {
    gap: 8,
  },
  selectButton: {
    backgroundColor: '#f3f4f6',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center' as const,
    borderWidth: 2,
    borderColor: '#e5e7eb',
  },
  selectButtonActive: {
    backgroundColor: '#1e40af',
    borderColor: '#1e40af',
  },
  selectButtonText: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: '#374151',
  },
  selectButtonTextActive: {
    color: 'white',
  },
  notesSection: {
    marginBottom: 16,
  },
  notesInput: {
    backgroundColor: 'white',
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    borderWidth: 1,
    borderColor: '#d1d5db',
    minHeight: 80,
    textAlignVertical: 'top' as const,
  },
  saveButton: {
    backgroundColor: '#10b981',
    padding: 20,
    borderRadius: 12,
    alignItems: 'center' as const,
    marginBottom: 32,
  },
  saveButtonDisabled: {
    opacity: 0.5,
  },
  saveButtonText: {
    fontSize: 18,
    fontWeight: 'bold' as const,
    color: 'white',
  },
  warningContainer: {
    backgroundColor: '#fef3c7',
    borderLeftWidth: 4,
    borderLeftColor: '#f59e0b',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  warningText: {
    fontSize: 14,
    color: '#92400e',
    lineHeight: 20,
  },
};