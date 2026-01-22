// components/RapidCounterInput.tsx
import { Metric } from '@/config/gameConfig';
import * as Haptics from 'expo-haptics';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, PanResponder, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

interface RapidCounterInputProps {
  metric: Metric;
  value: number;
  onValueChange: (value: number) => void;
}

const INITIAL_SIZE = 60;
const EXPANDED_HEIGHT = 300;
const EXPANDED_WIDTH = 90;
const MIN_RATE = 1; // per second
const MAX_RATE = 20; // per second

export const RapidCounterInput: React.FC<RapidCounterInputProps> = ({
  metric,
  value,
  onValueChange,
}) => {
  const minRate = metric.minRate ?? MIN_RATE;
  const maxRate = metric.maxRate ?? MAX_RATE;
  
  const [isExpanded, setIsExpanded] = useState(false);
  const [currentRate, setCurrentRate] = useState((minRate + maxRate) / 2);
  const [isActive, setIsActive] = useState(false);
  
  const expandAnim = useRef(new Animated.Value(INITIAL_SIZE)).current;
  const widthAnim = useRef(new Animated.Value(INITIAL_SIZE)).current;
  const borderRadiusAnim = useRef(new Animated.Value(INITIAL_SIZE / 2)).current;
  const ratePosition = useRef(new Animated.Value(0.5)).current; // 0 = bottom (min rate), 1 = top (max rate)
  const ratePositionRef = useRef(0.5); // Track current position value
  
  const incrementTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<View>(null);
  const containerLayout = useRef({ x: 0, y: 0, width: 0, height: 0 });

  // Calculate rate based on position (0 = minRate, 1 = maxRate)
  const getRateFromPosition = useCallback((position: number) => {
    const clamped = Math.max(0, Math.min(1, position));
    return minRate + (maxRate - minRate) * clamped;
  }, [minRate, maxRate]);

  // Track current value with ref to avoid stale closures
  const valueRef = useRef(value);
  useEffect(() => {
    valueRef.current = value;
  }, [value]);

  // Stop incrementing
  const stopIncrementing = useCallback(() => {
    if (incrementTimeoutRef.current) {
      clearTimeout(incrementTimeoutRef.current);
      incrementTimeoutRef.current = null;
    }
    setIsActive(false);
  }, []);

  // Increment function with haptic feedback
  const increment = useCallback(() => {
    const currentValue = valueRef.current;
    const newValue = currentValue + 1;
    
    // Check max limit
    if (metric.max && newValue > metric.max) {
      stopIncrementing();
      return;
    }
    
    onValueChange(newValue);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, [metric.max, onValueChange, stopIncrementing]);

  // Start incrementing at the current rate
  const startIncrementing = useCallback(() => {
    if (incrementTimeoutRef.current) return;
    
    setIsActive(true);
    
    const scheduleNext = () => {
      if (!incrementTimeoutRef.current) return; // Check if still active
      
      const currentPosition = ratePositionRef.current;
      const rate = getRateFromPosition(currentPosition);
      setCurrentRate(rate);
      
      const intervalMs = Math.max(16, 1000 / rate); // Minimum 16ms for smooth updates
      
      incrementTimeoutRef.current = setTimeout(() => {
        increment();
        if (incrementTimeoutRef.current) { // Continue if still active
          scheduleNext();
        }
      }, intervalMs);
    };
    
    scheduleNext();
  }, [getRateFromPosition, increment]);

  // Expand animation
  const expand = useCallback(() => {
    setIsExpanded(true);
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

  // Pan responder for dragging
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (evt) => {
        containerRef.current?.measure((x, y, width, height, pageX, pageY) => {
          containerLayout.current = { x: pageX, y: pageY, width, height };
        });
        
        if (!isExpanded) {
          expand();
        }
        startIncrementing();
      },
      onPanResponderMove: (evt, gestureState) => {
        if (isExpanded && containerLayout.current.height > 0) {
          const touchY = evt.nativeEvent.pageY;
          const containerTop = containerLayout.current.y;
          const relativeY = touchY - containerTop;
          
          // Calculate position (0 = bottom/min rate, 1 = top/max rate)
          const position = 1 - (relativeY / containerLayout.current.height);
          const clampedPosition = Math.max(0, Math.min(1, position));
          
          ratePositionRef.current = clampedPosition;
          ratePosition.setValue(clampedPosition);
          const newRate = getRateFromPosition(clampedPosition);
          setCurrentRate(newRate);
        }
      },
      onPanResponderRelease: () => {
        stopIncrementing();
        collapse();
      },
      onPanResponderTerminate: () => {
        stopIncrementing();
        collapse();
      },
    })
  ).current;

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopIncrementing();
    };
  }, [stopIncrementing]);

  const indicatorPosition = ratePosition.interpolate({
    inputRange: [0, 1],
    outputRange: [EXPANDED_HEIGHT - 15, 15],
  });

  const indicatorOpacity = ratePosition.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0.4, 0.7, 1],
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
        <View
          ref={containerRef}
          style={styles.rapidCounterWrapper}
        >
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
                {/* Rate indicator */}
                <Animated.View
                  style={[
                    styles.rateIndicator,
                    {
                      top: indicatorPosition,
                      opacity: indicatorOpacity,
                    },
                  ]}
                >
                  <View style={styles.rateDot} />
                </Animated.View>
                
                {/* Rate display */}
                <View style={styles.rateDisplay}>
                  <Text style={styles.rateText}>{currentRate.toFixed(1)}/s</Text>
                </View>
              </View>
            ) : (
              <View style={styles.collapsedContent}>
                <Text style={styles.plusText}>+</Text>
              </View>
            )}
          </Animated.View>
        </View>
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
  rapidCounterWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  rapidCounterContainer: {
    backgroundColor: '#ff6600',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
    position: 'relative',
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
  },
  rateIndicator: {
    position: 'absolute',
    left: '50%',
    marginLeft: -8,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.5,
    shadowRadius: 4,
    elevation: 5,
    zIndex: 10,
  },
  rateDot: {
    width: '100%',
    height: '100%',
    borderRadius: 8,
    backgroundColor: '#fff',
  },
  rateDisplay: {
    position: 'absolute',
    top: 8,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 5,
  },
  rateText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#fff',
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
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
