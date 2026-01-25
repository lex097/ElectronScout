// components/RapidCounterInput.tsx
import { Metric } from '@/config/gameConfig';
import * as Haptics from 'expo-haptics';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, PanResponder, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

interface RapidCounterInputProps {
  metric: Metric;
  value: number;
  onValueChange: (value: number) => void;
  onExpandedChange?: (isExpanded: boolean) => void;
  onExpand?: (y: number, height: number) => void;
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
  onExpandedChange,
  onExpand,
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
  const incrementTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startYRef = useRef(0);
  const isExpandedRef = useRef(false);
  const containerRef = useRef<View>(null);
  const containerLayout = useRef({ x: 0, y: 0, width: 0, height: 0 });
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasExpandedRef = useRef(false);
  const activationIdRef = useRef(0); // Unique ID for each activation to prevent stale callbacks
  
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

  // Track state update scheduling
  const stateUpdateTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastIncrementTimeRef = useRef(0);
  const animationFrameRef = useRef<number | null>(null);
  
  // Flush pending value to React state (throttled)
  const flushValueToState = useCallback(() => {
    if (stateUpdateTimeoutRef.current) return; // Already scheduled
    
    stateUpdateTimeoutRef.current = setTimeout(() => {
      stateUpdateTimeoutRef.current = null;
      onValueChange(valueRef.current);
    }, 50); // Update React state at most every 50ms
  }, [onValueChange]);
  
  // Use requestAnimationFrame-based loop for smoother, more consistent timing
  const runIncrementLoop = useCallback((activationId: number) => {
    if (!isActiveRef.current || activationId !== activationIdRef.current) {
      return;
    }
    
    const now = performance.now();
    const rate = currentRateRef.current;
    const intervalMs = 1000 / rate;
    
    // Check if enough time has passed for an increment
    if (now - lastIncrementTimeRef.current >= intervalMs) {
      const currentValue = valueRef.current;
      const newValue = currentValue + 1;
      
      if (!metric.max || newValue <= metric.max) {
        // Fire haptic FIRST - highest priority
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
        
        // Update internal ref
        valueRef.current = newValue;
        lastIncrementTimeRef.current = now;
        
        // Throttle React state updates
        flushValueToState();
      } else {
        // Hit max, stop
        isActiveRef.current = false;
        onValueChange(valueRef.current);
        return;
      }
    }
    
    // Schedule next frame
    animationFrameRef.current = requestAnimationFrame(() => runIncrementLoop(activationId));
  }, [metric.max, onValueChange, flushValueToState]);
  
  // Start the increment loop
  const startIncrementLoop = useCallback((activationId: number) => {
    lastIncrementTimeRef.current = performance.now();
    isActiveRef.current = true;
    runIncrementLoop(activationId);
  }, [runIncrementLoop]);

  // Stop the increment loop and flush final value
  const stopIncrementLoop = useCallback(() => {
    isActiveRef.current = false;
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    if (incrementTimeoutRef.current) {
      clearTimeout(incrementTimeoutRef.current);
      incrementTimeoutRef.current = null;
    }
    if (stateUpdateTimeoutRef.current) {
      clearTimeout(stateUpdateTimeoutRef.current);
      stateUpdateTimeoutRef.current = null;
    }
    // Flush final value immediately
    onValueChange(valueRef.current);
  }, [onValueChange]);

