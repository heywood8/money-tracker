/**
 * WCAG contrast floors for the palettes (issue #1710).
 *
 * The app used to paint white text on a solid `colors.primary` for every
 * selected chip and count badge. That measures ~4.0:1 on the light accent and
 * ~2.6:1 on the dark one — below WCAG AA (4.5:1) for the small text those
 * elements carry, and the dark figure is below even the 3:1 large-text floor.
 *
 * These tests pin the two replacements so a future palette edit cannot
 * reintroduce the problem silently:
 *  - a *tinted* chip (selectionTint under `colors.primary` text), and
 *  - a *filled* badge/button (`onPrimaryFill` on `primaryFill`).
 */

jest.unmock('../../app/contexts/ThemeColorsContext');

import { lightTheme, darkTheme } from '../../app/contexts/ThemeColorsContext';
import { selectionTint } from '../../app/utils/colorUtils';

/** WCAG 2.1 minimum for normal-size text. */
const AA_NORMAL = 4.5;

const parseHex = (hex) => {
  const clean = hex.replace('#', '');
  const full = clean.length === 3 ? clean.split('').map(c => c + c).join('') : clean;
  return {
    r: parseInt(full.slice(0, 2), 16),
    g: parseInt(full.slice(2, 4), 16),
    b: parseInt(full.slice(4, 6), 16),
    a: full.length === 8 ? parseInt(full.slice(6, 8), 16) / 255 : 1,
  };
};

/** Composite a possibly-translucent colour over an opaque one. */
const over = (fg, bg) => {
  const f = parseHex(fg);
  const b = parseHex(bg);
  return {
    r: f.r * f.a + b.r * (1 - f.a),
    g: f.g * f.a + b.g * (1 - f.a),
    b: f.b * f.a + b.b * (1 - f.a),
    a: 1,
  };
};

/** WCAG relative luminance. */
const luminance = ({ r, g, b }) => {
  const channel = (v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
};

const contrast = (a, b) => {
  const la = luminance(typeof a === 'string' ? parseHex(a) : a);
  const lb = luminance(typeof b === 'string' ? parseHex(b) : b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
};

// Every background a selected chip is laid over: the filter and quick-add chips
// use `inputBackground`, the language cards `surface`.
const CHIP_BACKGROUNDS = (colors) => [colors.inputBackground, colors.surface];

const THEMES = [
  ['light', lightTheme.colors],
  ['dark', darkTheme.colors],
];

describe('palette contrast (#1710)', () => {
  // Sanity check on the maths itself: black on white is exactly 21:1.
  it('measures a known pair correctly', () => {
    expect(contrast('#000000', '#ffffff')).toBeCloseTo(21, 5);
  });

  describe.each(THEMES)('%s theme', (name, colors) => {
    it('selected chip text clears AA against its tinted fill', () => {
      // `primaryStrong`, not `primary`: the accent itself only reaches ~3.4:1
      // on its own tint, so the tinted-chip pattern needed a text tone of its
      // own to actually clear AA. `selectionTint` returns an opaque blend over
      // the chip's own background, so there is nothing left to composite.
      for (const surface of CHIP_BACKGROUNDS(colors)) {
        const fill = selectionTint(colors.primary, surface);
        expect(contrast(colors.primaryStrong, fill)).toBeGreaterThanOrEqual(AA_NORMAL);
      }
    });

    // A selected chip must read as lit up, not dimmed: the tint composited over
    // `background` instead of the chip's own `inputBackground` came out darker
    // than its unselected neighbours in the dark theme.
    it('selected chip fill is lighter than the unselected one in the dark theme', () => {
      for (const surface of CHIP_BACKGROUNDS(colors)) {
        const fill = selectionTint(colors.primary, surface);
        if (name !== 'dark') continue;
        expect(luminance(parseHex(fill))).toBeGreaterThan(luminance(parseHex(surface)));
      }
    });

    it('filled-accent text clears AA against the fill', () => {
      expect(contrast(colors.onPrimaryFill, colors.primaryFill)).toBeGreaterThanOrEqual(AA_NORMAL);
    });

    it('body text clears AA against the surfaces it is drawn on', () => {
      for (const surface of [colors.surface, colors.background, colors.card]) {
        expect(contrast(colors.text, surface)).toBeGreaterThanOrEqual(AA_NORMAL);
      }
    });

    it('selected chip border clears the 3:1 floor for non-text UI', () => {
      for (const surface of CHIP_BACKGROUNDS(colors)) {
        const fill = selectionTint(colors.primary, surface);
        expect(contrast(colors.primary, fill)).toBeGreaterThanOrEqual(3);
      }
    });

    // The regression itself: what the chips used to do.
    it('is why white on a solid accent was replaced', () => {
      expect(contrast('#ffffff', colors.primary)).toBeLessThan(AA_NORMAL);
    });
  });
});
