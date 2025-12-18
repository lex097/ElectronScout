import React, { useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

type Props = {
  disabled?: boolean;
  error?: string | null;
  helperText?: string;
  onSubmit: (code: string) => void | Promise<void>;
};

export function AdminCodeInput({ disabled, error, helperText, onSubmit }: Props) {
  const inputRef = useRef<TextInput>(null);
  const [code, setCode] = useState('');

  const boxes = useMemo(() => Array.from({ length: 6 }, (_, i) => i), []);
  const canSubmit = code.length === 6 && !disabled;

  const handleChange = (text: string) => {
    const digits = text.replace(/[^0-9]/g, '').slice(0, 6);
    setCode(digits);
  };

  const handlePressContainer = () => {
    if (disabled) return;
    inputRef.current?.focus();
  };

  const handleSubmit = async () => {
    if (!canSubmit) return;
    await onSubmit(code);
  };

  return (
    <View>
      <Pressable onPress={handlePressContainer} style={styles.boxRow} accessibilityRole="button">
        {boxes.map((i) => {
          const filled = i < code.length;
          return (
            <View key={i} style={[styles.box, filled && styles.boxFilled, error && styles.boxError]}>
              <Text style={styles.boxText}>{filled ? '•' : ''}</Text>
            </View>
          );
        })}
      </Pressable>

      <TextInput
        ref={inputRef}
        value={code}
        onChangeText={handleChange}
        keyboardType="number-pad"
        maxLength={6}
        editable={!disabled}
        autoFocus={false}
        style={styles.hiddenInput}
        onSubmitEditing={handleSubmit}
      />

      {error ? <Text style={styles.errorText}>{error}</Text> : null}
      {helperText ? <Text style={styles.helperText}>{helperText}</Text> : null}

      <View style={styles.buttonRow}>
        <TouchableOpacity
          style={[styles.secondaryButton, disabled && styles.buttonDisabled]}
          disabled={disabled}
          onPress={() => setCode('')}
        >
          <Text style={styles.secondaryButtonText}>Clear</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.primaryButton, !canSubmit && styles.buttonDisabled]}
          disabled={!canSubmit}
          onPress={handleSubmit}
        >
          <Text style={styles.primaryButtonText}>Unlock</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  boxRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
    marginBottom: 12,
  },
  box: {
    flex: 1,
    height: 52,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#d1d5db',
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxFilled: {
    borderColor: '#1e40af',
  },
  boxError: {
    borderColor: '#ef4444',
  },
  boxText: {
    fontSize: 24,
    color: '#111827',
    fontWeight: '700',
  },
  hiddenInput: {
    position: 'absolute',
    opacity: 0,
    height: 0,
    width: 0,
  },
  errorText: {
    marginTop: 6,
    color: '#ef4444',
    fontSize: 13,
    textAlign: 'center',
  },
  helperText: {
    marginTop: 10,
    color: '#6b7280',
    fontSize: 13,
    textAlign: 'center',
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 16,
  },
  primaryButton: {
    flex: 1,
    backgroundColor: '#1e40af',
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  secondaryButton: {
    flex: 1,
    backgroundColor: '#fff',
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  secondaryButtonText: {
    color: '#374151',
    fontSize: 15,
    fontWeight: '700',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
});


