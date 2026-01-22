// components/RapidCounterInput.tsx
import { Metric } from '@/config/gameConfig';
import * as Haptics from 'expo-haptics';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, GestureResponderEvent, PanResponder, PanResponderGestureState, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

interface RapidCounterInputProps {
  metric: Metric;
  value: number;
  onValueChange: (value: number) => void;
}

const INITIAL_SIZE = 60;
const EXPANDED_HEIGHT = 300;
const EXPANDED_WIDTH = 90;
const DEFAULT_MIN_RATE = 1; // per second
const DEFAULT_MAX_RATE = 20; // per second

export const RapidCounterInput: React.FC<RapidCounterInputProps> = ({
  metric,
  value,
  onValueChange,
}) => {
  const minRate = metric.minRate ?? DEFAULT_MIN_RATE;
  const maxRate = metric.maxRate ?? DEFAULT_MAX_RATE;
  
  const [isExpanded, setIsExpanded] = useState(false);
  const [displayRate, setDisplayRate] = useState((minRate + maxRate) / 2);
  
  // Animated values for UI
  const expandAnim = useRef(new Animated.Value(INITIAL_SIZE)).current;
  const widthAnim = useRef(new Animated.Value(INITIAL_SIZE)).current;
  const borderRadiusAnim = useRef(new Animated.Value(INITIAL_SIZE / 2)).current;
  const indicatorPositionAnim = useRef(new Animated.Value(0.5)).current;
  
  // All mutable state in refs to avoid closure issues
  const valueRef = useRef(value);
  const isActiveRef = useRef(false);
  const currentRateRef = useRef((minRate + maxRate) / 2);
  const intervalIdRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startYRef = useRef(0);
  const isExpandedRef = useRef(false);
  
  // Keep valueRef in sync with prop
  useEffect(() => {
    valueRef.current = value;
  }, [value]);

  // Calculate rate from position (0 = min rate at bottom, 1 = max rate at top)
  const getRateFromPosition = useCallback((position: number): number => {
    const clamped = Math.max(0, Math.min(1, position));
    return minRate + (maxRate - minRate) * clamped;
  }, [minRate, maxRate]);

  // Increment and haptic
  const doIncrement = useCallback(() => {
    const currentValue = valueRef.current;
    const newValue = currentValue + 1;
    
    if (metric.max && newValue > metric.max) {
      return; // Don't increment past max
    }
    
    valueRef.current = newValue;
    onValueChange(newValue);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, [metric.max, onValueChange]);

  // Start the increment interval
  const startIncrementInterval = useCallback(() => {
    if (intervalIdRef.current) {
      clearInterval(intervalIdRef.current);
    }
    
    isActiveRef.current = true;
    
    // Use setInterval with dynamic rate checking
    intervalIdRef.current = setInterval(() => {
      if (!isActiveRef.current) return;
      
      const rate = currentRateRef.current;
      const intervalMs = 1000 / rate;
      
      // Check if enough time has passed for this rate
      doIncrement();
    }, 50); // Check every 50ms, but only increment based on rate
    
    // Actually, let's use a better approach - track time and rate
    let lastIncrementTime = Date.now();
    
    if (intervalIdRef.current) {
      clearInterval(intervalIdRef.current);
    }
    
    intervalIdRef.current = setInterval(() => {
      if (!isActiveRef.current) return;
      
      const now = Date.now();
      const rate = currentRateRef.current;
      const intervalMs = 1000 / rate;
      
      if (now - lastIncrementTime >= intervalMs) {
        doIncrement();
        lastIncrementTime = now;
      }
    }, 16); // ~60fps checking
  }, [doIncrement]);

  // Stop the increment interval
  const stopIncrementInterval = useCallback(() => {
    isActiveRef.current = false;
    if (intervalIdRef.current) {
      clearInterval(intervalIdRef.current);
      intervalIdRef.current = null;
    }
  }, []);

  // Expand animation
  const expand = useCallback(() => {
    setIsExpanded(true);
    isExpandedRef.current = true;
    Animated.parallel([
      Animated.spring(expandAnim, {
        toValue: EXPANDED_HEIGHT,
        useNativeDriver: false,
        tension: 50,
        friction: 7,
      }),
      Animated.spring(widthAnim, {
        toValue: EXPANDED_WIDTH,
        useNativeDriver: false,
        tension: 50,
        friction: 7,
      }),
      Animated.spring(borderRadiusAnim, {
        toValue: EXPANDED_WIDTH / 2,
        useNativeDriver: false,
        tension: 50,
        friction: 7,
      }),
    ]).start();
  }, [expandAnim, widthAnim, borderRadiusAnim]);

  // Collapse animation
  const collapse = useCallback(() => {
    isExpandedRef.current = false;
    Animated.parallel([
      Animated.spring(expandAnim, {
        toValue: INITIAL_SIZE,
        useNativeDriver: false,
        tension: 50,
        friction: 7,
      }),
      Animated.spring(widthAnim, {
        toValue: INITIAL_SIZE,
        useNativeDriver: false,
        tension: 50,
        friction: 7,
      }),
      Animated.spring(borderRadiusAnim, {
        toValue: INITIAL_SIZE / 2,
        useNativeDriver: false,
        tension: 50,
        friction: 7,
      }),
    ]).start(() => {
      setIsExpanded(false);
    });
  }, [expandAnim, widthAnim, borderRadiusAnim]);

  // Pan responder handlers
  const handlePanGrant = useCallback((evt: GestureResponderEvent, gestureState: PanResponderGestureState) => {
    // Record starting Y position
    startYRef.current = evt.nativeEvent.pageY;
    
    // Expand the panel
    expand();
    
    // Start incrementing at middle rate
    currentRateRef.current = (minRate + maxRate) / 2;
    setDisplayRate(currentRateRef.current);
    indicatorPositionAnim.setValue(0.5);
    
    // Start increment interval
    startIncrementInterval();
  }, [expand, startIncrementInterval, minRate, maxRate, indicatorPositionAnim]);

  const handlePanMove = useCallback((evt: GestureResponderEvent, gestureState: PanResponderGestureState) => {
    // Use dy (delta Y from start) to calculate rate
    // Negative dy = finger moved up = higher rate
    // Positive dy = finger moved down = lower rate
    const dy = gestureState.dy;
    
    // Map dy to position (0-1)
    // Moving up 150px = position 1 (max rate)
    // Moving down 150px = position 0 (min rate)
    const position = 0.5 - (dy / 300); // 300px total range
    const clampedPosition = Math.max(0, Math.min(1, position));
    
    // Update rate
    const newRate = getRateFromPosition(clampedPosition);
    currentRateRef.current = newRate;
    setDisplayRate(newRate);
    indicatorPositionAnim.setValue(clampedPosition);
  }, [getRateFromPosition, indicatorPositionAnim]);

  const handlePanRelease = useCallback(() => {
    stopIncrementInterval();
    collapse();
  }, [stopIncrementInterval, collapse]);

  // Create pan responder
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (evt, gestureState) => {
        startYRef.current = evt.nativeEvent.pageY;
        
        // Expand
        setIsExpanded(true);
        isExpandedRef.current = true;
        Animated.parallel([
          Animated.spring(expandAnim, {
            toValue: EXPANDED_HEIGHT,
            useNativeDriver: false,
            tension: 50,
            friction: 7,
          }),
          Animated.spring(widthAnim, {
            toValue: EXPANDED_WIDTH,
            useNativeDriver: false,
            tension: 50,
            friction: 7,
          }),
          Animated.spring(borderRadiusAnim, {
            toValue: EXPANDED_WIDTH / 2,
            useNativeDriver: false,
            tension: 50,
            friction: 7,
          }),
        ]).start();
        
        // Set initial rate to middle
        currentRateRef.current = (minRate + maxRate) / 2;
        setDisplayRate(currentRateRef.current);
        indicatorPositionAnim.setValue(0.5);
        
        // Start incrementing
        isActiveRef.current = true;
        let lastIncrementTime = Date.now();
        
        if (intervalIdRef.current) {
          clearInterval(intervalIdRef.current);
        }
        
        intervalIdRef.current = setInterval(() => {
          if (!isActiveRef.current) return;
          
          const now = Date.now();
          const rate = currentRateRef.current;
          const intervalMs = 1000 / rate;
          
          if (now - lastIncrementTime >= intervalMs) {
            const currentValue = valueRef.current;
            const newValue = currentValue + 1;
            
            if (!metric.max || newValue <= metric.max) {
              valueRef.current = newValue;
              onValueChange(newValue);
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            }
            lastIncrementTime = now;
          }
        }, 16);
      },
      onPanResponderMove: (evt, gestureState) => {
        const dy = gestureState.dy;
        const position = 0.5 - (dy / 300);
        const clampedPosition = Math.max(0, Math.min(1, position));
        
        const newRate = minRate + (maxRate - minRate) * clampedPosition;
        currentRateRef.current = newRate;
        setDisplayRate(newRate);
        indicatorPositionAnim.setValue(clampedPosition);
      },
      onPanResponderRelease: () => {
        isActiveRef.current = false;
        if (intervalIdRef.current) {
          clearInterval(intervalIdRef.current);
          intervalIdRef.current = null;
        }
        
        // Collapse
        isExpandedRef.current = false;
        Animated.parallel([
          Animated.spring(expandAnim, {
            toValue: INITIAL_SIZE,
            useNativeDriver: false,
            tension: 50,
            friction: 7,
          }),
          Animated.spring(widthAnim, {
            toValue: INITIAL_SIZE,
            useNativeDriver: false,
            tension: 50,
            friction: 7,
          }),
          Animated.spring(borderRadiusAnim, {
            toValue: INITIAL_SIZE / 2,
            useNativeDriver: false,
            tension: 50,
            friction: 7,
          }),
        ]).start(() => {
          setIsExpanded(false);
        });
      },
      onPanResponderTerminate: () => {
        isActiveRef.current = false;
        if (intervalIdRef.current) {
          clearInterval(intervalIdRef.current);
          intervalIdRef.current = null;
        }
        
        isExpandedRef.current = false;
        Animated.parallel([
          Animated.spring(expandAnim, {
            toValue: INITIAL_SIZE,
            useNativeDriver: false,
            tension: 50,
            friction: 7,
          }),
          Animated.spring(widthAnim, {
            toValue: INITIAL_SIZE,
            useNativeDriver: false,
            tension: 50,
            friction: 7,
          }),
          Animated.spring(borderRadiusAnim, {
            toValue: INITIAL_SIZE / 2,
            useNativeDriver: false,
            tension: 50,
            friction: 7,
          }),
        ]).start(() => {
          setIsExpanded(false);
        });
      },
    })
  ).current;

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (intervalIdRef.current) {
        clearInterval(intervalIdRef.current);
      }
    };
  }, []);

  // Indicator position interpolation (0 = bottom, 1 = top)
  const indicatorTop = indicatorPositionAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [EXPANDED_HEIGHT - 30, 30],
  });

  return (
    <View style={styles.container}>
      <Text style={styles.label}>{metric.label}</Text>
      
      <View style={styles.counterRow}>
        {/* Decrement button */}
        <TouchableOpacity
          style={styles.counterButton}
          onPress={() => onValueChange(Math.max(0, value - 1))}
        >
          <Text style={styles.counterButtonText}>-</Text>
        </TouchableOpacity>

        {/* Value display */}
        <View style={styles.valueContainer}>
          <Text style={styles.valueText}>{value}</Text>
        </View>

        {/* Rapid counter button */}
        <Animated.View
          style={[
            styles.rapidCounterContainer,
            {
              height: expandAnim,
              width: widthAnim,
              borderRadius: borderRadiusAnim,
            },
          ]}
          {...panResponder.panHandlers}
        >
          {isExpanded ? (
            <View style={styles.expandedContent}>
              {/* Rate indicator dot */}
              <Animated.View
                style={[
                  styles.rateIndicator,
                  { top: indicatorTop },
                ]}
              />
              
              {/* Rate display */}
              <View style={styles.rateDisplay}>
                <Text style={styles.rateText}>{displayRate.toFixed(1)}/s</Text>
              </View>
              
              {/* Labels */}
              <View style={styles.rateLabels}>
                <Text style={styles.rateLabelText}>Fast</Text>
                <Text style={styles.rateLabelText}>Slow</Text>
              </View>
            </View>
          ) : (
            <View style={styles.collapsedContent}>
              <Text style={styles.plusText}>+</Text>
            </View>
          )}
        </Animated.View>
      </View>

      {metric.max && (
        <Text style={styles.maxLabel}>Max: {metric.max}</Text>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: 20,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 8,
  },
  counterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  counterButton: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#ff6600',
    justifyContent: 'center',
    alignItems: 'center',
  },
  counterButtonText: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#fff',
  },
  rapidCounterContainer: {
    backgroundColor: '#ff6600',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  collapsedContent: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  plusText: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#fff',
  },
  expandedContent: {
    width: '100%',
    height: '100%',
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
  },
  rateIndicator: {
    position: 'absolute',
    left: '50%',
    marginLeft: -12,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.5,
    shadowRadius: 4,
    elevation: 5,
  },
  rateDisplay: {
    position: 'absolute',
    top: 8,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  rateText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#fff',
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  rateLabels: {
    position: 'absolute',
    top: 50,
    bottom: 20,
    left: 0,
    right: 0,
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  rateLabelText: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.7)',
    fontWeight: '600',
  },
  valueContainer: {
    flex: 1,
    backgroundColor: '#2a2a2a',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  valueText: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#fff',
  },
  maxLabel: {
    fontSize: 12,
    color: '#b0b0b0',
    marginTop: 4,
  },
});
