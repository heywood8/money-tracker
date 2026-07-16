import React, { memo, useEffect, useRef, useCallback } from 'react';
import { View, Text, TouchableOpacity, Animated, StyleSheet } from 'react-native';
import PropTypes from 'prop-types';
import { MaterialCommunityIcons as Icon } from '@expo/vector-icons';
import {
  SPACING,
  FONT_SIZE,
  DURATION,
  ICON_SIZE,
  BORDER_RADIUS,
} from '../../styles/designTokens';

/**
 * UndoSnackbar
 *
 * A transient "just-added" snackbar. It is rendered by OperationsScreen as a
 * floating overlay pinned just above the tab bar — deliberately OUTSIDE the
 * operations SectionList. Rendering it inline inside a virtualized list cell
 * used to fight `getItemLayout` + `removeClippedSubviews`: the cell's reported
 * height never accounted for the bar, so the clipping pass would slice it off a
 * few frames after mount (see PENNY-16 for the crash the inline approach also
 * caused). As a floating sibling of the list it is immune to virtualization.
 *
 * A thin progress bar depletes over `duration`, giving the user a clear visual
 * cue for how much time remains.
 *
 * Lifecycle is intentionally split so the exit animation always plays:
 *  - `onUndo(operationId)` performs the undo (called before the fade-out).
 *  - `onClosed(operationId)` tells the parent to unmount, and fires only after
 *    the exit animation completes (whether dismissed by timeout or Undo tap).
 *
 * Mount this conditionally with a changing `key` (e.g. an incrementing token)
 * so each new operation restarts the entry animation and countdown cleanly.
 */
// Shared with OperationsScreen's fallback cleanup: a belt-and-suspenders timer
// that clears the parent's undo state even if this component's exit animation
// never completes its callback.
export const UNDO_DURATION_MS = 5000;

const UndoSnackbar = ({
  operationId,
  message,
  actionLabel,
  // Must be an ES6 default, not defaultProps: React 19 removed defaultProps for
  // function components, so an omitted `duration` would arrive as undefined and
  // collapse the visible window to a couple of frames (setTimeout(fn, undefined)
  // fires on the next tick; Animated.timing falls back to its own 500ms).
  duration = UNDO_DURATION_MS,
  colors,
  onUndo,
  onClosed,
}) => {
  // Entry polish only: 0 = rested 6px low, 1 = risen into place.
  const entryAnim = useRef(new Animated.Value(0)).current;
  // Exit fade: starts fully opaque so the bar is visible from its first frame.
  const exitAnim = useRef(new Animated.Value(1)).current;
  // 1 = full countdown bar, 0 = depleted
  const progressAnim = useRef(new Animated.Value(1)).current;
  // Guards against a double dismiss (e.g. timeout firing right as Undo is tapped)
  const closingRef = useRef(false);

  const animateOut = useCallback((beforeClosed) => {
    if (closingRef.current) return;
    closingRef.current = true;
    if (beforeClosed) beforeClosed();
    Animated.timing(exitAnim, {
      toValue: 0,
      duration: DURATION.fast,
      useNativeDriver: true,
    }).start(() => {
      // The id lets the parent ignore a stale close from a previous bar that
      // finishes fading after a newer operation's bar has already replaced it.
      onClosed(operationId);
    });
  }, [exitAnim, onClosed, operationId]);

  useEffect(() => {
    // Entry: gentle rise into the row's reserved slot.
    Animated.timing(entryAnim, {
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
    // Perform the undo first (so it's immediate), then fade the bar away.
    animateOut(() => onUndo(operationId));
  }, [animateOut, onUndo, operationId]);

  // Subtle rise into place; the slot height is reserved immediately (transforms
  // don't affect layout), so the row above never jumps.
  const translateY = entryAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [6, 0],
  });

  return (
    <Animated.View
      testID="undo-snackbar"
      style={[
        styles.container,
        {
          backgroundColor: colors.altRow || colors.surface,
          borderColor: colors.border,
          opacity: exitAnim,
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
  container: {
    borderRadius: BORDER_RADIUS.lg,
    borderWidth: StyleSheet.hairlineWidth,
    elevation: 6,
    // Clip the depleting progress fill to the rounded bounds.
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
  },
  content: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: SPACING.sm,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
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
    altRow: PropTypes.string,
  }).isRequired,
  onUndo: PropTypes.func.isRequired,
  onClosed: PropTypes.func.isRequired,
};

export default memo(UndoSnackbar);
