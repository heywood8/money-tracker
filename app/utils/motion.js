// app/utils/motion.js
/**
 * Shared motion primitives for gesture-driven UI.
 *
 * Two ideas from Apple's "Designing Fluid Interfaces" that every draggable
 * surface in the app needs, and that a fixed-duration timing curve cannot give:
 *
 *   1. Velocity handoff — when a gesture ends, the animation continues at the
 *      finger's exact release speed, so there is no seam between dragging and
 *      animating. A `withTiming(..., { duration })` release always starts from
 *      zero speed, which is why a hard flick and a slow drag used to look
 *      identical (and why a nearly-completed drag appeared to brake before the
 *      finish).
 *
 *   2. Rubber-banding — at a boundary, resist progressively instead of stopping
 *      dead. A hard clamp reads as "the touch broke"; resistance reads as
 *      "responsive, but there is nothing more this way".
 *
 * Springs are used rather than easing curves because they are the only form
 * that accepts an initial velocity and stays continuous when re-targeted
 * mid-flight (i.e. when the user grabs a moving surface again).
 */

import { Easing } from 'react-native-reanimated';

/**
 * Critically damped spring for releasing a gesture (Reanimated).
 *
 * No bounce, deliberately: every draggable surface here is a full-bleed layer
 * (the tab strip, a bottom sheet, a side panel), so travelling past the resting
 * place would expose empty background behind it. The liveliness comes from the
 * handed-off `velocity`, not from overshoot.
 *
 * `dampingRatio: 1` alone does not guarantee that. Critical damping rules out
 * *oscillation*, but a spring launched at a high enough initial velocity still
 * crosses its target once before easing back — exactly what a hard flick
 * produces. `overshootClamping` is what actually pins the surface at rest.
 *
 * `duration` is Apple's "response", not a hard runtime — the spring settles when
 * it settles, and a re-target mid-flight keeps its current velocity.
 *
 * `reduceMotion: 'system'` makes Reanimated honour the OS "Remove animations"
 * accessibility setting for free (it jumps to the target instead of animating).
 *
 * Spread it and add `velocity` at the call site:
 *   withSpring(target, { ...SPRING_SETTLE, velocity: event.velocityX })
 */
export const SPRING_SETTLE = {
  duration: 350,
  dampingRatio: 1,
  overshootClamping: true,
  reduceMotion: 'system',
};

/**
 * The app's entry curve, for the surfaces that arrive on a timing rather than
 * off a gesture: decelerating, so a thing slows into place instead of stopping.
 *
 * Carries no duration — arrival distances differ (a dialog is not a month of
 * plan), so each caller states its own and spreads this in for the rest:
 *   withTiming(1, { ...TIMING_ENTER, duration: 280 })
 *
 * `reduceMotion: 'system'` is Reanimated's own default, so spreading this does
 * not switch the behaviour on. What it does is state it: a call site that opts
 * out (`reduceMotion: 'never'`) then reads as a deliberate exception rather than
 * as the norm. The legacy `Animated` API has no equivalent at all — surfaces on
 * that API need the `useReducedMotion` hook to honour the OS setting.
 */
export const TIMING_ENTER = {
  easing: Easing.out(Easing.cubic),
  reduceMotion: 'system',
};

/**
 * The mirror of TIMING_ENTER, for a surface leaving on a timing.
 *
 * Accelerating, not decelerating: a thing on its way out has nothing to settle
 * into, and easing *into* the exit gets it off the screen while the eye is still
 * on it. This is the curve CLAUDE.md's subpanel convention already names; having
 * it here is what stops the next panel from silently inheriting React Native's
 * `Easing.inOut(Easing.ease)` default, which is what an `Animated.timing` with no
 * `easing` key gets — a symmetric curve that reads as slow at both ends.
 */
export const TIMING_EXIT = {
  easing: Easing.in(Easing.quad),
  reduceMotion: 'system',
};

