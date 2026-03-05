// components/SurveyModal.tsx - Post-match survey modal
import {
  ACTIVE_GAME_CONFIG,
  getInitialSurveyData,
  SurveyQuestion,
} from '@/config/gameConfig';
import React, { useCallback, useRef, useState } from 'react';
import {
  Dimensions,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

type SurveyAnswers = Record<string, number | string | string[] | null>;

type Props = {
  visible: boolean;
  onClose: () => void;
  onSubmit: (survey: SurveyAnswers) => void | Promise<void>;
  isSubmitting?: boolean;
};

export function SurveyModal({
  visible,
  onClose,
  onSubmit,
  isSubmitting = false,
}: Props) {
  const [answers, setAnswers] = useState<SurveyAnswers>(() =>
    getInitialSurveyData()
  );

  const survey = ACTIVE_GAME_CONFIG.survey;
  const textInputRef = useRef<TextInput>(null);
  const isShiftPressedRef = useRef(false);

  const updateAnswer = useCallback((id: string, value: any) => {
    setAnswers((prev) => ({ ...prev, [id]: value }));
  }, []);

  const toggleMultipleChoice = useCallback((id: string, option: string) => {
    setAnswers((prev) => {
      const current = (prev[id] as string[]) || [];
      const next = current.includes(option)
        ? current.filter((o) => o !== option)
        : [...current, option];
      return { ...prev, [id]: next };
    });
  }, []);

  const handleSubmit = useCallback(async () => {
    await onSubmit(answers);
  }, [answers, onSubmit]);

  const renderQuestion = (q: SurveyQuestion) => {
    if (q.type === 'rating') {
      const value = answers[q.id] as number | null;
      return (
        <View key={q.id} style={styles.questionBlock}>
          <Text style={styles.questionLabel}>{q.label}</Text>
          <View style={styles.ratingRow}>
            {[1, 2, 3, 4, 5].map((n) => (
              <TouchableOpacity
                key={n}
                style={[
                  styles.ratingCircle,
                  value === n && styles.ratingCircleSelected,
                ]}
                onPress={() => updateAnswer(q.id, n)}
                activeOpacity={0.7}
              >
                <Text
                  style={[
                    styles.ratingCircleText,
                    value === n && styles.ratingCircleTextSelected,
                  ]}
                >
                  {n}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <View style={styles.ratingLabels}>
            {[1, 2, 3, 4, 5].map((n) => (
              <Text key={n} style={styles.ratingLabel}>
                {n}
              </Text>
            ))}
          </View>
        </View>
      );
    }

    if (q.type === 'singleChoice') {
      const value = answers[q.id] as string | null;
      return (
        <View key={q.id} style={styles.questionBlock}>
          <Text style={styles.questionLabel}>{q.label}</Text>
          <View style={styles.choiceColumn}>
            {q.options.map((opt) => (
              <TouchableOpacity
                key={opt}
                style={styles.choiceRow}
                onPress={() => updateAnswer(q.id, opt)}
                activeOpacity={0.7}
              >
                <View
                  style={[
                    styles.radioCircle,
                    value === opt && styles.radioCircleSelected,
                  ]}
                >
                  {value === opt && <View style={styles.radioInner} />}
                </View>
                <Text style={styles.choiceText}>{opt}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      );
    }

    if (q.type === 'multipleChoice') {
      const value = (answers[q.id] as string[]) || [];
      return (
        <View key={q.id} style={styles.questionBlock}>
          <Text style={styles.questionLabel}>{q.label}</Text>
          <View style={styles.choiceColumn}>
            {q.options.map((opt) => {
              const checked = value.includes(opt);
              return (
                <TouchableOpacity
                  key={opt}
                  style={styles.choiceRow}
                  onPress={() => toggleMultipleChoice(q.id, opt)}
                  activeOpacity={0.7}
                >
                  <View
                    style={[
                      styles.checkboxSquare,
                      checked && styles.checkboxSquareSelected,
                    ]}
                  >
                    {checked && (
                      <Text style={styles.checkboxCheck}>✓</Text>
                    )}
                  </View>
                  <Text style={styles.choiceText}>{opt}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      );
    }

    if (q.type === 'text') {
      const value = (answers[q.id] as string) || '';
      return (
        <View key={q.id} style={styles.questionBlock}>
          <Text style={styles.questionLabel}>{q.label}</Text>
          <TextInput
            ref={textInputRef}
            style={styles.textInput}
            value={value}
            onChangeText={(t) => updateAnswer(q.id, t)}
            placeholder="Additional observations..."
            placeholderTextColor="#6b7280"
            multiline
            numberOfLines={3}
            onKeyPress={(e) => {
              const key = e.nativeEvent?.key;
              if (key === 'Enter' || key === 'Return') {
                if (!isShiftPressedRef.current) {
                  Keyboard.dismiss();
                  textInputRef.current?.blur();
                }
              } else if (key === 'Shift' || key === 'ShiftLeft' || key === 'ShiftRight') {
                isShiftPressedRef.current = true;
                setTimeout(() => { isShiftPressedRef.current = false; }, 1000);
              }
            }}
          />
        </View>
      );
    }

    return null;
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
      >
        <View style={styles.overlayInner}>
          <Pressable
            style={styles.backdropPressable}
            onPress={Keyboard.dismiss}
          />
          <View style={styles.modal} pointerEvents="box-none">
            <View style={styles.header}>
              <Text style={styles.title}>Post-Match Survey</Text>
              <TouchableOpacity onPress={onClose} hitSlop={12}>
                <Text style={styles.closeText}>Cancel</Text>
              </TouchableOpacity>
            </View>

            <ScrollView
              style={styles.scroll}
              contentContainerStyle={styles.scrollContent}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
              scrollEventThrottle={16}
              showsVerticalScrollIndicator={true}
            >
              {survey.map(renderQuestion)}
              <TouchableOpacity
                style={[styles.submitButton, isSubmitting && styles.submitButtonDisabled]}
                onPress={handleSubmit}
                disabled={isSubmitting}
                delayPressIn={0}
              >
                <Text style={styles.submitButtonText}>
                  {isSubmitting ? 'Submitting...' : 'Submit Match'}
                </Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  overlayInner: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdropPressable: {
    ...StyleSheet.absoluteFillObject,
  },
  modal: {
    backgroundColor: '#1a1a1a',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    height: Dimensions.get('window').height * 0.85,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#404040',
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#ff6600',
  },
  closeText: {
    fontSize: 16,
    color: '#b0b0b0',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },
  questionBlock: {
    marginBottom: 24,
  },
  questionLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 12,
  },
  ratingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  ratingCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 2,
    borderColor: '#404040',
    backgroundColor: '#2a2a2a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ratingCircleSelected: {
    borderColor: '#ff6600',
    backgroundColor: '#3a2a1a',
  },
  ratingCircleText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#b0b0b0',
  },
  ratingCircleTextSelected: {
    color: '#ff6600',
  },
  ratingLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
  },
  ratingLabel: {
    fontSize: 12,
    color: '#6b7280',
    width: 40,
    textAlign: 'center',
  },
  choiceColumn: {
    gap: 12,
  },
  choiceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  radioCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#404040',
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioCircleSelected: {
    borderColor: '#ff6600',
  },
  radioInner: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#ff6600',
  },
  checkboxSquare: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#404040',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxSquareSelected: {
    borderColor: '#ff6600',
    backgroundColor: '#3a2a1a',
  },
  checkboxCheck: {
    color: '#ff6600',
    fontSize: 14,
    fontWeight: 'bold',
  },
  choiceText: {
    fontSize: 16,
    color: '#e5e5e5',
    flex: 1,
  },
  textInput: {
    backgroundColor: '#2a2a2a',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: '#fff',
    borderWidth: 1,
    borderColor: '#404040',
    minHeight: 80,
    textAlignVertical: 'top',
  },
  submitButton: {
    backgroundColor: '#ff6600',
    marginTop: 24,
    marginBottom: 32,
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  submitButtonDisabled: {
    opacity: 0.6,
  },
  submitButtonText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
  },
});
