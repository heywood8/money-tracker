/**
 * Geometry tests for the notification icon generator.
 *
 * The output is four image files, so nothing about a broken fit shows up in a
 * diff or a stack trace — it shows up as one alert's icon arriving bigger than
 * the other's, months later, on someone's phone. The numbers are pinned here.
 */

const {
  GLYPHS,
  VIEWPORT,
  SMALL_ICON_LIVE_AREA,
  flattenPath,
  fitToLiveArea,
  vectorDrawable,
} = require('../../scripts/generate-notification-icon');

const boundsOf = (contours) => {
  const xs = contours.flat().map(([x]) => x);
  const ys = contours.flat().map(([, y]) => y);
  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys),
  };
};

describe('generate-notification-icon', () => {
  describe('flattenPath', () => {
    it('closes a rectangle into a polygon', () => {
      const [contour] = flattenPath('M2,4H8V10H2V4Z');
      const { minX, maxX, minY, maxY } = boundsOf([contour]);

      expect([minX, maxX, minY, maxY]).toEqual([2, 8, 4, 10]);
    });

    it('keeps a circle inside its own bounding box', () => {
      // Two half-arcs, the shape MDI uses for every coin and clock face.
      const contours = flattenPath('M12,9A3,3 0 0,1 15,12A3,3 0 0,1 12,15Z');
      const { minX, maxX, minY, maxY } = boundsOf(contours);

      expect(minX).toBeCloseTo(12, 1);
      expect(maxX).toBeCloseTo(15, 1);
      expect(minY).toBeCloseTo(9, 1);
      expect(maxY).toBeCloseTo(15, 1);
    });

    it('refuses a command it cannot draw rather than dropping it', () => {
      expect(() => flattenPath('M2,2Q4,4 6,2')).toThrow(/Unsupported path command/);
    });
  });

  describe('fitToLiveArea', () => {
    it('scales the longest side to the live area and centres the glyph', () => {
      const fit = fitToLiveArea(flattenPath('M4,4H8V12H4V4Z'), SMALL_ICON_LIVE_AREA);
      const { minX, maxX, minY, maxY } = boundsOf(fit.contours);

      // Tallest side fills the live area; the narrow one is centred beside it.
      expect(maxY - minY).toBeCloseTo(SMALL_ICON_LIVE_AREA, 4);
      expect(minY).toBeCloseTo((VIEWPORT - SMALL_ICON_LIVE_AREA) / 2, 4);
      expect(minX + maxX).toBeCloseTo(VIEWPORT, 4);
    });

    it('reports a transform that reproduces the fitted contours', () => {
      const contours = flattenPath(GLYPHS.cashCheck);
      const fit = fitToLiveArea(contours, SMALL_ICON_LIVE_AREA);
      const [[rawX, rawY]] = contours[0];
      const [[fittedX, fittedY]] = fit.contours[0];

      expect(rawX * fit.scale + fit.translateX).toBeCloseTo(fittedX, 6);
      expect(rawY * fit.scale + fit.translateY).toBeCloseTo(fittedY, 6);
    });
  });

  describe('the two alert icons', () => {
    // The regression: cash-clock is drawn edge-to-edge in its viewport while
    // cash-check stops well short of it, so shipped as-drawn one alert's icon
    // rendered noticeably larger — and off-centre — beside the other's.
    const fits = [GLYPHS.cashCheck, GLYPHS.cashClock].map((glyph) =>
      boundsOf(fitToLiveArea(flattenPath(glyph), SMALL_ICON_LIVE_AREA).contours),
    );

    it('end up the same optical size', () => {
      const longestSides = fits.map((b) => Math.max(b.maxX - b.minX, b.maxY - b.minY));

      expect(longestSides[0]).toBeCloseTo(SMALL_ICON_LIVE_AREA, 4);
      expect(longestSides[1]).toBeCloseTo(longestSides[0], 4);
    });

    it('end up centred on the same point', () => {
      fits.forEach((b) => {
        expect((b.minX + b.maxX) / 2).toBeCloseTo(VIEWPORT / 2, 4);
        expect((b.minY + b.maxY) / 2).toBeCloseTo(VIEWPORT / 2, 4);
      });
    });

    it('keep Material\'s keyline padding, so neither touches the edge', () => {
      const padding = (VIEWPORT - SMALL_ICON_LIVE_AREA) / 2;

      fits.forEach((b) => {
        expect(b.minX).toBeGreaterThanOrEqual(padding - 1e-6);
        expect(b.minY).toBeGreaterThanOrEqual(padding - 1e-6);
        expect(b.maxX).toBeLessThanOrEqual(VIEWPORT - padding + 1e-6);
        expect(b.maxY).toBeLessThanOrEqual(VIEWPORT - padding + 1e-6);
      });
    });
  });

  describe('vectorDrawable', () => {
    it('applies the fit as a group transform, leaving the artwork untouched', () => {
      const fit = fitToLiveArea(flattenPath(GLYPHS.cashClock), SMALL_ICON_LIVE_AREA);
      const xml = vectorDrawable(GLYPHS.cashClock, fit);

      expect(xml).toContain(`android:pathData="${GLYPHS.cashClock}"`);
      expect(xml).toContain(`android:scaleX="${Number(fit.scale.toFixed(4))}"`);
      expect(xml).toContain(`android:translateX="${Number(fit.translateX.toFixed(4))}"`);
      // Scaling about any other pivot would move the glyph off centre.
      expect(xml).toContain('android:pivotX="0"');
    });

    it('declares the 24dp viewport the drawables are drawn in', () => {
      const fit = fitToLiveArea(flattenPath(GLYPHS.cashCheck), SMALL_ICON_LIVE_AREA);
      const xml = vectorDrawable(GLYPHS.cashCheck, fit);

      expect(xml).toContain(`android:viewportWidth="${VIEWPORT}"`);
      expect(xml).toContain('android:width="24dp"');
    });
  });

  describe('checked-in drawables', () => {
    // The XML is generated but committed, so it can drift from the generator.
    const fs = require('fs');
    const path = require('path');

    it.each([
      ['notification_icon_pending.xml', GLYPHS.cashClock],
      ['notification_icon_added.xml', GLYPHS.cashCheck],
    ])('%s is what the generator produces today', (file, glyph) => {
      const onDisk = fs.readFileSync(
        path.join(__dirname, '../../assets/android-drawables', file),
        'utf8',
      );
      const fit = fitToLiveArea(flattenPath(glyph), SMALL_ICON_LIVE_AREA);

      expect(onDisk).toBe(vectorDrawable(glyph, fit));
    });
  });
});
