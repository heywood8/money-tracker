import React from 'react';
import { Image, StyleSheet, View } from 'react-native';
import PropTypes from 'prop-types';
import Animated, { useAnimatedProps, useDerivedValue } from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';
import { BRAND } from '../../styles/semanticColors';
import {
  ARM_CORE_WIDTH,
  ARM_INK_WIDTH,
  ARM_VIEWBOX,
  armPathD,
} from './pennyArm';

const AnimatedPath = Animated.createAnimatedComponent(Path);

/** The mark with the right arm removed and the navy disc made transparent. */
const BODY = require('../../../assets/penny-body.png');

/**
 * Penny, with an arm that can move.
 *
 * Draw order is the whole trick: the arm's stroke goes down first and the body
 * on top of it, so the stroke's base stays hidden under the coin however far
 * the arm swings. The disc the body is missing is the `BRAND.surface` its host
 * paints, so the two together are the mark exactly as the native splash drew
 * it.
 *
 * `raise` and `wave` are shared values, not numbers: this runs while the JS
 * thread is blocked on the first database reads, so the path is rebuilt from
 * them on the UI thread and nothing about the motion waits on a render.
 */
const PennyMark = ({ size, raise, wave }) => {
  const d = useDerivedValue(() => armPathD(raise.value, wave.value));
  const armProps = useAnimatedProps(() => ({ d: d.value }));

  return (
    <View style={[styles.mark, { height: size, width: size }]} pointerEvents="none">
      <Svg
        style={StyleSheet.absoluteFill}
        width={size}
        height={size}
        viewBox={`0 0 ${ARM_VIEWBOX} ${ARM_VIEWBOX}`}
      >
        <AnimatedPath
          animatedProps={armProps}
          fill="none"
          stroke={BRAND.ink}
          strokeWidth={ARM_INK_WIDTH}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <AnimatedPath
          animatedProps={armProps}
          fill="none"
          stroke={BRAND.limb}
          strokeWidth={ARM_CORE_WIDTH}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </Svg>
      <Image
        source={BODY}
        style={[styles.body, { height: size, width: size }]}
        resizeMode="contain"
        accessibilityIgnoresInvertColors
      />
    </View>
  );
};

const sharedValue = PropTypes.shape({ value: PropTypes.number });

PennyMark.propTypes = {
  size: PropTypes.number.isRequired,
  raise: sharedValue.isRequired,
  wave: sharedValue.isRequired,
};

const styles = StyleSheet.create({
  body: {
    left: 0,
    position: 'absolute',
    top: 0,
  },
  mark: {
    position: 'relative',
  },
});

export default PennyMark;
