/**
 * The home-screen widgets' colours: the phone's Material You palette where it
 * has one, Penny's own theme where it does not.
 *
 * The palette's native half (modules/penny-system-colors) cannot run under
 * Jest; it is replaced here by a stub whose getPalette each test sets.
 */

import { lightTheme, darkTheme } from '../../app/contexts/ThemeColorsContext';
import { PALETTE_ROLES, readSystemPalette, widgetColors } from '../../app/widgets/widgetColors';

// The real palettes: jest.setup.js mocks this module down to the hook alone.
jest.mock('../../app/contexts/ThemeColorsContext', () => jest.requireActual('../../app/contexts/ThemeColorsContext'));

// Called through, not handed over: the factory runs when widgetColors is
// imported, before this file's own constants exist.
const mockNative = { getPalette: jest.fn() };
jest.mock('../../modules/penny-system-colors', () => ({
  __esModule: true,
  default: { getPalette: (...args) => mockNative.getPalette(...args) },
}));

const SHADES = [0, 10, 50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 1000];

// A palette as the module returns it, every shade of every palette a distinct
// colour, so a test can tell which one a role took.
const shadeHex = (paletteIndex, shade) => {
  const hex = (n) => n.toString(16).padStart(2, '0');
  return `#${hex(paletteIndex * 40)}${hex(Math.round(shade / 4))}${hex(255 - Math.round(shade / 4))}`;
};
const PALETTE_NAMES = ['accent1', 'accent2', 'accent3', 'neutral1', 'neutral2'];
const makePalette = (hexOf = shadeHex) => Object.fromEntries(PALETTE_NAMES.map((name, i) => [
  name,
  Object.fromEntries(SHADES.map((shade) => [String(shade), hexOf(i, shade)])),
]));