/**
 * The two durations the app's panels travel on.
 *
 * Asymmetric on purpose: arriving is the part the user waits for and watches, so
 * it gets room to decelerate; leaving is a thing they have already decided on, so
 * it gets out of the way. Both sit inside the 300ms budget UI motion has before
 * it starts reading as latency.
 *
 * Surfaces with their own travel distance (a full-screen sheet, a dialog that
 * barely moves) still state their own duration — these are the default for the
 * ordinary case of a panel sliding over another panel.
 */
export const DURATION_ENTER = 260;
export const DURATION_EXIT = 200;

/**
 * Spring for a small badge or glyph confirming that an action landed.
 *
 * The deliberate opposite of SPRING_SETTLE on the one point that matters:
 * overshoot is welcome here. SPRING_SETTLE clamps it because every surface it
 * drives is a full-bleed layer, and travelling past the resting place would
 * expose empty background behind it. A 13dp badge sitting on top of a row has
 * nothing behind it to expose, and the small bounce is what makes the moment
 * read as "done" rather than as a re-render.
 *
 * `dampingRatio: 0.55` is under-damped enough to see once and not enough to
 * wobble; `duration` is the response, as in SPRING_SETTLE.
 */
export const SPRING_BADGE_POP = {
  duration: 320,
  dampingRatio: 0.55,
  reduceMotion: 'system',
};

/**
 * The same spring expressed for the legacy `Animated` API (ModalShell), which
 * has no duration/dampingRatio form. `damping = 2 * sqrt(stiffness * mass)` is
 * the critical-damping identity, so this matches SPRING_SETTLE's character.
 *
 * NOTE: `Animated.spring` takes velocity in units **per second**, while
 * `PanResponder`'s `gestureState.vy/vx` is in units per **millisecond** — remember
 * to multiply by 1000. Reanimated's gesture `velocityY/velocityX` is already
 * per second and needs no conversion.
 */
export const ANIMATED_SPRING_SETTLE = {
  stiffness: 220,
  damping: 30,
  mass: 1,
  overshootClamping: true,
  useNativeDriver: true,
};

/** Milliseconds → seconds conversion for PanResponder velocities. */
export const PAN_VELOCITY_TO_PER_SECOND = 1000;

/**
 * iOS's resistance constant. It sets how closely the surface follows the finger
 * at the very start of the over-drag (movement/drag → `constant` as the
 * overshoot approaches zero); lower is stiffer. The travel is bounded by
 * `dimension` regardless of the constant.
 */
export const RUBBERBAND_CONSTANT = 0.55;

/**
 * Progressive resistance past a boundary.
 *
 * Returns how far a surface should actually move when the finger has travelled
 * `overshoot` px beyond the edge. Starts at ~55% of the finger's movement and
 * falls off from there, approaching (but never reaching) `dimension` — so the
 * surface never quite runs away and never freezes either. Sign-preserving, so
 * it works for both edges.
 *
 * @param {number} overshoot  Signed distance dragged past the boundary.
 * @param {number} dimension  Size of the container the drag happens in.
 * @param {number} [constant] Resistance constant; lower = stiffer.
 * @returns {number} Signed distance the surface should move.
 */
export function rubberband(overshoot, dimension, constant = RUBBERBAND_CONSTANT) {
  'worklet';
  if (!dimension || dimension <= 0) return 0;
  const magnitude = Math.abs(overshoot);
  const resisted = (magnitude * dimension * constant) / (dimension + constant * magnitude);
  return overshoot < 0 ? -resisted : resisted;
}

/**
 * Clamp `value` into [min, max], but let it travel past either end with
 * rubber-band resistance instead of stopping hard.
 *
 * @param {number} value      Raw (unclamped) position the finger asks for.
 * @param {number} min        Lower bound.
 * @param {number} max        Upper bound.
 * @param {number} dimension  Size of the container (sets the resistance scale).
 * @param {number} [constant] Resistance constant; lower = stiffer.
 * @returns {number} Position to render.
 */
export function clampWithRubberband(value, min, max, dimension, constant = RUBBERBAND_CONSTANT) {
  'worklet';
  if (value > max) return max + rubberband(value - max, dimension, constant);
  if (value < min) return min + rubberband(value - min, dimension, constant);
  return value;
}
