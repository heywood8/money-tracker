import { useCallback, useEffect, useMemo, useState } from 'react';
import { Gesture } from 'react-native-gesture-handler';
import {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  runOnJS,
  Easing,
} from 'react-native-reanimated';

// Distance (px) of downward pull that fully reveals the search pill. Kept short
// so a *light* flick brings it in well before the native pull-to-refresh reaches
// its (much larger) trigger distance.
const REVEAL_DISTANCE = 72;
// Releasing past this fraction of REVEAL_DISTANCE commits the reveal; below it,
// the pill snaps back to hidden. The same threshold applies to the reverse
// (swipe-up) direction, so a light upward flick dismisses it.
const COMMIT_RATIO = 0.45;
// The list counts as "at the top" (where a downward pull should reveal rather
// than scroll) within this many px of offset 0.
const TOP_EPSILON = 4;
const SHOW_DURATION = 220;
const HIDE_DURATION = 180;
const SHOW_EASING = Easing.out(Easing.cubic);
const HIDE_EASING = Easing.in(Easing.cubic);

/**
 * usePullToRevealSearch — a hidden-by-default search pill that the user pulls
 * into view with a light downward swipe at the top of the list, and dismisses
 * with a light swipe back up.
 *
 * The reveal is driven by a Pan gesture that runs *simultaneously* with the
 * list's native scroll (composed on the list side via `Gesture.Native()`), so
 * scrolling and native pull-to-refresh keep working: only a pull that BEGINS at
 * the very top engages the reveal, and it commits well short of the refresh
 * threshold.
 *
 * `pinned` forces the pill visible and disables the pull (e.g. while the full
 * search is open or filters are active) — this is the "…unless there are active
 * filters" half of the behaviour.
 *
 * @param {object}  options
 * @param {boolean} options.pinned  Keep the pill shown and ignore pull gestures.
 * @returns {{
 *   revealPanGesture: object,       // pass to OperationsList (composed with its native scroll)
 *   pillAnimatedStyle: object,      // apply to the floating search container
 *   pillShown: boolean,             // whether the pill occupies layout (drives the list's top inset)
 *   setPeeked: (v: boolean) => void,// force the pulled-open state (e.g. reset on search close)
 *   setScrollY: (y: number) => void,// feed the list's scroll offset (from onScroll)
 *   setRevealHeight: (h: number) => void, // report the measured pill height (from onLayout)
 * }}
 */
export default function usePullToRevealSearch({ pinned }) {
  // 0 = pill fully hidden (translated up + transparent), 1 = fully shown.
  const revealProgress = useSharedValue(pinned ? 1 : 0);
  // Whether the pill was pulled into view. Only meaningful while not pinned.
  const [peeked, setPeeked] = useState(false);

  // Mirrors read by the gesture worklets on the UI thread.
  const scrollYShared = useSharedValue(0);
  const pinnedShared = useSharedValue(pinned);
  const revealHeight = useSharedValue(48);
  // Per-gesture bookkeeping captured on start.
  const startedAtTop = useSharedValue(false);
  const startProgress = useSharedValue(0);

  useEffect(() => {
    pinnedShared.value = pinned;
  }, [pinned, pinnedShared]);

  // Settle the pill to its resting state whenever the inputs change: pinned
  // (search open / filters active) or a committed peek shows it; otherwise hide.
  useEffect(() => {
    if (pinned || peeked) {
      revealProgress.value = withTiming(1, { duration: SHOW_DURATION, easing: SHOW_EASING });
    } else {
      revealProgress.value = withTiming(0, { duration: HIDE_DURATION, easing: HIDE_EASING });
    }
  }, [pinned, peeked, revealProgress]);

  const commitPeek = useCallback((next) => {
    setPeeked(next);
  }, []);

  const revealPanGesture = useMemo(() => Gesture.Pan()
    // Engage on a vertical drag; hand horizontal drags back to the tab-swipe.
    .activeOffsetY([-14, 14])
    .failOffsetX([-18, 18])
    .onStart(() => {
      'worklet';
      startedAtTop.value = scrollYShared.value <= TOP_EPSILON;
      startProgress.value = revealProgress.value;
    })
    .onUpdate((e) => {
      'worklet';
      // Pinned open, or the pull didn't start at the top → leave it to the
      // native scroll; the composed Native gesture keeps the list moving.
      if (pinnedShared.value || !startedAtTop.value) return;
      const next = startProgress.value + e.translationY / REVEAL_DISTANCE;
      revealProgress.value = Math.min(1, Math.max(0, next));
    })
    .onEnd(() => {
      'worklet';
      if (pinnedShared.value || !startedAtTop.value) return;
      const show = revealProgress.value >= COMMIT_RATIO;
      revealProgress.value = withTiming(show ? 1 : 0, {
        duration: show ? SHOW_DURATION : HIDE_DURATION,
        easing: show ? SHOW_EASING : HIDE_EASING,
      });
      runOnJS(commitPeek)(show);
    }),
  [revealProgress, scrollYShared, pinnedShared, startedAtTop, startProgress, commitPeek]);

  const pillAnimatedStyle = useAnimatedStyle(() => ({
    opacity: revealProgress.value,
    // 0 → translated up by its own height (out of view); 1 → resting position.
    transform: [{ translateY: (revealProgress.value - 1) * revealHeight.value }],
  }));

  const setScrollY = useCallback((y) => {
    scrollYShared.value = y;
  }, [scrollYShared]);

  const setRevealHeight = useCallback((h) => {
    if (h > 0) revealHeight.value = h;
  }, [revealHeight]);

  return {
    revealPanGesture,
    pillAnimatedStyle,
    pillShown: pinned || peeked,
    setPeeked,
    setScrollY,
    setRevealHeight,
  };
}
