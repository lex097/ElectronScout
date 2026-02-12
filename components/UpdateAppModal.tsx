import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import {
  Linking,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

interface UpdateAppModalProps {
  visible: boolean;
  storeUrl: string;
  latestVersion?: string;
  onDismiss: () => void;
}

export function UpdateAppModal({
  visible,
  storeUrl,
  latestVersion,
  onDismiss,
}: UpdateAppModalProps) {
  const handleUpdate = () => {
    if (storeUrl) {
      Linking.openURL(storeUrl);
    }
    onDismiss();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onDismiss}
    >
      <View style={styles.overlay}>
        <View style={styles.card}>
          <View style={styles.iconContainer}>
            <Ionicons name="cloud-download-outline" size={48} color="#ff6600" />
          </View>
          <Text style={styles.title}>Update available</Text>
          <Text style={styles.message}>
            A new version of ElectronScout is available
            {latestVersion ? ` (${latestVersion})` : ''}. Update now to get the
            latest features and improvements.
          </Text>
          <View style={styles.buttons}>
            <TouchableOpacity
              style={styles.primaryButton}
              onPress={handleUpdate}
              activeOpacity={0.8}
            >
              <Text style={styles.primaryButtonText}>
                Update on {Platform.OS === 'ios' ? 'App Store' : 'Play Store'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={onDismiss}
              activeOpacity={0.8}
            >
              <Text style={styles.secondaryButtonText}>Later</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  card: {
    backgroundColor: '#2a2a2a',
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 340,
  },
  iconContainer: {
    alignSelf: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
    textAlign: 'center',
    marginBottom: 8,
  },
  message: {
    fontSize: 15,
    color: '#b0b0b0',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 24,
  },
  buttons: {
    gap: 12,
  },
  primaryButton: {
    backgroundColor: '#ff6600',
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  secondaryButton: {
    paddingVertical: 14,
    alignItems: 'center',
  },
  secondaryButtonText: {
    color: '#b0b0b0',
    fontSize: 16,
    fontWeight: '500',
  },
});
