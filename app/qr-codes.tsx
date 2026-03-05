// app/qr-codes.tsx - Display QR codes for sharing match data
import { useQrCodeStore } from '@/stores/qrCodeStore';
import { router } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import {
  Dimensions,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { SafeAreaView } from 'react-native-safe-area-context';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export default function QrCodesScreen() {
  const chunks = useQrCodeStore((s) => s.chunks);
  const [currentIndex, setCurrentIndex] = useState(0);
  const flatListRef = useRef<FlatList>(null);

  const onViewableItemsChanged = useCallback(
    ({ viewableItems }: { viewableItems: Array<{ index: number | null }> }) => {
      const idx = viewableItems[0]?.index;
      if (idx !== undefined && idx !== null) setCurrentIndex(idx);
    },
    []
  );
  const viewabilityConfig = { viewAreaCoveragePercentThreshold: 50 };

  if (chunks.length === 0) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>No QR codes to display</Text>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Text style={styles.backButtonText}>Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backButtonText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Share via QR Code</Text>
        <Text style={styles.subtitle}>
          Code {currentIndex + 1} of {chunks.length}
        </Text>
      </View>

      <FlatList
        ref={flatListRef}
        data={chunks}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
        keyExtractor={(_, i) => String(i)}
        renderItem={({ item }) => (
          <View style={styles.qrPage}>
            <View style={styles.qrWrapper}>
              <QRCode
                value={item}
                size={Math.min(SCREEN_WIDTH - 64, 280)}
                backgroundColor="white"
                color="black"
              />
            </View>
          </View>
        )}
      />

      {/* iOS-style dots indicator */}
      <View style={styles.dotsContainer}>
        {chunks.map((_, i) => (
          <View
            key={i}
            style={[
              styles.dot,
              i === currentIndex && styles.dotActive,
            ]}
          />
        ))}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a1a',
  },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  backButton: {
    alignSelf: 'flex-start',
    paddingVertical: 8,
    paddingHorizontal: 0,
    marginBottom: 4,
  },
  backButtonText: {
    color: '#ff6600',
    fontSize: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 2,
  },
  subtitle: {
    fontSize: 14,
    color: '#b0b0b0',
  },
  qrPage: {
    width: SCREEN_WIDTH,
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  qrWrapper: {
    backgroundColor: 'white',
    padding: 16,
    borderRadius: 12,
  },
  dotsContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 20,
    gap: 8,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#555',
  },
  dotActive: {
    backgroundColor: '#ff6600',
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  emptyText: {
    fontSize: 16,
    color: '#b0b0b0',
    marginBottom: 24,
  },
});
