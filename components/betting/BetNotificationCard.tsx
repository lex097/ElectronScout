import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useBetNotificationStore } from '../../stores/betNotificationStore';

const AUTO_DISMISS_MS = 5000;

export function BetNotificationCard() {
  const { notification, dismissNotification } = useBetNotificationStore();
  const insets = useSafeAreaInsets();
  const slideAnim = useRef(new Animated.Value(-120)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!notification) {
      slideAnim.setValue(-120);
      opacityAnim.setValue(0);
      return;
    }

    Animated.parallel([
      Animated.spring(slideAnim, {
        toValue: 0,
        useNativeDriver: true,
        tension: 80,
        friction: 10,
      }),
      Animated.timing(opacityAnim, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start();

    const timer = setTimeout(() => {
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: -120,
          duration: 250,
          useNativeDriver: true,
        }),
        Animated.timing(opacityAnim, {
          toValue: 0,
          duration: 250,
          useNativeDriver: true,
        }),
      ]).start(dismissNotification);
    }, AUTO_DISMISS_MS);

    return () => clearTimeout(timer);
  }, [notification, slideAnim, opacityAnim, dismissNotification]);

  if (!notification) return null;

  const { matchNumber, won, payout } = notification;

  return (
    <Animated.View
      style={[
        styles.container,
        {
          top: insets.top + 8,
          transform: [{ translateY: slideAnim }],
          opacity: opacityAnim,
        },
      ]}
      pointerEvents="box-none"
    >
      <TouchableOpacity
        style={[styles.card, won ? styles.cardWon : styles.cardLost]}
        onPress={dismissNotification}
        activeOpacity={0.9}
      >
        <View style={styles.iconContainer}>
          <Ionicons
            name={won ? 'trophy' : 'close-circle'}
            size={28}
            color={won ? '#10b981' : '#ef4444'}
          />
        </View>
        <View style={styles.content}>
          <Text style={styles.title}>
            {won ? 'Bet Won!' : 'Bet Lost'}
          </Text>
          <Text style={styles.subtitle}>
            {won
              ? `Match ${matchNumber} • Payout: ${payout} ebucks`
              : `Match ${matchNumber}`}
          </Text>
        </View>
        <TouchableOpacity
          style={styles.dismissButton}
          onPress={dismissNotification}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Ionicons name="close" size={22} color="#888" />
        </TouchableOpacity>
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 16,
    right: 16,
    zIndex: 9999,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    backgroundColor: '#2a2a2a',
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  cardWon: {
    borderColor: '#10b981',
    backgroundColor: '#1a2e1a',
  },
  cardLost: {
    borderColor: '#ef4444',
    backgroundColor: '#2e1a1a',
  },
  iconContainer: {
    marginRight: 12,
  },
  content: {
    flex: 1,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 2,
  },
  subtitle: {
    fontSize: 14,
    color: '#b0b0b0',
  },
  dismissButton: {
    padding: 4,
  },
});
