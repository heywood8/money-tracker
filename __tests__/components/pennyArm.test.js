/**
 * Tests for `pennyArm` — the centreline of Penny's arm and the bend that makes
 * it wave.
 *
 * `armPathD` is the only part of the cold-start screen with real arithmetic in
 * it, and it runs on the UI thread where nothing can be observed, so it is
 * checked here as the pure function it is. The three properties below are what
 * keep the arm looking like an arm: it starts where the artwork's does, it
 * cannot stretch, and the angle a caller asks for is the angle it gets.
 */

import {
  ARM_RAISED,
  ARM_REST,
  WAVE_BACK,
  WAVE_OUT,
  armPathD,
} from '../../app/components/startup/pennyArm';

const points = (d) =>
  d
    .slice(1)
    .split(/[ML]/)
    .map((pair) => pair.trim().split(' ').map(Number));

const length = (d) =>
  points(d)
    .slice(1)
    .reduce((total, point, index) => {
      const previous = points(d)[index];
      return total + Math.hypot(point[0] - previous[0], point[1] - previous[1]);
    }, 0);

const tipAngle = (d) => {
  const all = points(d);
  const tip = all[all.length - 1];
  const before = all[all.length - 2];
  return (Math.atan2(tip[1] - before[1], tip[0] - before[0]) * 180) / Math.PI;
};

describe('armPathD', () => {
  it('draws one continuous stroke of the whole centreline', () => {
    const d = armPathD(ARM_REST, ARM_REST);

    expect(d.startsWith('M')).toBe(true);
    // One move and then nothing but line segments: a break would show as a gap
    // in the stroke, since the ink and the core are drawn from the same path.
    expect(d.match(/M/g)).toHaveLength(1);
    expect(points(d).length).toBeGreaterThan(10);
  });

  it('starts at the same point whatever the arm is doing', () => {
    const rest = points(armPathD(ARM_REST, ARM_REST))[0];

    [
      [ARM_RAISED, WAVE_OUT],
      [ARM_RAISED, WAVE_BACK],
      [-90, 90],
    ].forEach(([raise, wave]) => {
      expect(points(armPathD(raise, wave))[0]).toEqual(rest);
    });
  });

  it('never stretches or shortens the arm', () => {
    const rest = length(armPathD(ARM_REST, ARM_REST));

    [
      [ARM_RAISED, WAVE_OUT],
      [ARM_RAISED, WAVE_BACK],
      [-45, 60],
    ].forEach(([raise, wave]) => {
      // The path is emitted at two decimals, which is a third of a thousandth
      // of a dp at the size it is drawn — that rounding is the whole tolerance.
      expect(length(armPathD(raise, wave))).toBeCloseTo(rest, 2);
    });
  });

  it('turns the tip by exactly the angle it was asked for', () => {
    // Both bend fields are normalised, so the total turn from base to tip is
    // the sum of the two channels — that is what lets a caller reason about
    // `WAVE_OUT` as "28 degrees" rather than as an arbitrary knob.
    const rest = tipAngle(armPathD(ARM_REST, ARM_REST));

    // The tolerance is the path's own two-decimal rounding, read off the last
    // segment: it is four units long, so half a hundredth at each end is worth
    // something like a seventh of a degree of apparent tip direction.
    const turnedBy = (raise, wave) => tipAngle(armPathD(raise, wave)) - rest;

    [
      [ARM_RAISED, ARM_REST],
      [ARM_REST, WAVE_OUT],
      [ARM_REST, WAVE_BACK],
      [ARM_RAISED, WAVE_OUT],
    ].forEach(([raise, wave]) => {
      expect(Math.abs(turnedBy(raise, wave) - (raise + wave))).toBeLessThan(0.2);
    });
  });

  it('keeps the wave in the hand rather than throwing the whole arm about', () => {
    const rest = points(armPathD(ARM_REST, ARM_REST));
    const waving = points(armPathD(ARM_REST, WAVE_OUT));
    const moved = rest.map((point, i) => Math.hypot(waving[i][0] - point[0], waving[i][1] - point[1]));

    // Monotonic: every point moves at least as far as the one before it, so
    // the arm sweeps rather than kinking somewhere in the middle.
    moved.slice(1).forEach((distance, i) => {
      expect(distance).toBeGreaterThanOrEqual(moved[i] - 1e-9);
    });
    // And the shoulder end, which lives under the coin, barely moves at all.
    expect(moved[1]).toBeLessThan(moved[moved.length - 1] / 10);
  });

  it('is the artwork untouched at rest', () => {
    // The native splash hands over on the artwork's own frame, so the first
    // frame this draws has to be that same picture. Both ends are pinned: a
    // change here means the handover has developed a seam.
    const all = points(armPathD(ARM_REST, ARM_REST));

    // The tip of the hook, where the artwork's arm ends. Within the two
    // decimals the path is emitted at.
    const [tipX, tipY] = all[all.length - 1];
    expect(tipX).toBeCloseTo(447, 1);
    expect(tipY).toBeCloseTo(305, 1);
    // And the base, which is the fiddly one. The artwork's arm is cut off by
    // the coin's rim, so a base further out lets the stroke's round cap show
    // and one buried further in pushes the stroke's underside out past the rim
    // as a wedge below her shoulder — which is what an earlier revision did.
    expect(all[0]).toEqual([411.14, 334.17]);  // exact: it is the path's origin
  });
});
