// __tests__/utils/motion.test.js
import {
  rubberband,
  clampWithRubberband,
  RUBBERBAND_CONSTANT,
  SPRING_SETTLE,
  ANIMATED_SPRING_SETTLE,
  PAN_VELOCITY_TO_PER_SECOND,
} from '../../app/utils/motion';

const DIMENSION = 400;

describe('motion', () => {
  describe('rubberband', () => {
    it('returns zero at the boundary', () => {
      expect(rubberband(0, DIMENSION)).toBe(0);
    });

    it('resists: the surface always moves less than the finger', () => {
      for (const overshoot of [1, 10, 50, 200, 1000]) {
        expect(rubberband(overshoot, DIMENSION)).toBeLessThan(overshoot);
      }
    });

    it('is monotonic — more drag always means more movement', () => {
      let previous = 0;
      for (const overshoot of [1, 5, 20, 80, 300, 1200]) {
        const moved = rubberband(overshoot, DIMENSION);
        expect(moved).toBeGreaterThan(previous);
        previous = moved;
      }
    });

    it('resists progressively — the ratio of movement to drag keeps falling', () => {
      const near = rubberband(20, DIMENSION) / 20;
      const mid = rubberband(200, DIMENSION) / 200;
      const far = rubberband(2000, DIMENSION) / 2000;
      expect(near).toBeGreaterThan(mid);
      expect(mid).toBeGreaterThan(far);
    });

    it('starts at roughly the resistance constant for tiny overshoots', () => {
      // The point of a soft boundary: the very first pixel past the edge still
      // moves, so the surface never reads as frozen.
      expect(rubberband(0.5, DIMENSION) / 0.5).toBeCloseTo(RUBBERBAND_CONSTANT, 2);
    });

    it('approaches but never reaches the dimension as an asymptote', () => {
      // Total give is bounded by the container size, whatever the constant —
      // the surface can never be dragged arbitrarily far past its edge.
      expect(rubberband(1e6, DIMENSION)).toBeLessThan(DIMENSION);
      expect(rubberband(1e6, DIMENSION)).toBeGreaterThan(DIMENSION * 0.99);
      expect(rubberband(1e9, DIMENSION, 0.2)).toBeLessThan(DIMENSION);
    });

    it('is sign-preserving so both edges behave the same', () => {
      expect(rubberband(-120, DIMENSION)).toBeCloseTo(-rubberband(120, DIMENSION), 10);
    });

    it('a lower constant resists harder', () => {
      expect(rubberband(100, DIMENSION, 0.3)).toBeLessThan(rubberband(100, DIMENSION, 0.55));
    });

    it('degrades safely on a zero or missing dimension', () => {
      expect(rubberband(100, 0)).toBe(0);
      expect(rubberband(100, undefined)).toBe(0);
    });
  });

  describe('clampWithRubberband', () => {
    const MIN = -1200;
    const MAX = 0;

    it('passes values inside the bounds through untouched', () => {
      expect(clampWithRubberband(-600, MIN, MAX, DIMENSION)).toBe(-600);
      expect(clampWithRubberband(MIN, MIN, MAX, DIMENSION)).toBe(MIN);
      expect(clampWithRubberband(MAX, MIN, MAX, DIMENSION)).toBe(MAX);
    });

    it('lets the surface past the upper bound, with resistance', () => {
      const result = clampWithRubberband(100, MIN, MAX, DIMENSION);
      expect(result).toBeGreaterThan(MAX);
      expect(result).toBeLessThan(100);
    });

    it('lets the surface past the lower bound, with resistance', () => {
      const result = clampWithRubberband(MIN - 100, MIN, MAX, DIMENSION);
      expect(result).toBeLessThan(MIN);
      expect(result).toBeGreaterThan(MIN - 100);
    });

    it('is continuous at both bounds — no jump as the edge is crossed', () => {
      // An epsilon past the edge may move the surface by at most that epsilon,
      // so there is no discontinuity where free travel becomes resistance.
      const eps = 1e-6;
      expect(Math.abs(clampWithRubberband(MAX + eps, MIN, MAX, DIMENSION) - MAX))
        .toBeLessThanOrEqual(eps);
      expect(Math.abs(clampWithRubberband(MIN - eps, MIN, MAX, DIMENSION) - MIN))
        .toBeLessThanOrEqual(eps);
    });

    it('regression: an edge over-drag never freezes (the old hard clamp did)', () => {
      // Dragging right on the first tab used to pin translateX at 0 for the whole
      // gesture, which reads as a broken touch. Every extra pixel must now yield
      // at least some movement.
      let previous = MAX;
      for (const overshoot of [5, 25, 100, 400]) {
        const moved = clampWithRubberband(MAX + overshoot, MIN, MAX, DIMENSION);
        expect(moved).toBeGreaterThan(previous);
        previous = moved;
      }
    });
  });

  describe('spring presets', () => {
    it('SPRING_SETTLE is critically damped so full-bleed layers never oscillate', () => {
      expect(SPRING_SETTLE.dampingRatio).toBe(1);
      expect(SPRING_SETTLE.duration).toBeGreaterThan(0);
    });

    it('SPRING_SETTLE clamps overshoot — critical damping alone would not', () => {
      // A hard flick hands the spring a large initial velocity, and a critically
      // damped spring still crosses its target once at high v0. On a full-bleed
      // layer that single crossing exposes empty background past the last tab /
      // below a sheet, so it has to be clamped rather than merely non-oscillating.
      expect(SPRING_SETTLE.overshootClamping).toBe(true);
      expect(ANIMATED_SPRING_SETTLE.overshootClamping).toBe(true);
    });

    it('SPRING_SETTLE honours the OS reduce-motion setting', () => {
      expect(SPRING_SETTLE.reduceMotion).toBe('system');
    });

    it('SPRING_SETTLE carries no baked-in velocity — call sites supply it', () => {
      expect(SPRING_SETTLE.velocity).toBeUndefined();
    });

    it('ANIMATED_SPRING_SETTLE matches the critical-damping identity', () => {
      const { stiffness, damping, mass } = ANIMATED_SPRING_SETTLE;
      const critical = 2 * Math.sqrt(stiffness * mass);
      // Within 5% of critical: no visible bounce, no sluggish overdamping.
      expect(Math.abs(damping - critical) / critical).toBeLessThan(0.05);
    });

    it('ANIMATED_SPRING_SETTLE stays on the native driver', () => {
      expect(ANIMATED_SPRING_SETTLE.useNativeDriver).toBe(true);
    });

    it('ANIMATED_SPRING_SETTLE mixes no legacy bounciness/speed config', () => {
      // Animated.spring throws if bounciness/speed is combined with
      // stiffness/damping.
      expect(ANIMATED_SPRING_SETTLE.bounciness).toBeUndefined();
      expect(ANIMATED_SPRING_SETTLE.speed).toBeUndefined();
      expect(ANIMATED_SPRING_SETTLE.tension).toBeUndefined();
      expect(ANIMATED_SPRING_SETTLE.friction).toBeUndefined();
    });

    it('converts PanResponder px/ms velocity to the px/s Animated.spring wants', () => {
      expect(0.3 * PAN_VELOCITY_TO_PER_SECOND).toBe(300);
    });
  });
});
