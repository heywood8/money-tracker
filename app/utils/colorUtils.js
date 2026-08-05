/**
 * Colour helpers shared by the app's translucent surfaces.
 */

/**
 * Append an alpha channel to a `#rrggbb` colour.
 *
 * The app's glass surfaces — the floating tab bar, the search pill, the period
 * header — are all the theme's own colours at a fraction of opacity, so they
 * tint toward the background rather than toward black and read the same in both
 * themes. This was copied into three files before it was one function.
 *
 * @param {string} hex - `#rrggbb`
 * @param {number} alpha - 0..1
 * @returns {string} `#rrggbbaa`
 */
export const withAlpha = (hex, alpha) => {
  const a = Math.round(alpha * 255).toString(16).padStart(2, '0');
  return hex + a;
};
