import { useCallback, useMemo } from 'react';
import { Dimensions } from 'react-native';
import { Gesture } from 'react-native-gesture-handler';
import {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  runOnJS,
  Easing,
} from 'react-native-reanimated';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const ENTER_DURATION = 260;
const EXIT_DURATION = 220;
const ENTER_EASING = Easing.out(Easing.cubic);
const EXIT_EASING = Easing.in(Easing.cubic);

/**
 * useSwipeDismiss — Telegram-style interactive swipe-to-dismiss for a panel that
 * slides over another view.
 *
 * The panel's horizontal offset (`translateX`) is driven three ways:
 *   • open()    — slide in from the right edge (offset width → 0).
 *   • dismiss() — slide out to the right edge, then run `onDismiss` (used by the
 *                 back arrow / hardware-back).
 *   • gesture   — a rightward pan drags the panel with the finger; releasing past
 *                 the distance/velocity threshold completes the dismissal,
 *                 otherwise it springs back to rest.
 *
 * Only rightward movement is honoured (offset is clamped at 0) and vertical
 * movement yields to scrollables via `failOffsetY`, so lists inside the panel
 * keep scrolling normally.
 *
 * @param {object}   options
 * @param {Function} options.onDismiss  Called once the panel has slid fully away.
 * @param {boolean}  [options.enabled=true]  Disables the gesture (e.g. mid-operation).
 * @param {number}   [options.width=SCREEN_WIDTH]  Distance the panel travels off-screen.
 * @returns {{ gesture: object, animatedStyle: object, open: () => void, dismiss: () => void }}
 */
export function useSwipeDismiss({ onDismiss, enabled = true, width = SCREEN_WIDTH }) {
  // 0 = panel fully open, `width` = panel fully off the right edge.
  const translateX = useSharedValue(0);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  const open = useCallback(() => {
    translateX.value = width;
    translateX.value = withTiming(0, { duration: ENTER_DURATION, easing: ENTER_EASING });
  }, [translateX, width]);

  const dismiss = useCallback(() => {
    translateX.value = withTiming(
      width,
      { duration: EXIT_DURATION, easing: EXIT_EASING },
      (finished) => {
        if (finished && onDismiss) {
          runOnJS(onDismiss)();
        }
      },
    );
  }, [translateX, width, onDismiss]);

  const gesture = useMemo(() => {
    const DISTANCE_THRESHOLD = width * 0.32;
    const VELOCITY_THRESHOLD = 800;
    return Gesture.Pan()
      .enabled(enabled)
      // Only a rightward drag (>16px) activates; vertical drags fail so inner
      // scroll views / lists keep working.
      .activeOffsetX(16)
      .failOffsetY([-18, 18])
      .onUpdate((event) => {
        'worklet';
        translateX.value = Math.max(0, event.translationX);
      })
      .onEnd((event) => {
        'worklet';
        const shouldDismiss =
          event.translationX > DISTANCE_THRESHOLD || event.velocityX > VELOCITY_THRESHOLD;
        if (shouldDismiss) {
          translateX.value = withTiming(
            width,
            { duration: EXIT_DURATION, easing: EXIT_EASING },
            (finished) => {
              if (finished && onDismiss) {
                runOnJS(onDismiss)();
              }
            },
          );
        } else {
          translateX.value = withTiming(0, { duration: EXIT_DURATION, easing: ENTER_EASING });
        }
      });
  }, [translateX, width, enabled, onDismiss]);

  return { gesture, animatedStyle, open, dismiss };
}

export default useSwipeDismiss;
