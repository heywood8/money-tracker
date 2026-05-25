import React, { useEffect, useRef } from 'react';
import { View, Animated, StyleSheet } from 'react-native';
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

const OperationsListPlaceholder = ({ colors }) => {
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

  const opacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.35, 0.75] });
  const barStyle = { backgroundColor: colors.border };

  return (
    <View style={styles.groupContainer}>
      {/* Date separator placeholder */}
      <View style={styles.separatorRow}>
        <Animated.View style={[styles.dateBar, barStyle, { opacity }]} />
        <Animated.View style={[styles.totalBar, barStyle, { opacity }]} />
      </View>

      {/* Operations card */}
      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        {ROW_WIDTHS.map((widths, index) => (
          <View key={index}>
            <View style={styles.row}>
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

            {index < ROW_WIDTHS.length - 1 && (
              <View style={[styles.separator, { backgroundColor: colors.border }]} />
            )}
          </View>
        ))}
      </View>
    </View>
  );
};

OperationsListPlaceholder.propTypes = {
  colors: PropTypes.shape({
    border: PropTypes.string.isRequired,
    surface: PropTypes.string.isRequired,
  }).isRequired,
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
    borderRadius: 11,
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
