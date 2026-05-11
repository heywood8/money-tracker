import React, { useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { MaterialCommunityIcons as Icon } from '@expo/vector-icons';
import PropTypes from 'prop-types';

export const SVG_SIZE = 140;
export const RADIUS = 48;
export const STROKE_WIDTH = 26;
export const CENTER = SVG_SIZE / 2;
export const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
export const ICON_THRESHOLD = 0.10;
export const ICON_SIZE = 14;

export const computeSegments = (data) => {
  const total = data.reduce((sum, item) => sum + item.amount, 0);
  if (total === 0) return [];

  let cumulative = 0;
  return data.map((item) => {
    const fraction = item.amount / total;
    const arcLength = fraction * CIRCUMFERENCE;
    const midAngle = (cumulative + arcLength / 2) / RADIUS;
    const seg = {
      color: item.color,
      icon: item.icon,
      arcLength,
      dashOffset: cumulative === 0 ? 0 : -cumulative,
      showIcon: fraction >= ICON_THRESHOLD && !!item.icon,
      iconX: CENTER + RADIUS * Math.sin(midAngle),
      iconY: CENTER - RADIUS * Math.cos(midAngle),
    };
    cumulative += arcLength;
    return seg;
  });
};

const DonutChart = ({ data }) => {
  const segments = useMemo(() => computeSegments(data), [data]);

  return (
    <View testID="donut-chart" style={styles.container}>
      <Svg width={SVG_SIZE} height={SVG_SIZE}>
        {segments.map((seg, i) => (
          <Circle
            key={i}
            cx={CENTER}
            cy={CENTER}
            r={RADIUS}
            fill="none"
            stroke={seg.color}
            strokeWidth={STROKE_WIDTH}
            strokeDasharray={`${seg.arcLength} ${CIRCUMFERENCE - seg.arcLength}`}
            strokeDashoffset={seg.dashOffset}
            rotation={-90}
            origin={`${CENTER}, ${CENTER}`}
          />
        ))}
      </Svg>
      {segments
        .filter((seg) => seg.showIcon)
        .map((seg, i) => (
          <View
            key={i}
            style={[
              styles.iconWrapper,
              {
                left: seg.iconX - ICON_SIZE / 2,
                top: seg.iconY - ICON_SIZE / 2,
              },
            ]}
          >
            <Icon name={seg.icon} size={ICON_SIZE} color="#fff" />
          </View>
        ))}
    </View>
  );
};

DonutChart.propTypes = {
  data: PropTypes.arrayOf(
    PropTypes.shape({
      amount: PropTypes.number.isRequired,
      color: PropTypes.string.isRequired,
      icon: PropTypes.string,
    }),
  ).isRequired,
};

const styles = StyleSheet.create({
  container: {
    height: SVG_SIZE,
    width: SVG_SIZE,
  },
  iconWrapper: {
    position: 'absolute',
  },
});

export default DonutChart;
