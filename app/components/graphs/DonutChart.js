import React, { useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import { Pie, PolarChart } from 'victory-native';
import Icon from '@expo/vector-icons/MaterialCommunityIcons';
import PropTypes from 'prop-types';

// Victory Native fills its container, so the container size doubles as the
// donut diameter and as the coordinate space for the icon overlay below.
export const CHART_SIZE = 140;
export const CENTER = CHART_SIZE / 2;
// Donut hole as a fraction of the outer radius. Mirrors the old hand-rolled
// ring (inner edge 35 / outer edge 61 ≈ 0.57) closely enough to read the same.
export const INNER_RADIUS_RATIO = 0.6;
export const INNER_RADIUS = `${INNER_RADIUS_RATIO * 100}%`;
// Icons sit on the middle of the donut band.
export const ICON_RADIUS = CENTER * ((1 + INNER_RADIUS_RATIO) / 2);
export const ICON_THRESHOLD = 0.1;
export const ICON_SIZE = 14;

// Map the shared slice shape ({ amount, color, icon }) onto the keys Victory
// Native's Pie expects. `label` only needs to be unique per slice — the legend
// renders category names itself — so we derive it from the icon + index.
export const mapPieData = (data) =>
  data.map((item, index) => ({
    label: `${item.icon ?? 'slice'}-${index}`,
    value: item.amount,
    color: item.color,
  }));

// Victory Native draws pie slices starting at 12 o'clock and sweeping clockwise
// (d3-shape convention). We mirror that here to lay MaterialCommunityIcons
// glyphs over each slice, since VN has no vector-icon slice label.
export const computeIconMarkers = (data) => {
  const total = data.reduce((sum, item) => sum + item.amount, 0);
  if (total === 0) return [];

  let cumulative = 0;
  return data.map((item) => {
    const fraction = item.amount / total;
    const midAngle = (cumulative + fraction / 2) * 2 * Math.PI;
    const marker = {
      color: item.color,
      icon: item.icon,
      showIcon: fraction >= ICON_THRESHOLD && !!item.icon,
      x: CENTER + ICON_RADIUS * Math.sin(midAngle),
      y: CENTER - ICON_RADIUS * Math.cos(midAngle),
    };
    cumulative += fraction;
    return marker;
  });
};

const DonutChart = ({ data }) => {
  const pieData = useMemo(() => mapPieData(data), [data]);
  const markers = useMemo(() => computeIconMarkers(data), [data]);

  return (
    <View testID="donut-chart" style={styles.container} accessibilityRole="image">
      <PolarChart data={pieData} labelKey="label" valueKey="value" colorKey="color">
        <Pie.Chart innerRadius={INNER_RADIUS} />
      </PolarChart>
      {markers
        .filter((marker) => marker.showIcon)
        .map((marker, i) => (
          <View
            key={i}
            testID={`icon-${marker.icon}`}
            pointerEvents="none"
            style={[
              styles.iconWrapper,
              {
                left: marker.x - ICON_SIZE / 2,
                top: marker.y - ICON_SIZE / 2,
              },
            ]}
          >
            <Icon name={marker.icon} size={ICON_SIZE} color="#fff" />
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
    height: CHART_SIZE,
    width: CHART_SIZE,
  },
  iconWrapper: {
    position: 'absolute',
  },
});

export default DonutChart;
