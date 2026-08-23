import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Animated, StyleSheet, useWindowDimensions } from 'react-native';
import PropTypes from 'prop-types';
import { SPACING, BORDER_RADIUS, HEIGHTS } from '../../styles/designTokens';

// Pre-defined widths so every row looks distinct from its neighbours
const ROW_WIDTHS = [
  { title: '65%', subtitle: '45%', amount: 52 },
  { title: '80%', subtitle: '55%', amount: 44 },
  { title: '55%', subtitle: '40%', amount: 60 },
  { title: '70%', subtitle: '50%', amount: 48 },
  { title: '60%', subtitle: '35%', amount: 56 },
  { title: '75%', subtitle: '48%', amount: 42 },
  { title: '50%', subtitle: '42%', amount: 50 },
  { title: '68%', subtitle: '52%', amount: 58 },
  { title: '73%', subtitle: '38%', amount: 46 },
  { title: '58%', subtitle: '45%', amount: 54 },
];

// How many rows each day-card holds, cycled through as groups are appended. A
// real list is a run of short days rather than one long card, so the skeleton
// repeats the separator+card unit instead of growing a single card downwards.
const GROUP_SIZES = [4, 6, 3, 5, 2];

// ── Geometry, kept in sync with the styles below ──────────────────────────────
// Used only to decide HOW MANY rows to draw; the views themselves are still laid
// out by flexbox, so a few pixels of drift here cost nothing but a spare row.
const ROW_HEIGHT = HEIGHTS.listItem;                        // row minHeight wins over its content
const ROW_SEPARATOR_HEIGHT = 1;
const DATE_ROW_HEIGHT = SPACING.lg + 8 + SPACING.xs;        // paddingTop + bar + paddingBottom
const GROUP_MARGIN = SPACING.sm;

// The offset the placeholder measures is driven by the QuickAdd panel's own
// collapse/expand animation, which sweeps through every intermediate height. The
// available space is therefore rounded UP to this quantum before it is stored,
// so a sweep changes the row count two or three times rather than on every
// frame — the same reason the screen keeps the panel's measured height in a ref
// instead of state. Rounding up means the quantisation only ever over-draws.
const FILL_QUANTUM = 4 * HEIGHTS.listItem;

// Backstop for an absurd measurement (a window height that never resolves, a
// future tall-display form factor): 12 groups is already several screens.
const MAX_GROUPS = 12;

const groupHeight = (rows) => (
  DATE_ROW_HEIGHT + rows * ROW_HEIGHT + (rows - 1) * ROW_SEPARATOR_HEIGHT + GROUP_MARGIN
);

// Day-card sizes that together cover `availableHeight`. The last group is
// allowed to overshoot — a card clipped by the screen edge reads as "the list
// continues", which is exactly what is about to happen.
const buildGroups = (availableHeight) => {
  const groups = [];
  let used = 0;
  while (used < availableHeight && groups.length < MAX_GROUPS) {
    const rows = GROUP_SIZES[groups.length % GROUP_SIZES.length];
    groups.push(rows);
    used += groupHeight(rows);
  }
  return groups;
};

// Hoisted so the object identity is stable across renders.
const ACCESSIBILITY_BUSY = { busy: true };

