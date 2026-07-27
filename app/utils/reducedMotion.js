// app/utils/reducedMotion.js
/**
 * OS "Remove animations" support for the surfaces still on React Native's
 * `Animated` API.
 *
 * Reanimated reads the accessibility setting itself — every `withTiming` /
 * `withSpring` in the app defaults to `ReduceMotion.System` and jumps straight to
 * the target when the user has asked for less movement. The legacy `Animated`
 * API has no such notion, so roughly half of this app's motion (every modal
 * subpanel, the bottom sheet, the currency pickers) ignored the setting
 * entirely. This module is that half's version of the same behaviour.
 *
 * It is a module-level cache rather than a hook on purpose. The call sites are
 * `Animated.timing` configs inside `useCallback`s, not render bodies — a hook
 * would mean threading a value through every one of them and re-creating the
 * callbacks whenever it changed, to animate the exact same way. A synchronous
 * getter reads correctly at the moment the animation is built, which is the only
 * moment that matters.
 *
 * What "reduced" means here follows the accessibility guidance rather than the
 * blunt reading of it: movement is dropped, feedback is not. A panel that slides
 * in arrives instantly (duration 0); a thing that only fades keeps fading, and a
 * progress bar keeps depleting — those carry information, not decoration. So
 * `motionDuration` is applied to travel, and deliberately not to every timing in
 * the codebase.
 */

import { AccessibilityInfo } from 'react-native';

let enabled = false;
let subscribed = false;

// Subscribe lazily, on the first query, rather than at import time: this module
// is imported by screens that unit tests render with AccessibilityInfo mocked to
// a bare object, and an import-time listener would throw there before any test
// body runs.
function ensureSubscribed() {
  if (subscribed) return;
  subscribed = true;
  try {
    AccessibilityInfo.isReduceMotionEnabled?.()
      ?.then((value) => { enabled = !!value; })
      ?.catch(() => {});
    AccessibilityInfo.addEventListener?.('reduceMotionChanged', (value) => {
      enabled = !!value;
    });
  } catch {
    // An environment without the accessibility module animates normally.
    enabled = false;
  }
}

/** Whether the OS has asked for reduced motion. Synchronous; safe before init. */
export function isReduceMotionEnabled() {
  ensureSubscribed();
  return enabled;
}

/**
 * A duration for an animation that moves something.
 *
 * @param {number} ms  The duration to use normally.
 * @returns {number} `ms`, or 0 when the OS asked for reduced motion.
 */
export function motionDuration(ms) {
  return isReduceMotionEnabled() ? 0 : ms;
}

/** Test seam: force the cached value (and skip the async read). */
export function __setReduceMotionForTests(value) {
  subscribed = true;
  enabled = !!value;
}
