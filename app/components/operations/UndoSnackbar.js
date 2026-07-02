import React, { memo, useEffect, useRef, useCallback } from 'react';
import { View, Text, TouchableOpacity, Animated, StyleSheet } from 'react-native';
import PropTypes from 'prop-types';
import { MaterialCommunityIcons as Icon } from '@expo/vector-icons';
import {
  SPACING,
  FONT_SIZE,
  BORDER_RADIUS,
  DURATION,
  ICON_SIZE,
  ELEVATION,
  Z_INDEX,
} from '../../styles/designTokens';

/**
 * UndoSnackbar
 *
 * A transient "just-added" bar that floats above the tab bar and offers a brief
 * window to undo the last created operation. A thin progress bar depletes over
 * `duration`, giving the user a clear visual cue for how much time remains.
 *
 * Lifecycle is intentionally split so the exit animation always plays:
 *  - `onUndo(operationId)` performs the undo (called before the slide-out).
 *  - `onClosed()` tells the parent to unmount, and fires only after the exit
 *    animation completes (whether dismissed by timeout or by the Undo tap).
 *
 * Mount this conditionally with a changing `key` (e.g. an incrementing token)
 * so each new operation restarts the entry animation and countdown cleanly.
 */
const UndoSnackbar = ({
  operationId,
  message,
  actionLabel,
  duration,
  colors,
  bottomOffset,
  onUndo,
  onClosed,
}) => {
  // 0 = hidden (slid down + transparent), 1 = fully shown
  const revealAnim = useRef(new Animated.Value(0)).current;
  // 1 = full countdown bar, 0 = depleted
  const progressAnim = useRef(new Animated.Value(1)).current;
  // Guards against a double dismiss (e.g. timeout firing right as Undo is tapped)
  const closingRef = useRef(false);

  const animateOut = useCallback((beforeClosed) => {
    if (closingRef.current) return;
    closingRef.current = true;
    if (beforeClosed) beforeClosed();
    Animated.timing(revealAnim, {
      toValue: 0,
      duration: DURATION.fast,
      useNativeDriver: true,
    }).start(() => {
      onClosed();
    });
  }, [revealAnim, onClosed]);

  useEffect(() => {
    // Entry: slide up + fade in.
    Animated.timing(revealAnim, {
      toValue: 1,
      duration: DURATION.normal,
      useNativeDriver: true,
    }).start();

    // Countdown: deplete the progress bar across the full visible window. Driven
    // with a left-anchored scaleX so it can run on the native thread (see the
    // `transformOrigin` in styles.progressFill) rather than churning JS state.
    Animated.timing(progressAnim, {
      toValue: 0,
      duration,
      useNativeDriver: true,
    }).start();

    // Auto-dismiss once the window elapses.
    const timer = setTimeout(() => animateOut(), duration);
    return () => clearTimeout(timer);
    // Intentionally runs once per mount; a changing `key` handles new operations.
  }, []);

  const handleUndoPress = useCallback(() => {
    // Perform the undo first (so it's immediate), then slide the bar away.
    animateOut(() => onUndo(operationId));
  }, [animateOut, onUndo, operationId]);

  const translateY = revealAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [40, 0],
  });

  return (
    <View
      pointerEvents="box-none"
      style={[styles.wrapper, { bottom: bottomOffset }]}
    >
      <Animated.View
        style={[
          styles.card,
          {
            backgroundColor: colors.surface,
            borderColor: colors.border,
            opacity: revealAnim,
            transform: [{ translateY }],
          },
        ]}
      >
        <View style={styles.content}>
          <Icon
            name="check-circle"
            size={ICON_SIZE.md}
            color={colors.primary}
          />
          <Text style={[styles.message, { color: colors.text }]} numberOfLines={1}>
            {message}
          </Text>
          <TouchableOpacity
            onPress={handleUndoPress}
            style={styles.actionButton}
            accessibilityRole="button"
            accessibilityLabel={actionLabel}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Icon name="undo-variant" size={ICON_SIZE.sm} color={colors.primary} />
            <Text style={[styles.actionText, { color: colors.primary }]}>
              {actionLabel}
            </Text>
          </TouchableOpacity>
        </View>
        <View style={[styles.progressTrack, { backgroundColor: colors.border }]}>
          <Animated.View
            style={[
              styles.progressFill,
              { backgroundColor: colors.primary, transform: [{ scaleX: progressAnim }] },
            ]}
          />
        </View>
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  actionButton: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: SPACING.xs,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
  },
  actionText: {
    fontSize: FONT_SIZE.md,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  card: {
    borderRadius: BORDER_RADIUS.lg,
    borderWidth: 1,
    overflow: 'hidden',
    width: '92%',
    ...ELEVATION.high,
  },
  content: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: SPACING.sm,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
  },
  message: {
    flex: 1,
    fontSize: FONT_SIZE.md,
    fontWeight: '500',
  },
  progressFill: {
    height: 3,
    // Anchor the scaleX countdown to the left edge so it depletes rightward.
    transformOrigin: 'left',
    width: '100%',
  },
  progressTrack: {
    height: 3,
    width: '100%',
  },
  wrapper: {
    alignItems: 'center',
    left: 0,
    position: 'absolute',
    right: 0,
    zIndex: Z_INDEX.toast,
  },
});

UndoSnackbar.propTypes = {
  operationId: PropTypes.string.isRequired,
  message: PropTypes.string.isRequired,
  actionLabel: PropTypes.string.isRequired,
  duration: PropTypes.number,
  colors: PropTypes.shape({
    surface: PropTypes.string.isRequired,
    border: PropTypes.string.isRequired,
    primary: PropTypes.string.isRequired,
    text: PropTypes.string.isRequired,
  }).isRequired,
  bottomOffset: PropTypes.number,
  onUndo: PropTypes.func.isRequired,
  onClosed: PropTypes.func.isRequired,
};

UndoSnackbar.defaultProps = {
  duration: 5000,
  bottomOffset: 140,
};

export default memo(UndoSnackbar);