const OperationsListPlaceholder = ({ colors, t }) => {
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 750, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 750, useNativeDriver: true }),
      ]),
    );
    anim.start();
    return () => anim.stop();
  }, [pulse]);

  const { height: windowHeight } = useWindowDimensions();

  // Start by assuming the placeholder owns the whole window, then trim to what
  // it actually got once laid out. The skeleton used to draw a fixed ten rows,
  // which filled the screen only because the QuickAdd panel was pinned above it
  // and ate the top half; with the panel hidden in settings (or collapsed for
  // search) those ten rows stopped halfway down and the rest of the screen sat
  // blank. Over-drawing first and shrinking after keeps it full in both cases —
  // the rows dropped by the trim are the ones already below the fold.
  const [availableHeight, setAvailableHeight] = useState(windowHeight);

  const handleLayout = useCallback((event) => {
    // `y` is the placeholder's offset inside the list's content container, i.e.
    // the height of whatever header is currently above it.
    const remaining = windowHeight - event.nativeEvent.layout.y;
    if (remaining <= 0) return;
    const quantised = Math.ceil(remaining / FILL_QUANTUM) * FILL_QUANTUM;
    setAvailableHeight((prev) => (prev === quantised ? prev : quantised));
  }, [windowHeight]);

  const groups = useMemo(() => buildGroups(availableHeight), [availableHeight]);

  const opacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.35, 0.75] });
  const barStyle = { backgroundColor: colors.border };

  // Widths advance across the whole skeleton rather than restarting per group,
  // so two adjacent cards never draw the same run of bars.
  let widthCursor = 0;

  return (
    // The bars carry no information, so they are collapsed into a single node
    // for TalkBack: without this the reader walks 30-odd nameless views. The
    // busy state is what a screen reader user actually needs to hear here.
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={t('loading_operations')}
      accessibilityState={ACCESSIBILITY_BUSY}
      testID="operations-list-placeholder"
      onLayout={handleLayout}
    >
      {groups.map((rowCount, groupIndex) => (
        <View key={groupIndex} style={styles.groupContainer} testID="operations-placeholder-group">
          {/* Date separator placeholder */}
          <View style={styles.separatorRow}>
            <Animated.View style={[styles.dateBar, barStyle, { opacity }]} />
            <Animated.View style={[styles.totalBar, barStyle, { opacity }]} />
          </View>

          {/* Operations card */}
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            {Array.from({ length: rowCount }, (_, index) => {
              const widths = ROW_WIDTHS[widthCursor++ % ROW_WIDTHS.length];
              return (
                <View key={index}>
                  <View style={styles.row} testID="operations-placeholder-row">
                    {/* Icon circle */}
                    <Animated.View style={[styles.iconCircle, barStyle, { opacity }]} />

                    {/* Title + subtitle */}
                    <View style={styles.textContainer}>
                      <Animated.View
                        style={[styles.titleBar, barStyle, { opacity, width: widths.title }]}
                      />
                      <Animated.View
                        style={[styles.subtitleBar, barStyle, { opacity, width: widths.subtitle }]}
                      />
                    </View>

                    {/* Amount */}
                    <Animated.View
                      style={[styles.amountBar, barStyle, { opacity, width: widths.amount }]}
                    />
                  </View>

                  {index < rowCount - 1 && (
                    <View style={[styles.separator, { backgroundColor: colors.border }]} />
                  )}
                </View>
              );
            })}
          </View>
        </View>
      ))}
    </View>
  );
};

OperationsListPlaceholder.propTypes = {
  colors: PropTypes.shape({
    border: PropTypes.string.isRequired,
    surface: PropTypes.string.isRequired,
  }).isRequired,
  t: PropTypes.func.isRequired,
};

const BAR_RADIUS = BORDER_RADIUS.sm;

const styles = StyleSheet.create({
  amountBar: {
    borderRadius: BAR_RADIUS,
    height: 10,
    marginLeft: SPACING.md,
  },
  card: {
    borderRadius: BORDER_RADIUS.lg,
    borderWidth: 1,
    marginHorizontal: SPACING.lg,
    overflow: 'hidden',
  },
  dateBar: {
    borderRadius: BAR_RADIUS,
    height: 8,
    width: 64,
  },
  groupContainer: {
    marginBottom: SPACING.sm,
  },
  iconCircle: {
    borderRadius: BORDER_RADIUS.pill,
    height: 22,
    marginRight: SPACING.md,
    width: 22,
  },
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    minHeight: HEIGHTS.listItem,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
  },
  separator: {
    height: 1,
    marginLeft: SPACING.lg + 22 + SPACING.md,
  },
  separatorRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingBottom: SPACING.xs,
    paddingHorizontal: SPACING.lg + SPACING.sm,
    paddingTop: SPACING.lg,
  },
  subtitleBar: {
    borderRadius: BAR_RADIUS,
    height: 8,
    marginTop: 4,
  },
  textContainer: {
    flex: 1,
    justifyContent: 'center',
    minWidth: 0,
  },
  titleBar: {
    borderRadius: BAR_RADIUS,
    height: 10,
  },
  totalBar: {
    borderRadius: BAR_RADIUS,
    height: 8,
    width: 52,
  },
});

export default OperationsListPlaceholder;
