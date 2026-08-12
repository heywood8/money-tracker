import React, { useCallback, useEffect, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { ScrollView, StyleSheet, TouchableOpacity } from 'react-native';
import { Text } from 'react-native-paper';
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import {
  BORDER_RADIUS,
  FONT_SIZE,
  FONT_WEIGHT,
  HORIZONTAL_PADDING,
  SPACING,
} from '../../styles/designTokens';
import { withAlpha } from '../../utils/colorUtils';

// Telegram-style chip strip naming the notification-processing pages.
//
// The highlight is a single pill that interpolates between the measured chip
// rectangles off the pager's `progress`, rather than a per-chip background
// toggled by the active index: a swipe moves the pages continuously, and a
// highlight that jumped at the halfway point would be the one part of the
// gesture not following the finger.

const TabChip = React.memo(function TabChip({ color, index, label, onLayout, onSelect, selected, testID }) {
  const handleLayout = useCallback((event) => onLayout(index, event), [index, onLayout]);
  const handlePress = useCallback(() => onSelect(index), [index, onSelect]);

  return (
    <TouchableOpacity
      accessibilityLabel={label}
      accessibilityRole="tab"
      accessibilityState={{ selected }}
      onLayout={handleLayout}
      onPress={handlePress}
      style={styles.chip}
      testID={testID}
    >
      <Text
        numberOfLines={1}
        style={[styles.chipText, selected && styles.chipTextSelected, { color }]}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
});

TabChip.propTypes = {
  color: PropTypes.string.isRequired,
  index: PropTypes.number.isRequired,
  label: PropTypes.string.isRequired,
  onLayout: PropTypes.func.isRequired,
  onSelect: PropTypes.func.isRequired,
  selected: PropTypes.bool,
  testID: PropTypes.string,
};

export default function NotificationTabBar({ colors, index, onSelect, progress, tabs }) {
  const scrollRef = useRef(null);
  // Chip rectangles, kept twice on purpose: the shared copy drives the pill on
  // the UI thread, the JS copy answers "where do I scroll to?" when the active
  // chip sits off-screen.
  const layouts = useSharedValue([]);
  const layoutsRef = useRef([]);
  // Both measurements are state rather than refs so the scroll-into-view effect
  // below re-runs when the strip is laid out again (rotation, split screen) and
  // not only when the tab changes. `measured` counts real changes, so the chips'
  // initial layout pass settles in one render instead of four.
  const [measured, setMeasured] = useState(0);
  const [viewport, setViewport] = useState(0);

  const handleChipLayout = useCallback((i, event) => {
    const { width, x } = event.nativeEvent.layout;
    const previous = layoutsRef.current[i];
    if (previous && previous.width === width && previous.x === x) return;
    const next = layoutsRef.current.slice();
    next[i] = { width, x };
    layoutsRef.current = next;
    layouts.value = next;
    setMeasured((count) => count + 1);
  }, [layouts]);

  const handleViewportLayout = useCallback((event) => {
    const { width } = event.nativeEvent.layout;
    setViewport((prev) => (width === prev ? prev : width));
  }, []);

  // Keep the active chip in view — with four chips the last one can sit past the
  // right edge on a narrow screen, and a highlight you cannot see is not one.
  useEffect(() => {
    const layout = layoutsRef.current[index];
    if (!layout || !viewport) return;
    const target = layout.x + layout.width / 2 - viewport / 2;
    scrollRef.current?.scrollTo({ animated: true, x: Math.max(0, target) });
  }, [index, measured, viewport]);

  const pillStyle = useAnimatedStyle(() => {
    const rects = layouts.value;
    if (!rects.length) return { opacity: 0 };
    const clamped = Math.min(Math.max(progress.value, 0), rects.length - 1);
    const lower = rects[Math.floor(clamped)];
    const upper = rects[Math.ceil(clamped)];
    if (!lower || !upper) return { opacity: 0 };
    const fraction = clamped - Math.floor(clamped);
    return {
      opacity: 1,
      transform: [{ translateX: lower.x + (upper.x - lower.x) * fraction }],
      width: lower.width + (upper.width - lower.width) * fraction,
    };
  });

  return (
    <ScrollView
      contentContainerStyle={styles.row}
      horizontal
      onLayout={handleViewportLayout}
      ref={scrollRef}
      showsHorizontalScrollIndicator={false}
      style={styles.strip}
      testID="notification-tab-bar"
    >
      <Animated.View
        pointerEvents="none"
        style={[styles.pill, { backgroundColor: withAlpha(colors.primary, 0.16) }, pillStyle]}
      />
      {tabs.map((tab, i) => (
        <TabChip
          color={i === index ? colors.primary : colors.mutedText}
          index={i}
          key={tab.key}
          label={tab.label}
          onLayout={handleChipLayout}
          onSelect={onSelect}
          selected={i === index}
          testID={`notification-tab-${tab.key}`}
        />
      ))}
    </ScrollView>
  );
}

NotificationTabBar.propTypes = {
  colors: PropTypes.shape({
    mutedText: PropTypes.string,
    primary: PropTypes.string,
  }).isRequired,
  // Index of the settled tab — drives the chip colouring and the auto-scroll.
  index: PropTypes.number.isRequired,
  onSelect: PropTypes.func.isRequired,
  // Reanimated shared value holding the pager's fractional position.
  progress: PropTypes.object.isRequired,
  tabs: PropTypes.arrayOf(PropTypes.shape({
    key: PropTypes.string.isRequired,
    label: PropTypes.string.isRequired,
  })).isRequired,
};

const styles = StyleSheet.create({
  chip: {
    alignItems: 'center',
    borderRadius: BORDER_RADIUS.pill,
    justifyContent: 'center',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
  },
  chipText: {
    fontSize: FONT_SIZE.md,
    fontWeight: FONT_WEIGHT.medium,
  },
  chipTextSelected: {
    fontWeight: FONT_WEIGHT.bold,
  },
  pill: {
    borderRadius: BORDER_RADIUS.pill,
    bottom: 0,
    left: 0,
    position: 'absolute',
    top: 0,
  },
  row: {
    alignItems: 'center',
    gap: SPACING.xs,
    paddingHorizontal: HORIZONTAL_PADDING,
  },
  strip: {
    flexGrow: 0,
  },
});
