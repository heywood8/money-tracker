/**
 * Penny's right arm, as a centreline that can be bent.
 *
 * The arm is not a sprite that gets rotated. It is the medial axis of the arm
 * in `assets/splash-icon.png` — the image the native splash draws, and so the
 * frame this has to continue — traced out at the artwork's own 592 px scale
 * and redrawn every frame as one continuous stroke: the outline brown first,
 * then the lighter core on top, at the widths the artwork uses. Two
 * consequences, and they are the reason for doing it this way:
 *
 *   - Waving is a *bend field* spread along the centreline rather than a hinge
 *     at one joint, so the arm flexes like an arm and can never snap at a
 *     pivot, however far it swings.
 *   - `assets/penny-body.png` is the same mark with this arm removed and the
 *     navy disc made transparent — the disc is the `BRAND.surface` the screen
 *     already paints, so nothing is lost. Drawing the body *over* the stroke
 *     keeps the arm's base hidden under the coin no matter where it swings.
 *
 * At rest the stroke reproduces the artwork, so the frame the native splash
 * hands over on and the first frame this draws are the same picture.
 */

/** The artwork's own coordinate space; the mark is square. */
export const ARM_VIEWBOX = 592;

/** Stroke widths, measured off the artwork. */
export const ARM_INK_WIDTH = 17;
export const ARM_CORE_WIDTH = 5;

/**
 * Where the centreline starts. It sits inside the coin, far enough in that the
 * stroke's round cap is behind the body in every pose — and no further, since
 * the artwork's arm is cut off by the coin's rim and a stroke buried deeper
 * than that has to squeeze out past it somewhere.
 */
const ARM_ORIGIN = [411.14, 334.17];

/**
 * The centreline as segment deltas rather than points: bending rotates each
 * delta and lays it down end to end, which is what keeps the arm's length
 * exactly constant whatever it is doing.
 */
const ARM_SEGMENTS = [
  [3.1, 0.48], [3.1, 0.48], [3.1, 0.48], [2.99, 0.06], [2.56, -1.81], [2.81, -1.4],
  [2.82, -1.36], [2.62, -1.72], [2.37, -2.05], [2.2, -2.24], [1.89, -2.5], [1.4, -2.8],
  [1.24, -2.88], [1.26, -2.87], [1.17, -2.91], [0.96, -2.99], [0.28, -3.12],
];

/**
 * How each of the two channels spends its rotation along the arm.
 *
 * Both fields are normalised on the way in — they are tabulated to four
 * decimals, and dividing through by the total is what makes the angle a caller
 * asks for exactly the total turn from base to tip, so the two channels compose
 * without either one having to know about the other.
 *
 * `BEND_RAISE` is packed into the first few segments, which are the shoulder —
 * a quarter of it behind the coin's rim — so raising swings the visible arm
 * almost as one piece. `BEND_WAVE` is weighted towards the wrist and the hook
 * at the end, so the wave reads as her hand opening and closing rather than as
 * the whole arm being thrown about.
 */
const normalised = (field) => {
  const total = field.reduce((sum, weight) => sum + weight, 0);
  return field.map((weight) => weight / total);
};

const BEND_RAISE = normalised([
  0.0757, 0.1654, 0.2444, 0.2444, 0.1654, 0.0757, 0.0235, 0.0049, 0.0007,
  0.0001, 0, 0, 0, 0, 0, 0, 0,
]);
const BEND_WAVE = normalised([
  0.0048, 0.0081, 0.0129, 0.0194, 0.0277, 0.0376, 0.0484, 0.0596, 0.0703,
  0.0801, 0.0886, 0.0952, 0.0993, 0.0994, 0.0945, 0.0843, 0.0698,
]);

/**
 * The poses, in degrees of total turn from base to tip.
 *
 * `ARM_REST` is the artwork untouched. `ARM_RAISED` lifts the arm clear of her
 * side; `WAVE_OUT` and `WAVE_BACK` are the two ends the wave rocks between.
 * They are absolute, not a spread either side of rest, and they are not
 * symmetric about it: the wave sits on the reaching-out side, which is what
 * makes it read as a wave rather than as a wobble.
 */
export const ARM_REST = 0;
export const ARM_RAISED = -10;
export const WAVE_OUT = 28;
export const WAVE_BACK = -25.2;

const DEG = Math.PI / 180;

/**
 * The arm's `d`, bent by the two channels.
 *
 * A worklet: the cold-start screen exists because the JS thread is busy
 * reading the database, so this has to run on the UI thread. It is pure and
 * allocation-light — seventeen segments, no closures — and calling it from JS
 * (as the tests do) works just the same.
 *
 * @param {number} raise how far the arm is lifted, in degrees
 * @param {number} wave  the wave on top of that, in degrees
 * @returns {string} an SVG path in the artwork's 592 px space
 */
export const armPathD = (raise, wave) => {
  'worklet';
  let x = ARM_ORIGIN[0];
  let y = ARM_ORIGIN[1];
  let angle = 0;
  let d = `M${x.toFixed(2)} ${y.toFixed(2)}`;

  for (let i = 0; i < ARM_SEGMENTS.length; i += 1) {
    angle += raise * BEND_RAISE[i] + wave * BEND_WAVE[i];
    const cos = Math.cos(angle * DEG);
    const sin = Math.sin(angle * DEG);
    const dx = ARM_SEGMENTS[i][0];
    const dy = ARM_SEGMENTS[i][1];
    x += dx * cos - dy * sin;
    y += dx * sin + dy * cos;
    d += `L${x.toFixed(2)} ${y.toFixed(2)}`;
  }

  return d;
};
