import {
  MAX_CATEGORY_SLICES,
  adjustmentSliceColor,
  balanceLineColors,
  categoricalPalette,
  chartMode,
  comparisonSeriesColor,
  contrastRatio,
  inkOn,
  otherSliceColor,
  relativeLuminance,
  seriesColorForSlot,
} from '../../app/styles/chartPalette';

const LIGHT = { surface: '#ffffff' };
const DARK = { surface: '#1a1a1a' };

describe('chartPalette', () => {
  describe('chartMode', () => {
    it('reads light from a light chart surface', () => {
      expect(chartMode(LIGHT)).toBe('light');
    });

    it('reads dark from a dark chart surface', () => {
      expect(chartMode(DARK)).toBe('dark');
    });

    it('falls back to light when the surface is missing', () => {
      expect(chartMode({})).toBe('light');
      expect(chartMode(undefined)).toBe('light');
    });
  });

  describe('categorical slots', () => {
    it('ships eight slots per mode', () => {
      expect(categoricalPalette(LIGHT)).toHaveLength(MAX_CATEGORY_SLICES);
      expect(categoricalPalette(DARK)).toHaveLength(MAX_CATEGORY_SLICES);
    });

    it('holds no duplicate hue in either mode', () => {
      // The palette this replaced repeated slot 1 at slot 7, so two different
      // categories in the same donut could come out the same colour.
      const light = categoricalPalette(LIGHT);
      const dark = categoricalPalette(DARK);
      expect(new Set(light).size).toBe(light.length);
      expect(new Set(dark).size).toBe(dark.length);
    });

    it('steps the dark mode separately from the light one', () => {
      const light = categoricalPalette(LIGHT);
      const dark = categoricalPalette(DARK);
      // Green is deliberately mode-invariant; everything else is re-stepped.
      const shared = light.filter((hex, i) => hex === dark[i]);
      expect(shared).toEqual(['#008300']);
    });

    it('maps a slot to its mode-specific step', () => {
      expect(seriesColorForSlot(0, LIGHT)).toBe(categoricalPalette(LIGHT)[0]);
      expect(seriesColorForSlot(0, DARK)).toBe(categoricalPalette(DARK)[0]);
    });

    it('wraps slots past the palette length instead of returning undefined', () => {
      expect(seriesColorForSlot(MAX_CATEGORY_SLICES, LIGHT)).toBe(seriesColorForSlot(0, LIGHT));
      expect(seriesColorForSlot(-1, LIGHT)).toBe(seriesColorForSlot(MAX_CATEGORY_SLICES - 1, LIGHT));
    });

    it('falls back to the first slot for a non-numeric slot', () => {
      expect(seriesColorForSlot(undefined, LIGHT)).toBe(categoricalPalette(LIGHT)[0]);
    });
  });

  describe('non-category colours', () => {
    it('keeps "Other" and adjustments neutral and distinct from each other', () => {
      [LIGHT, DARK].forEach((colors) => {
        const other = otherSliceColor(colors);
        const adjustment = adjustmentSliceColor(colors);
        expect(other).not.toBe(adjustment);
        expect(categoricalPalette(colors)).not.toContain(other);
        expect(categoricalPalette(colors)).not.toContain(adjustment);
      });
    });
  });

  describe('balance-history lines', () => {
    it('gives every comparison line its own hue in both modes', () => {
      [LIGHT, DARK].forEach((colors) => {
        const { norm, prevMonth, yearAvg } = balanceLineColors(colors);
        expect(new Set([norm, prevMonth, yearAvg]).size).toBe(3);
      });
    });

    it('steps the comparison series per mode', () => {
      expect(comparisonSeriesColor(LIGHT)).not.toBe(comparisonSeriesColor(DARK));
    });
  });

  describe('inkOn', () => {
    it('picks the ink that actually contrasts more', () => {
      // Every categorical slot must end up with a legible glyph on it — the
      // hardcoded white this replaced measured ~1.4:1 on the yellow slot.
      [...categoricalPalette(LIGHT), ...categoricalPalette(DARK)].forEach((fill) => {
        const ink = inkOn(fill);
        expect(contrastRatio(fill, ink)).toBeGreaterThanOrEqual(
          contrastRatio(fill, ink === '#ffffff' ? '#1a1a1a' : '#ffffff'),
        );
        expect(contrastRatio(fill, ink)).toBeGreaterThan(3);
      });
    });

    it('inks a light fill dark', () => {
      expect(inkOn('#eda100')).toBe('#1a1a1a');
    });

    it('inks a dark fill white', () => {
      expect(inkOn('#4a3aa7')).toBe('#ffffff');
    });

    it('treats an unparseable fill as light and inks it dark', () => {
      expect(inkOn('not-a-colour')).toBe('#1a1a1a');
    });
  });

  describe('relativeLuminance', () => {
    it('spans black to white', () => {
      expect(relativeLuminance('#000000')).toBeCloseTo(0, 5);
      expect(relativeLuminance('#ffffff')).toBeCloseTo(1, 5);
    });

    it('accepts a hex without the hash', () => {
      expect(relativeLuminance('ffffff')).toBeCloseTo(1, 5);
    });
  });
});
