import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated, Dimensions } from 'react-native';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
// Calculate diagonal distance to cover entire screen from any corner
const MAX_RADIUS = Math.sqrt(SCREEN_WIDTH * SCREEN_WIDTH + SCREEN_HEIGHT * SCREEN_HEIGHT);

export default function ThemeWaveTransition({ isAnimating, color, origin, onComplete }) {
  const scaleAnim = useRef(new Animated.Value(0)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (isAnimating) {
      // Reset animations
      scaleAnim.setValue(0);
      opacityAnim.setValue(1);

      // Start the wave animation
      Animated.parallel([
        Animated.timing(scaleAnim, {
          toValue: 1,
          duration: 600,
          useNativeDriver: true,
        }),
        Animated.timing(opacityAnim, {
          toValue: 0,
          duration: 600,
          delay: 300, // Start fading out halfway through
          useNativeDriver: true,
        }),
      ]).start(() => {
        if (onComplete) {
          onComplete();
        }
      });
    }
  }, [isAnimating, scaleAnim, opacityAnim, onComplete]);

  if (!isAnimating) {
    return null;
  }

  // Default origin to center if not provided
  const animOrigin = origin || { x: SCREEN_WIDTH / 2, y: SCREEN_HEIGHT / 2 };

  return (
    <View style={styles.container} pointerEvents="none">
      <Animated.View
        style={[
          styles.wave,
          {
            backgroundColor: color,
            opacity: opacityAnim,
            width: MAX_RADIUS * 2,
            height: MAX_RADIUS * 2,
            borderRadius: MAX_RADIUS,
            left: animOrigin.x,
            top: animOrigin.y,
            transform: [
              { translateX: -MAX_RADIUS },
              { translateY: -MAX_RADIUS },
              { scale: scaleAnim },
            ],
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 9999,
    elevation: 9999,
  },
  wave: {
    position: 'absolute',
  },
});