  // Create pan responder
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onStartShouldSetPanResponderCapture: () => true,
      onMoveShouldSetPanResponderCapture: () => true,
      onPanResponderTerminationRequest: () => false, // Don't allow other components to take over
      onShouldBlockNativeResponder: () => true, // Block native scroll when active
      onPanResponderGrant: (evt, gestureState) => {
        // Increment activation ID - this invalidates any callbacks from previous activations
        activationIdRef.current += 1;
        const currentActivationId = activationIdRef.current;
        
        hasExpandedRef.current = false;
        
        // Clear any pending long press timer from previous activation
        if (longPressTimerRef.current) {
          clearTimeout(longPressTimerRef.current);
          longPressTimerRef.current = null;
        }
        
        // Stop any running animations from previous activation
        expandAnim.stopAnimation();
        widthAnim.stopAnimation();
        borderRadiusAnim.stopAnimation();
        
        // Reset to collapsed state immediately if there was a previous activation
        expandAnim.setValue(INITIAL_SIZE);
        widthAnim.setValue(INITIAL_SIZE);
        borderRadiusAnim.setValue(INITIAL_SIZE / 2);
        setIsExpanded(false);
        onExpandedChange?.(false); // Notify parent to re-enable scrolling
        
        // Clear any running loops/timeouts from previous activation
        if (animationFrameRef.current) {
          cancelAnimationFrame(animationFrameRef.current);
          animationFrameRef.current = null;
        }
        if (incrementTimeoutRef.current) {
          clearTimeout(incrementTimeoutRef.current);
          incrementTimeoutRef.current = null;
        }
        if (stateUpdateTimeoutRef.current) {
          clearTimeout(stateUpdateTimeoutRef.current);
          stateUpdateTimeoutRef.current = null;
        }
        isActiveRef.current = false;
        
        // Measure container position
        containerRef.current?.measure((x: number, y: number, width: number, height: number, pageX: number, pageY: number) => {
          containerLayout.current = { x: pageX, y: pageY, width, height: EXPANDED_HEIGHT };
          startYRef.current = evt.nativeEvent.pageY;
        });
        
        // Start long press timer (0.15 seconds)
        longPressTimerRef.current = setTimeout(() => {
          // Check if this activation is still valid
          if (currentActivationId !== activationIdRef.current) {
            return; // Stale activation, ignore
          }
          // Long press detected - expand panel
          hasExpandedRef.current = true;
          
          // Initial haptic feedback when expanding
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
          
          // Set default initial rate and indicator SYNCHRONOUSLY (before async measure)
          // This ensures we always have valid values even if measure fails
          const defaultRate = (minRate + maxRate) / 2;
          currentRateRef.current = defaultRate;
          setDisplayRate(defaultRate);
          indicatorPositionAnim.setValue(0.5);
          
          // Measure IMMEDIATELY before animation starts to get current position
          // The panel expands from its top, so pageY stays the same
          containerRef.current?.measure((x: number, y: number, width: number, height: number, pageX: number, pageY: number) => {
            // Only use measurements if they're valid (pageY can be 0 if at top of screen, that's ok)
            if (typeof pageY === 'number' && typeof pageX === 'number' && !isNaN(pageY) && !isNaN(pageX)) {
              containerLayout.current = { x: pageX, y: pageY, width, height: EXPANDED_HEIGHT };
              
              // Calculate initial indicator position based on where finger currently is
              // startYRef.current has the finger's screen position from onPanResponderGrant
              const fingerY = startYRef.current;
              const relativeY = fingerY - pageY;
              const normalizedPosition = relativeY / EXPANDED_HEIGHT;
              const clampedPosition = Math.max(0, Math.min(1, 1 - normalizedPosition));
              
              // Set initial rate and indicator based on finger position
              const initialRate = minRate + (maxRate - minRate) * clampedPosition;
              currentRateRef.current = initialRate;
              setDisplayRate(initialRate);
              indicatorPositionAnim.setValue(clampedPosition);
              
              // Notify parent to scroll IMMEDIATELY - don't wait for animation
              // The panel will expand to EXPANDED_HEIGHT from the current pageY
              if (onExpand) {
                onExpand(pageY, EXPANDED_HEIGHT);
              }
            }
          });
          
          // Expand
          setIsExpanded(true);
          isExpandedRef.current = true;
          onExpandedChange?.(true);
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
          ]).start(() => {
            // Check if this activation is still valid before re-measuring
            if (currentActivationId !== activationIdRef.current) {
              return;
            }
            // Re-measure after expansion animation completes for accurate dragging
            containerRef.current?.measure((x: number, y: number, width: number, height: number, pageX: number, pageY: number) => {
              containerLayout.current = { x: pageX, y: pageY, width, height: EXPANDED_HEIGHT };
            });
          });
          
          // Start incrementing with precise setTimeout-based timing
          isActiveRef.current = true;
          
          // Clear any existing timeout
          if (incrementTimeoutRef.current) {
            clearTimeout(incrementTimeoutRef.current);
          }
          
          // Schedule first increment
          startIncrementLoop(currentActivationId);
        }, 150); // 0.15 seconds = 150ms
      },
      onPanResponderMove: (evt, gestureState) => {
        // Only handle movement if panel has expanded (long press occurred)
        if (!hasExpandedRef.current) {
          return;
        }
        
        // ALWAYS re-measure container position on every move event
        // This is crucial because scrolling changes the panel's screen position
        containerRef.current?.measure((x: number, y: number, width: number, height: number, pageX: number, pageY: number) => {
          // Accept pageY >= 0 (0 is valid if at top of screen), just check it's a real number
          if (typeof pageY === 'number' && !isNaN(pageY) && typeof pageX === 'number' && !isNaN(pageX)) {
            containerLayout.current = { x: pageX, y: pageY, width, height: EXPANDED_HEIGHT };
          }
        });
        
        // Use absolute touch position relative to container
        const touchY = evt.nativeEvent.pageY;
        const containerTop = containerLayout.current.y;
        const containerHeight = EXPANDED_HEIGHT;
        
        // Accept containerTop >= 0 (0 is valid if at top of screen)
        if (typeof containerTop === 'number' && !isNaN(containerTop) && containerHeight > 0) {
          // Calculate relative position within container (0 = top, 1 = bottom)
          const relativeY = touchY - containerTop;
          const normalizedPosition = relativeY / containerHeight;
          
          // Invert: 0 = bottom (min rate), 1 = top (max rate)
          const position = 1 - normalizedPosition;
          const clampedPosition = Math.max(0, Math.min(1, position));
          
          const newRate = minRate + (maxRate - minRate) * clampedPosition;
          currentRateRef.current = newRate;
          setDisplayRate(newRate);
          indicatorPositionAnim.setValue(clampedPosition);
        } else {
          // Fallback: use dy relative to start position
          // dy is negative when moving up, positive when moving down
          // Start at 0.5 (middle), subtract normalized dy
          const dy = gestureState.dy;
          const position = 0.5 - (dy / EXPANDED_HEIGHT);
          const clampedPosition = Math.max(0, Math.min(1, position));
          
          const newRate = minRate + (maxRate - minRate) * clampedPosition;
          currentRateRef.current = newRate;
          setDisplayRate(newRate);
          indicatorPositionAnim.setValue(clampedPosition);
        }
      },
      onPanResponderRelease: () => {
        // Capture current activation ID for callback validation
        const releaseActivationId = activationIdRef.current;
        
        // Clear long press timer if it hasn't fired yet
        if (longPressTimerRef.current) {
          clearTimeout(longPressTimerRef.current);
          longPressTimerRef.current = null;
        }
        
        // If panel didn't expand (quick press), just increment by 1
        if (!hasExpandedRef.current) {
          const currentValue = valueRef.current;
          const newValue = currentValue + 1;
          if (!metric.max || newValue <= metric.max) {
            onValueChange(newValue);
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
          }
          return;
        }
        
        // Panel was expanded, so collapse it
        isActiveRef.current = false;
        if (animationFrameRef.current) {
          cancelAnimationFrame(animationFrameRef.current);
          animationFrameRef.current = null;
        }
        if (incrementTimeoutRef.current) {
          clearTimeout(incrementTimeoutRef.current);
          incrementTimeoutRef.current = null;
        }
        if (stateUpdateTimeoutRef.current) {
          clearTimeout(stateUpdateTimeoutRef.current);
          stateUpdateTimeoutRef.current = null;
        }
        // Flush final value immediately
        onValueChange(valueRef.current);
        
        // Collapse - set state IMMEDIATELY, don't wait for animation
        isExpandedRef.current = false;
        hasExpandedRef.current = false;
        setIsExpanded(false); // Hide rate display immediately
        onExpandedChange?.(false); // Re-enable scrolling immediately
        
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
        ]).start();
      },
      onPanResponderTerminate: () => {
        // Clear long press timer if it hasn't fired yet
        if (longPressTimerRef.current) {
          clearTimeout(longPressTimerRef.current);
          longPressTimerRef.current = null;
        }
        
        // If panel didn't expand (quick press), just increment by 1
        if (!hasExpandedRef.current) {
          const currentValue = valueRef.current;
          const newValue = currentValue + 1;
          if (!metric.max || newValue <= metric.max) {
            onValueChange(newValue);
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
          }
          return;
        }
        
        isActiveRef.current = false;
        if (animationFrameRef.current) {
          cancelAnimationFrame(animationFrameRef.current);
          animationFrameRef.current = null;
        }
        if (incrementTimeoutRef.current) {
          clearTimeout(incrementTimeoutRef.current);
          incrementTimeoutRef.current = null;
        }
        if (stateUpdateTimeoutRef.current) {
          clearTimeout(stateUpdateTimeoutRef.current);
          stateUpdateTimeoutRef.current = null;
        }
        // Flush final value immediately
        onValueChange(valueRef.current);
        
        // Collapse - set state IMMEDIATELY, don't wait for animation
        isExpandedRef.current = false;
        hasExpandedRef.current = false;
        setIsExpanded(false); // Hide rate display immediately
        onExpandedChange?.(false); // Re-enable scrolling immediately
        
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
        ]).start();
      },
    })
  ).current;

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      if (incrementTimeoutRef.current) {
        clearTimeout(incrementTimeoutRef.current);
      }
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
      }
      if (stateUpdateTimeoutRef.current) {
        clearTimeout(stateUpdateTimeoutRef.current);
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
          ref={containerRef}
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

      <Text style={styles.hintLabel}>Hold the + for rapid input, slide up/down to adjust rate</Text>

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
  hintLabel: {
    fontSize: 11,
    color: '#888',
    marginTop: 6,
    fontStyle: 'italic',
  },
});
