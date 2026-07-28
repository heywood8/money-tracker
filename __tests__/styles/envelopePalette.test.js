import { ENVELOPE_HUES, ENVELOPE_RAIL_CHILD_ALPHA, envelopeHue } from '../../app/styles/envelopePalette';

describe('envelopePalette', () => {
  describe('envelopeHue', () => {
    it('gives the first six envelopes six different colours', () => {
      // By position rather than by a hash of the id: over six buckets a hash
      // collides between neighbours often enough to matter, and neighbours are
      // exactly where a repeated colour reads as "these two are related".
      const hues = [0, 1, 2, 3, 4, 5].map(envelopeHue);
      expect(new Set(hues).size).toBe(6);
    });

    it('wraps around past the end of the palette', () => {
      expect(envelopeHue(6)).toBe(envelopeHue(0));
      expect(envelopeHue(13)).toBe(envelopeHue(1));
    });

    it('falls back to the first hue for an index that is not one', () => {
      expect(envelopeHue(-1)).toBe(ENVELOPE_HUES[0]);
      expect(envelopeHue(Number.NaN)).toBe(ENVELOPE_HUES[0]);
      expect(envelopeHue(undefined)).toBe(ENVELOPE_HUES[0]);
    });
  });

  describe('Palette', () => {
    it('is all 6-digit hex, so an alpha channel can be appended', () => {
      // The child rail is built as `${hue}${ENVELOPE_RAIL_CHILD_ALPHA}`, which
      // only produces a valid colour if every hue is exactly six digits.
      for (const hue of ENVELOPE_HUES) {
        expect(hue).toMatch(/^#[0-9A-Fa-f]{6}$/);
      }
      expect(ENVELOPE_RAIL_CHILD_ALPHA).toMatch(/^[0-9A-Fa-f]{2}$/);
    });

    it('stays out of the red band, which belongs to the overspend colour', () => {
      // An envelope label must never be mistaken for an alarm. Red-dominant
      // means red clearly ahead of both other channels; none of these are.
      for (const hue of ENVELOPE_HUES) {
        const r = parseInt(hue.slice(1, 3), 16);
        const g = parseInt(hue.slice(3, 5), 16);
        const b = parseInt(hue.slice(5, 7), 16);
        expect(r - Math.max(g, b)).toBeLessThan(32);
      }
    });

    it('is muted enough to sit under the alert colour in the hierarchy', () => {
      // Saturation as max-minus-min over max. The alert red (#FF6B6B) is at
      // ~0.58; every label hue has to be clearly below that or the screen goes
      // back to competing for attention.
      for (const hue of ENVELOPE_HUES) {
        const channels = [
          parseInt(hue.slice(1, 3), 16),
          parseInt(hue.slice(3, 5), 16),
          parseInt(hue.slice(5, 7), 16),
        ];
        const max = Math.max(...channels);
        const saturation = (max - Math.min(...channels)) / max;
        expect(saturation).toBeLessThan(0.35);
      }
    });
  });
});
