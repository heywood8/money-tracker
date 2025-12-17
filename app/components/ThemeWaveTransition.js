import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated } from 'react-native';

export default function ThemeWaveTransition({ isAnimating, color, onComplete }) {
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (isAnimating) {
      // Reset animation
      fadeAnim.setValue(0);

      // Fade in, then fade out
      Animated.sequence([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 250,
          useNativeDriver: true,
        }),
        Animated.timing(fadeAnim, {
          toValue: 0,
          duration: 250,
          useNativeDriver: true,
        }),
      ]).start(() => {
        if (onComplete) {
          onComplete();
        }
      });
    }
  }, [isAnimating, fadeAnim, onComplete]);

  if (!isAnimating) {
    return null;
  }

  return (
    <View style={styles.container} pointerEvents="none">
      <Animated.View
        style={[
          styles.overlay,
          {
            backgroundColor: color,
            opacity: fadeAnim,
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
  overlay: {
    ...StyleSheet.absoluteFillObject,
  },
});
