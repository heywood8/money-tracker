/**
 * Colour helpers shared by the app's translucent surfaces.
 */

const HEX6 = /^#[0-9a-f]{6}$/i;

/**
 * Append an alpha channel to a `#rrggbb` colour.
 *
 * The app's glass surfaces — the floating tab bar, the search pill, the period
 * header — are all the theme's own colours at a fraction of opacity, so they
 * tint toward the background rather than toward black and read the same in both
 * themes. This was copied into three files before it was one function.
 *
 * A colour that cannot carry an alpha channel (an `rgba()` string has nowhere
 * to put one) yields `fallback` rather than `'rgba(…)33'`, which React Native
 * drops silently.
 *
 * @param {string} hex - `#rrggbb`
 * @param {number} alpha - 0..1
 * @param {string} [fallback] - Used when `hex` is not a plain 6-digit hex;
 *   defaults to `hex` itself (opaque).
 * @returns {string} `#rrggbbaa`
 */
export const withAlpha = (hex, alpha, fallback) => {
  if (!HEX6.test(hex ?? '')) return fallback ?? hex;
  const a = Math.round(alpha * 255).toString(16).padStart(2, '0');
  return hex + a;
};

/**
 * `fg` at `alpha` over `bg`, flattened to an OPAQUE `#rrggbb`.
 *
 * Not the same as `withAlpha`: a translucent colour composites over whatever is
 * actually behind the element, which is not always the surface you sized the
 * tint against. A selected chip is the case that matters — the chip's own
 * container is `inputBackground` (#333 in the dark theme) but the view behind it
 * is `background` (#111), so a translucent accent tint came out *darker* than
 * the unselected chips beside it and read as disabled rather than selected.
 *
 * @param {string} fg - `#rrggbb` laid on top.
 * @param {string} bg - `#rrggbb` underneath; returned as-is if either is not hex.
 * @param {number} alpha - 0..1, how much of `fg` shows.
 * @returns {string} `#rrggbb`
 */
export const blend = (fg, bg, alpha) => {
  if (!HEX6.test(fg ?? '') || !HEX6.test(bg ?? '')) return bg;
  const channel = (offset) => {
    const f = parseInt(fg.slice(1 + offset, 3 + offset), 16);
    const b = parseInt(bg.slice(1 + offset, 3 + offset), 16);
    return Math.round(f * alpha + b * (1 - alpha)).toString(16).padStart(2, '0');
  };
  return `#${channel(0)}${channel(2)}${channel(4)}`;
};

/**
 * How much of the accent a *selected* chip's fill shows.
 *
 * A selected chip used to be a solid `colors.primary` with white text on it,
 * which measures ~4.0:1 on the light accent and ~2.6:1 on the dark one — below
 * WCAG AA for the small text a chip carries. A tint of the accent carrying
 * `colors.primaryStrong` text clears AA in both schemes and still reads as
 * "on". The floors are pinned by `__tests__/styles/contrast.test.js`.
 */
export const SELECTION_TINT = 0.12;

/**
 * The fill of a selected chip: `primary` at `SELECTION_TINT` over the same
 * background its unselected neighbours use, flattened to an opaque colour.
 *
 * @param {string} primary - The accent, normally `colors.primary`.
 * @param {string} base - The unselected chip's own background, so the selected
 *   one is visibly a tinted version of it in both themes.
 * @returns {string} `#rrggbb`
 */
export const selectionTint = (primary, base) => blend(primary, base, SELECTION_TINT);
