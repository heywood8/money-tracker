import { useCallback } from 'react';
import {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  interpolate,
  Extrapolation,
  runOnJS,
  Easing,
} from 'react-native-reanimated';

/**
 * useBackShrink — Telegram-style predictive "back" shrink for panels.
 *
 * Reproduces the animation Telegram plays when you start the Android back
 * gesture: the current panel scales down, anchored to its BOTTOM-RIGHT corner,
 * is pulled slightly inward, and its corners round off — revealing whatever
 * sits behind it.
 *
 * The hook exposes a single `progress` shared value (0 = panel at rest, 1 =
 * fully shrunk away) plus an `animatedStyle` that maps that progress onto the
 * shrink transform. How `progress` is driven is up to the caller:
 *
 *   • Today (RN 0.81) the Android system back only reports on RELEASE via
 *     `BackHandler` / `Modal.onRequestClose`, so panels call `commit(onClose)`
 *     to play the shrink as a close animation and then dismiss.
 *
 *   • Later, a native predictive-back source (an `OnBackAnimationCallback`
 *     bridged to JS) can drive the gesture LIVE by calling `setProgress(p)` as
 *     the finger moves, then `commit(onClose)` on release or `cancel()` if the
 *     gesture is abandoned. No panel code has to change when that lands.
 *
 * Usage:
 *
 *   const { animatedStyle, originStyle, commit, reset } = useBackShrink();
 *   // when (re)opening the panel:        reset();
 *   // on back press/gesture release:     commit(closePanel);
 *   // wrap the panel container:
 *   <Animated.View style={[styles.panel, originStyle, animatedStyle]}>…</Animated.View>
 *
 * `Animated` must be the component from `react-native-reanimated`.
 *
 * @param {object}  [options]
 * @param {number}  [options.minScale=0.92]        Scale at full progress.
 * @param {number}  [options.translateX=22]        Inward pull (px) at full progress.
 * @param {number}  [options.translateY=0]         Vertical pull (px) at full progress.
 * @param {number}  [options.borderRadius=28]      Corner radius at full progress.
 * @param {number}  [options.baseBorderRadius=0]   Corner radius at rest.
 * @param {number}  [options.fade=0.12]            Opacity reduction at full progress (0..1).
 * @param {number}  [options.commitDuration=240]   ms for the close (progress→1) animation.
 * @param {number}  [options.cancelDuration=180]   ms for the cancel (progress→0) animation.
 * @param {string}  [options.origin='right bottom'] transform-origin anchor.
 * @returns {{
 *   progress: object,
 *   animatedStyle: object,
 *   originStyle: object,
 *   reset: () => void,
 *   setProgress: (value: number) => void,
 *   cancel: () => void,
 *   commit: (onDone?: () => void) => void,
 * }}
 */
export function useBackShrink(options = {}) {
  const {
    minScale = 0.92,
    translateX = 22,
    translateY = 0,
    borderRadius = 28,
    baseBorderRadius = 0,
    fade = 0.12,
    commitDuration = 240,
    cancelDuration = 180,
    origin = 'right bottom',
  } = options;

  // 0 = panel at rest, 1 = fully shrunk (dismissing).
  const progress = useSharedValue(0);

  const animatedStyle = useAnimatedStyle(() => {
    const p = progress.value;
    return {
      opacity: interpolate(p, [0, 1], [1, 1 - fade], Extrapolation.CLAMP),
      borderRadius: interpolate(p, [0, 1], [baseBorderRadius, borderRadius], Extrapolation.CLAMP),
      transform: [
        { translateX: interpolate(p, [0, 1], [0, translateX], Extrapolation.CLAMP) },
        { translateY: interpolate(p, [0, 1], [0, translateY], Extrapolation.CLAMP) },
        { scale: interpolate(p, [0, 1], [1, minScale], Extrapolation.CLAMP) },
      ],
    };
  });

  // transform-origin is constant, so it lives in a plain (non-animated) style
  // the caller merges into the same view as `animatedStyle`.
  const originStyle = { transformOrigin: origin };

  // Snap back to rest with no animation — call when (re)opening a panel so a
  // previous commit doesn't leave it shrunk.
  const reset = useCallback(() => {
    progress.value = 0;
  }, [progress]);

  // Drive progress directly (0..1). Intended for a native predictive-back
  // progress source feeding the live gesture.
  const setProgress = useCallback((value) => {
    progress.value = value;
  }, [progress]);

  // Ease back to rest — the back gesture was cancelled.
  const cancel = useCallback(() => {
    progress.value = withTiming(0, {
      duration: cancelDuration,
      easing: Easing.out(Easing.cubic),
    });
  }, [progress, cancelDuration]);

  // Play the shrink to completion, then run `onDone` (typically the real close).
  const commit = useCallback((onDone) => {
    progress.value = withTiming(
      1,
      { duration: commitDuration, easing: Easing.in(Easing.cubic) },
      (finished) => {
        if (finished && onDone) {
          runOnJS(onDone)();
        }
      },
    );
  }, [progress, commitDuration]);

  return { progress, animatedStyle, originStyle, reset, setProgress, cancel, commit };
}

export default useBackShrink;
