import { useCallback, useEffect, useMemo } from 'react';
import { useWindowDimensions } from 'react-native';
import { Gesture } from 'react-native-gesture-handler';
import {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  runOnJS,
  Easing,
} from 'react-native-reanimated';

const ENTER_DURATION = 260;
const EXIT_DURATION = 220;
const ENTER_EASING = Easing.out(Easing.cubic);
const EXIT_EASING = Easing.in(Easing.cubic);
const ACTIVE_OFFSET_X = 16;

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
 * keep scrolling normally. The translation is rebased at activation so the panel
 * tracks the finger from 0 instead of snapping by the `activeOffsetX` slop.
 *
 * @param {object}   options
 * @param {Function} options.onDismiss  Called once the panel has slid fully away.
 * @param {Function} [options.onStepBack]  Called instead of onDismiss when the panel
 *   has a parent step (canStepBack). Navigates one level up; the surface springs
 *   back to rest rather than sliding off, so the parent step's content takes over.
 * @param {boolean}  [options.canStepBack=false]  When true, a completed swipe steps
 *   one level up (onStepBack) instead of dismissing the whole panel.
 * @param {boolean}  [options.enabled=true]  Gates the gesture (e.g. mid-operation).
 *   Read from a shared value inside the worklets so toggling it never rebuilds
 *   the native recognizer (which would jitter an in-flight gesture).
 * @param {number}   [options.width]  Distance the panel travels off-screen.
 *   Defaults to the live window width (updates on rotation / resize).
 * @param {number}   [options.edgeWidth=0]  When > 0, only swipes that BEGIN within
 *   this many px of the left edge dismiss. Use for panels that embed their own
 *   horizontal gestures (e.g. a drag-to-reorder list) so a body drag can't be
 *   stolen by the dismiss gesture. 0 = the whole surface is swipeable.
 * @returns {{ gesture: object, animatedStyle: object, open: () => void, dismiss: () => void }}
 */
export function useSwipeDismiss({ onDismiss, onStepBack, canStepBack = false, enabled = true, width: widthProp, edgeWidth = 0 } = {}) {
  const { width: windowWidth } = useWindowDimensions();
  const width = widthProp ?? windowWidth;

  // 0 = panel fully open, `width` = panel fully off the right edge.
  const translateX = useSharedValue(0);
  // Translation captured at activation; subtracted so the panel tracks the
  // finger from 0 rather than jumping by the activation slop (activeOffsetX).
  const dragStart = useSharedValue(0);
  // Whether the active gesture is a valid dismiss (enabled, not mid-dismiss, and
  // — when edgeWidth is set — started within the left edge region).
  const valid = useSharedValue(false);
  // Guards against overlapping dismiss animations / a double onDismiss.
  const dismissing = useSharedValue(false);
  // Read inside worklets so flipping `enabled` doesn't rebuild the recognizer.
  const enabledShared = useSharedValue(enabled);
  useEffect(() => {
    enabledShared.value = enabled;
  }, [enabled, enabledShared]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  const open = useCallback(() => {
    dismissing.value = false;
    translateX.value = width;
    translateX.value = withTiming(0, { duration: ENTER_DURATION, easing: ENTER_EASING });
  }, [translateX, dismissing, width]);

  const dismiss = useCallback(() => {
    if (dismissing.value) return;
    dismissing.value = true;
    translateX.value = withTiming(
      width,
      { duration: EXIT_DURATION, easing: EXIT_EASING },
      (finished) => {
        if (finished && onDismiss) {
          runOnJS(onDismiss)();
        }
      },
    );
  }, [translateX, dismissing, width, onDismiss]);

  const gesture = useMemo(() => {
    const DISTANCE_THRESHOLD = width * 0.32;
    const VELOCITY_THRESHOLD = 800;
    return Gesture.Pan()
      // Only a rightward drag (>16px) activates; vertical drags fail so inner
      // scroll views / lists keep working.
      .activeOffsetX(ACTIVE_OFFSET_X)
      .failOffsetY([-18, 18])
      .onStart((event) => {
        'worklet';
        dragStart.value = event.translationX;
        // start x = current location − distance travelled since touch-down.
        const startX = event.x - event.translationX;
        valid.value =
          enabledShared.value &&
          !dismissing.value &&
          (edgeWidth <= 0 || startX <= edgeWidth);
      })
      .onUpdate((event) => {
        'worklet';
        if (!valid.value) return;
        // For a step-back the parent lives INSIDE this panel (a nested step or an
        // embedded screen level), so dragging the whole overlay would wrongly
        // reveal the layer beneath it (the main settings list). Recognize the
        // swipe but leave the overlay in place; the inner level plays its own
        // transition when we trigger the step-back on release.
        if (canStepBack) return;
        translateX.value = Math.max(0, event.translationX - dragStart.value);
      })
      .onEnd((event) => {
        'worklet';
        if (!valid.value) return;
        const dx = event.translationX - dragStart.value;
        const past = dx > DISTANCE_THRESHOLD || event.velocityX > VELOCITY_THRESHOLD;
        if (past && canStepBack) {
          // Go one level up within the panel; the overlay never moved, so there is
          // nothing to spring back — the inner level animates itself.
          if (onStepBack) runOnJS(onStepBack)();
        } else if (past) {
          // Reuse dismiss() so the completion + re-entrancy guard live in one place.
          runOnJS(dismiss)();
        } else {
          translateX.value = withTiming(0, { duration: EXIT_DURATION, easing: ENTER_EASING });
        }
      });
  }, [translateX, dragStart, valid, dismissing, enabledShared, width, edgeWidth, dismiss, canStepBack, onStepBack]);

  return { gesture, animatedStyle, open, dismiss };
}

export default useSwipeDismiss;
