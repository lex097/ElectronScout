import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useRef } from 'react';
import {
  Animated,
  Dimensions,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const SIDEBAR_WIDTH = 280;
const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface HamburgerSidebarProps {
  isOpen: boolean;
  onClose: () => void;
  onLogout: () => void;
  teamCode: string;
  teamNumber: string;
  isAdmin: boolean;
}

export function HamburgerSidebar({
  isOpen,
  onClose,
  onLogout,
  teamCode,
  teamNumber,
  isAdmin,
}: HamburgerSidebarProps) {
  const insets = useSafeAreaInsets();
  const translateX = useRef(new Animated.Value(-SIDEBAR_WIDTH)).current;
  const overlayOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (isOpen) {
      Animated.parallel([
        Animated.spring(translateX, {
          toValue: 0,
          useNativeDriver: true,
          tension: 80,
          friction: 12,
        }),
        Animated.timing(overlayOpacity, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(translateX, {
          toValue: -SIDEBAR_WIDTH,
          duration: 220,
          useNativeDriver: true,
        }),
        Animated.timing(overlayOpacity, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [isOpen, translateX, overlayOpacity]);

  return (
    <View
      style={[StyleSheet.absoluteFill, { zIndex: 1000 }]}
      pointerEvents={isOpen ? 'auto' : 'none'}
    >
      {/* Overlay */}
      <Animated.View
        style={[
          StyleSheet.absoluteFill,
          styles.overlay,
          { opacity: overlayOpacity },
        ]}
        pointerEvents={isOpen ? 'auto' : 'none'}
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      </Animated.View>

      {/* Sidebar panel */}
      <Animated.View
        style={[
          styles.sidebar,
          {
            paddingTop: insets.top + 16,
            paddingBottom: insets.bottom + 16,
            transform: [{ translateX }],
          },
        ]}
      >
        {/* Close button */}
        <TouchableOpacity style={styles.closeButton} onPress={onClose}>
          <Ionicons name="close" size={24} color="#b0b0b0" />
        </TouchableOpacity>

        {/* Team info */}
        <View style={styles.teamHeader}>
          <View style={styles.teamInfo}>
            <Text style={styles.teamNumberText}>Team {teamNumber}</Text>
            <Text style={styles.teamCodeText}>Code: {teamCode || '—'}</Text>
          </View>
        </View>

        <View style={styles.divider} />

        {/* Menu items */}
        <View style={styles.menuItems}>
          {isAdmin && (
            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => {
                onClose();
                router.push('/settings' as any);
              }}
            >
              <Ionicons name="settings-outline" size={22} color="#ff6600" />
              <Text style={styles.menuItemText}>Settings</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={[styles.menuItem, styles.logoutItem]}
            onPress={() => {
              onClose();
              onLogout();
            }}
          >
            <Ionicons name="log-out-outline" size={22} color="#ef4444" />
            <Text style={[styles.menuItemText, styles.logoutText]}>Sign Out</Text>
          </TouchableOpacity>
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  sidebar: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: SIDEBAR_WIDTH,
    backgroundColor: '#1e1e1e',
    borderRightWidth: 1,
    borderRightColor: '#333',
    paddingHorizontal: 20,
    shadowColor: '#000',
    shadowOffset: { width: 4, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 20,
  },
  closeButton: {
    alignSelf: 'flex-end',
    padding: 4,
    marginBottom: 8,
  },
  teamHeader: {
    marginBottom: 20,
  },
  teamInfo: {
    flexShrink: 1,
  },
  teamNumberText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '700',
  },
  teamCodeText: {
    color: '#b0b0b0',
    fontSize: 13,
    marginTop: 2,
  },
  divider: {
    height: 1,
    backgroundColor: '#333',
    marginBottom: 16,
  },
  menuItems: {
    gap: 4,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 10,
  },
  menuItemText: {
    color: '#e5e5e5',
    fontSize: 16,
    fontWeight: '500',
  },
  logoutItem: {
    marginTop: 8,
  },
  logoutText: {
    color: '#ef4444',
  },
});