// WCAG contrast.
const luminance = (hex) => {
  const channel = (i) => {
    const s = parseInt(hex.slice(i, i + 2), 16) / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
};
const contrast = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

// A palette whose shades sit exactly at Material's tones: shade 0 is tone 100,
// 10 is 99, 50 is 95, 100 is 90 … 900 is 10, 1000 is 0. A tone is a lightness
// (CIE L*), which fixes a colour's luminance whatever its hue, so contrast
// between tones measured on greys holds for every wallpaper's palette.
const TONE_OF_SHADE = { 0: 100, 10: 99, 50: 95 };
const toneOf = (shade) => TONE_OF_SHADE[shade] ?? 100 - shade / 10;
const greyAtTone = (tone) => {
  const l = tone;
  const y = l > 8 ? ((l + 16) / 116) ** 3 : l / 903.2963;
  const srgb = y <= 0.0031308 ? 12.92 * y : 1.055 * y ** (1 / 2.4) - 0.055;
  const byte = Math.round(Math.min(1, Math.max(0, srgb)) * 255);
  return `#${byte.toString(16).padStart(2, '0').repeat(3)}`;
};
const TONAL_PALETTE = makePalette((i, shade) => greyAtTone(toneOf(shade)));

describe('widgetColors', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('readSystemPalette', () => {
    it('returns the palette the module reads', () => {
      const palette = makePalette();
      mockNative.getPalette.mockReturnValue(palette);
      expect(readSystemPalette()).toBe(palette);
    });

    it('is null below Android 12, where the module has no palette', () => {
      mockNative.getPalette.mockReturnValue(null);
      expect(readSystemPalette()).toBeNull();
    });

    it('is null rather than throwing when the read fails', () => {
      const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
      mockNative.getPalette.mockImplementation(() => { throw new Error('ReactContextLost'); });
      expect(readSystemPalette()).toBeNull();
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('system palette'), 'ReactContextLost');
      warn.mockRestore();
    });

    it('ignores a value that is not a palette', () => {
      mockNative.getPalette.mockReturnValue('#ffffff');
      expect(readSystemPalette()).toBeNull();
    });
  });

  describe('without a palette', () => {
    it.each([['light', lightTheme], ['dark', darkTheme]])('keeps Penny’s %s theme', (theme, expected) => {
      expect(widgetColors(theme, null)).toBe(expected.colors);
      expect(widgetColors(theme, undefined)).toBe(expected.colors);
    });
  });

  describe('with a palette', () => {
    const palette = makePalette();
    const shade = (name, value) => palette[name][String(value)];

    it('takes the card, text, accent and lines from it, in the shades the system widgets use', () => {
      expect(widgetColors('light', palette)).toMatchObject({
        surface: shade('accent2', 50),
        text: shade('neutral1', 900),
        mutedText: shade('neutral2', 700),
        primary: shade('accent1', 600),
        border: shade('neutral2', 200),
      });
      expect(widgetColors('dark', palette)).toMatchObject({
        surface: shade('accent2', 800),
        text: shade('neutral1', 100),
        mutedText: shade('neutral2', 200),
        primary: shade('accent1', 200),
        border: shade('neutral2', 700),
      });
    });

    it('keeps Penny’s colours for what carries meaning: rises, falls and a forecast below zero', () => {
      for (const [theme, { colors }] of [['light', lightTheme], ['dark', darkTheme]]) {
        expect(widgetColors(theme, palette)).toMatchObject({
          success: colors.success,
          overspend: colors.overspend,
          destructive: colors.destructive,
        });
      }
    });

    it('does not change the app’s own themes', () => {
      const before = { ...lightTheme.colors };
      widgetColors('light', palette);
      expect(lightTheme.colors).toEqual(before);
    });

    it('is not used at all when a shade a role needs is missing', () => {
      const partial = makePalette();
      delete partial.accent2['800'];
      expect(widgetColors('dark', partial)).toBe(darkTheme.colors);
      // The light variant needs no accent2 800, so it still follows the palette.
      expect(widgetColors('light', partial).surface).toBe(partial.accent2['50']);
    });

    it('is not used at all when a shade is not a colour', () => {
      const broken = makePalette();
      broken.neutral1['100'] = 'rgb(1, 2, 3)';
      expect(widgetColors('dark', broken)).toBe(darkTheme.colors);
      expect(widgetColors('dark', { ...makePalette(), neutral2: undefined })).toBe(darkTheme.colors);
    });
  });

  describe('contrast, for any wallpaper', () => {
    // The tonal palette stands for every palette: see TONAL_PALETTE.
    it('measures the tones it stands for', () => {
      expect(TONAL_PALETTE.neutral1['0']).toBe('#ffffff');
      expect(TONAL_PALETTE.neutral1['1000']).toBe('#000000');
      expect(TONAL_PALETTE.neutral1['500']).toBe('#777777');
    });

    describe.each(['light', 'dark'])('%s', (theme) => {
      // Small text all of it, the window's arrows included: WCAG AA.
      it.each(['text', 'mutedText', 'primary', 'success', 'overspend'])('%s reads on the card', (role) => {
        const colors = widgetColors(theme, TONAL_PALETTE);
        expect(contrast(colors[role], colors.surface)).toBeGreaterThanOrEqual(4.5);
      });
    });

    it.each(['light', 'dark'])('%s: a forecast below zero, in bold, reads on the card', (theme) => {
      const colors = widgetColors(theme, TONAL_PALETTE);
      // Bold figures, held to 3:1: the light theme's red is under 4.5:1 on
      // Penny's own white card too.
      expect(contrast(colors.destructive, colors.surface)).toBeGreaterThanOrEqual(3);
    });

    it.each(['light', 'dark'])('%s: a faint arrow and the divider still stand apart from the card', (theme) => {
      const colors = widgetColors(theme, TONAL_PALETTE);
      expect(contrast(colors.border, colors.surface)).toBeGreaterThan(1.2);
      expect(contrast(colors.border, colors.surface)).toBeLessThan(contrast(colors.primary, colors.surface));
    });
  });

  it('maps every role in both schemes', () => {
    expect(Object.keys(PALETTE_ROLES.light).sort()).toEqual(Object.keys(PALETTE_ROLES.dark).sort());
  });
});
