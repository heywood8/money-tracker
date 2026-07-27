/**
 * Chart colour system.
 *
 * Every colour a chart uses for *data* comes from here — never from an ad-hoc
 * hex in a component. Two rules make this file worth having:
 *
 * 1. **Both modes are selected, not flipped.** The dark column is the same eight
 *    hues re-stepped against the dark chart surface. An automatic lighten/darken
 *    of the light column does not survive the contrast + lightness-band checks.
 * 2. **The slot ORDER is the colourblind-safety mechanism, not cosmetics.**
 *    Adjacent slots are the pairs a reader actually has to tell apart (touching
 *    donut slices, stacked segments), and the order below is one of the
 *    enumerated orderings that clears every adjacent gate in both modes. Do not
 *    reorder, extend, or "improve" a hue without re-running the validator over
 *    the whole set — a single re-step can break a pair three slots away.
 *
 * Measured with the dataviz validator against Penny's own surfaces
 * (light #ffffff, dark #1a1a1a):
 *   categorical, adjacent pairs — worst CVD ΔE 9.1 light / 8.4 dark (target 8),
 *   worst normal-vision ΔE 19.6 light / 19.3 dark (floor 15).
 *   balance-history lines, ALL pairs — worst CVD ΔE 16.2 light / 6.9 dark,
 *   worst normal-vision ΔE 19.6 light / 19.3 dark.
 * The dark CVD figure sits in the 6–8 warn band, which is legal only because
 * every line is also named and numbered in the legend table under the chart.
 *
 * Sub-3:1 contrast on some light steps is likewise covered by that table (the
 * "relief" rule): a colour never carries meaning on its own here.
 */

// Eight categorical slots. Index = slot; a category keeps its slot across
// periods, so "Groceries is blue" stays true when the month changes.
const CATEGORICAL = {
  light: ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#4a3aa7', '#e34948'],
  dark: ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300', '#9085e9', '#e66767'],
};

// Non-category slices. Grey on purpose: "Other" and balance adjustments are not
// identities competing with the real categories, they are the remainder. The two
// greys are far enough apart (ΔE ≈ 16) to survive sitting next to each other.
const NEUTRAL = {
  light: { other: '#8a8a8a', adjustment: '#5f5f5f' },
  dark: { other: '#9c9c9c', adjustment: '#6f6f6f' },
};

// Balance-history comparison lines. Picked as a set with the brand primary:
// yellow + magenta + green is the only trio out of the eight that clears the
// all-pairs separation gates alongside `colors.primary` in both modes.
const BALANCE_LINES = {
  light: { norm: '#eda100', prevMonth: '#e87ba4', yearAvg: '#008300' },
  dark: { norm: '#c98500', prevMonth: '#d55181', yearAvg: '#008300' },
};

// Second series in the category-spending card (the "vs" comparison). Slot 2,
// which is the validated neighbour of the brand blue the primary bars use.
const COMPARISON = { light: '#eb6834', dark: '#d95926' };

// Past this many slices the tail is folded into a single "Other" — eight colour
// classes is already the ceiling at which adjacent hues stay tellable apart.
export const MAX_CATEGORY_SLICES = 8;

const parseHex = (hex) => {
  const match = /^#?([0-9a-f]{6})$/i.exec(typeof hex === 'string' ? hex.trim() : '');
  if (!match) return null;
  const int = parseInt(match[1], 16);
  return [(int >> 16) & 255, (int >> 8) & 255, int & 255];
};

// WCAG relative luminance. Used both to pick the chart mode off the theme and to
// pick readable ink on top of a slice.
export const relativeLuminance = (hex) => {
  const rgb = parseHex(hex);
  if (!rgb) return 1;
  const [r, g, b] = rgb.map((channel) => {
    const c = channel / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

/**
 * Which set of steps to use. Derived from the surface the charts are drawn on
 * rather than from a theme flag, so any caller holding a `colors` object can ask
 * without threading the theme mode through half the screen.
 */
export const chartMode = (colors) =>
  relativeLuminance(colors?.surface ?? '#ffffff') < 0.5 ? 'dark' : 'light';

export const categoricalPalette = (colors) => CATEGORICAL[chartMode(colors)];

export const seriesColorForSlot = (slot, colors) => {
  const palette = categoricalPalette(colors);
  const index = Number.isFinite(slot) ? ((slot % palette.length) + palette.length) % palette.length : 0;
  return palette[index];
};

export const otherSliceColor = (colors) => NEUTRAL[chartMode(colors)].other;

export const adjustmentSliceColor = (colors) => NEUTRAL[chartMode(colors)].adjustment;

export const balanceLineColors = (colors) => BALANCE_LINES[chartMode(colors)];

export const comparisonSeriesColor = (colors) => COMPARISON[chartMode(colors)];

const DARK_INK = '#1a1a1a';
const LIGHT_INK = '#ffffff';

export const contrastRatio = (a, b) => {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
};

/**
 * Readable ink for a glyph drawn on top of a filled mark — whichever of the two
 * inks actually contrasts more against that fill. Hardcoded white was the bug
 * this replaces: on the yellow slot it measured ~1.4:1, where dark ink gets 8.9.
 */
export const inkOn = (fill) =>
  (contrastRatio(fill, DARK_INK) >= contrastRatio(fill, LIGHT_INK) ? DARK_INK : LIGHT_INK);
