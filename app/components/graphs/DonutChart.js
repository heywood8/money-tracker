import React, { useMemo, useCallback, useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, withDelay, interpolate, Easing } from 'react-native-reanimated';
import { Pie, PolarChart } from 'victory-native';
import { LinearGradient, vec } from '@shopify/react-native-skia';
import Icon from '@expo/vector-icons/MaterialCommunityIcons';
import PropTypes from 'prop-types';
import { inkOn } from '../../styles/chartPalette';

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

// Victory Native draws pie slices in Skia's angular convention: 0° points at
// 3 o'clock (the +x axis) and angles grow clockwise, since screen y grows
// downwards. The slice geometry VN hands to the render function below uses that
// same convention (see computeSliceGradient, which feeds startAngle/endAngle
// straight into cos/sin), so the icon overlay has to share it — laying the
// markers out from 12 o'clock instead rotates every glyph a quarter turn off
// its slice. We mirror the sweep here because VN has no vector-icon slice label.
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
      x: CENTER + ICON_RADIUS * Math.cos(midAngle),
      y: CENTER + ICON_RADIUS * Math.sin(midAngle),
    };
    cumulative += fraction;
    return marker;
  });
};

// Gradient endpoints for a slice: start halfway out along its leading edge, end at
// the outer rim of its midline. Exported for unit testing — the render function it
// feeds runs inside the Skia canvas and is not reachable from the test tree.
export const computeSliceGradient = (slice) => {
  const { radius, startAngle, endAngle, center } = slice;
  const midAngle = (startAngle + endAngle) / 2;
  const startRad = (Math.PI / 180) * startAngle;
  const midRad = (Math.PI / 180) * midAngle;
  return {
    start: {
      x: center.x + radius * 0.5 * Math.cos(startRad),
      y: center.y + radius * 0.5 * Math.sin(startRad),
    },
    end: {
      x: center.x + radius * Math.cos(midRad),
      y: center.y + radius * Math.sin(midRad),
    },
  };
};

// Slice fill fades towards the rim (`CC` is the hex alpha suffix, 80%). Kept
// shallow on purpose: a deeper fade drifts the slice away from the solid swatch
// the legend shows for the same category, which is the one thing tying a slice
// to its name.
const SLICE_FADE_ALPHA = 'CC';
const INSET_WIDTH = 2;

// The donut spins up into place rather than snapping in. Victory Native has no
// entering animation for Pie.Chart, and its `startAngle` is a plain prop — driving
// it per frame would re-render the chart on the JS thread. Animating the container
// instead keeps the whole thing on the UI thread for the cost of one transform.
export const INTRO_DURATION = 460;
export const INTRO_SCALE_FROM = 0.86;
export const INTRO_ROTATION_FROM = -14;

const DonutChart = ({ data, insetColor, introKey = 0, introDelay = 0 }) => {
  const pieData = useMemo(() => mapPieData(data), [data]);
  const markers = useMemo(() => computeIconMarkers(data), [data]);
  const intro = useSharedValue(0);

  // Replays whenever introKey changes — the screen bumps it as a tab opens, so
  // the donut animates when it becomes visible, not when it silently mounts
  // behind a collapsed panel. introDelay holds it back until the chart it is
  // replacing has faded out, so the spin-up is never played to an empty seat.
  useEffect(() => {
    intro.value = 0;
    intro.value = withDelay(
      introDelay,
      withTiming(1, { duration: INTRO_DURATION, easing: Easing.out(Easing.cubic) }),
    );
  }, [introKey, introDelay, intro]);

  const introStyle = useAnimatedStyle(() => ({
    opacity: intro.value,
    transform: [
      { scale: interpolate(intro.value, [0, 1], [INTRO_SCALE_FROM, 1]) },
      { rotate: `${interpolate(intro.value, [0, 1], [INTRO_ROTATION_FROM, 0])}deg` },
    ],
  }));

  const renderSlice = useCallback(({ slice }) => {
    const { start, end } = computeSliceGradient(slice);
    return (
      <>
        <Pie.Slice>
          <LinearGradient
            start={vec(start.x, start.y)}
            end={vec(end.x, end.y)}
            colors={[slice.color, `${slice.color}${SLICE_FADE_ALPHA}`]}
            positions={[0, 1]}
          />
        </Pie.Slice>
        {insetColor ? (
          <Pie.SliceAngularInset
            angularInset={{ angularStrokeWidth: INSET_WIDTH, angularStrokeColor: insetColor }}
          />
        ) : null}
      </>
    );
  }, [insetColor]);

  return (
    <Animated.View testID="donut-chart" style={[styles.container, introStyle]} accessibilityRole="image">
      <PolarChart data={pieData} labelKey="label" valueKey="value" colorKey="color">
        <Pie.Chart innerRadius={INNER_RADIUS}>
          {renderSlice}
        </Pie.Chart>
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
            {/* Ink follows the slice: white on the yellow slot measures ~1.4:1,
                which is not a readable glyph. */}
            <Icon name={marker.icon} size={ICON_SIZE} color={inkOn(marker.color)} />
          </View>
        ))}
    </Animated.View>
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
  // Colour of the hairline drawn between slices; omit to draw none.
  insetColor: PropTypes.string,
  // Bump to replay the intro animation (e.g. when the owning tab is opened).
  introKey: PropTypes.number,
  // Milliseconds to hold the intro back, so it starts once the outgoing chart
  // has left rather than on top of it.
  introDelay: PropTypes.number,
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
