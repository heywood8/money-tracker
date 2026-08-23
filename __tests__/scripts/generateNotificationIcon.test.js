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
  MONOCHROME_LIVE_AREA,
  ADAPTIVE_ICON,
  MONOCHROME_ICON,
  MONOCHROME_SIZE,
  decodePng,
  flattenPath,
  fitToLiveArea,
  vectorDrawable,
  mascotSilhouette,
  rasterizeSilhouette,
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

    it('draws a zero-radius arc as the straight line the spec calls for', () => {
      const { maxX, maxY } = boundsOf(flattenPath('M4,4A0,0 0 0,1 12,12Z'));

      expect([maxX, maxY]).toEqual([12, 12]);
    });

    it('omits an arc whose endpoints coincide instead of dividing by zero', () => {
      // It used to divide by zero here, and the NaN travelled all the way into
      // a drawable's transform — where it is a silently broken icon, not a crash.
      const contours = flattenPath('M4,4H12V12H4V4M8,8A2,2 0 1,1 8,8Z');
      const fit = fitToLiveArea(contours, SMALL_ICON_LIVE_AREA);

      expect(contours.flat().every(([x, y]) => Number.isFinite(x) && Number.isFinite(y))).toBe(true);
      expect(Number.isFinite(fit.scale) && Number.isFinite(fit.translateX)).toBe(true);
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

  describe('mascot silhouette (themed launcher icon)', () => {
    const silhouette = mascotSilhouette(ADAPTIVE_ICON);

    /** Count the enclosed empty regions inside a mask — i.e. its holes. */
    const holesIn = ({ width, height, mask }) => {
      const seen = new Uint8Array(width * height);
      const stack = [];
      const flood = (start) => {
        let size = 0;
        stack.push(start);
        seen[start] = 1;
        while (stack.length) {
          const index = stack.pop();
          const x = index % width;
          const y = (index - x) / width;
          size += 1;
          for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const nx = x + dx;
            const ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
            const next = ny * width + nx;
            if (!mask[next] && !seen[next]) {
              seen[next] = 1;
              stack.push(next);
            }
          }
        }
        return size;
      };

      // Drain the background first so what is left is enclosed by the mask.
      for (let x = 0; x < width; x += 1) {
        if (!mask[x] && !seen[x]) flood(x);
        const bottom = (height - 1) * width + x;
        if (!mask[bottom] && !seen[bottom]) flood(bottom);
      }
      const sizes = [];
      for (let i = 0; i < width * height; i += 1) {
        if (!mask[i] && !seen[i]) sizes.push(flood(i));
      }
      return sizes.sort((a, b) => b - a);
    };

    it('finds the character', () => {
      const { bounds, width, height } = silhouette;
      const artWidth = bounds.maxX - bounds.minX + 1;

      // The mascot sits well inside the plate it is drawn on.
      expect(artWidth).toBeGreaterThan(width * 0.3);
      expect(artWidth).toBeLessThan(width * 0.9);
      expect(bounds.maxY - bounds.minY + 1).toBeLessThan(height * 0.9);
    });

    // Without the cut-outs this layer is a filled disc — the same white blob the
    // notification icons exist to avoid. The face is what makes it the mascot.
    it('punches the face out of it', () => {
      const holes = holesIn(silhouette);

      // Two eyes and a smile, at minimum.
      expect(holes.length).toBeGreaterThanOrEqual(3);
      // Each is a real feature, not a stray artefact pixel.
      expect(holes[2]).toBeGreaterThan(100);
    });

    it('keeps the outline and limbs solid', () => {
      const { width, height, mask, bounds } = silhouette;
      let filled = 0;
      for (let i = 0; i < width * height; i += 1) filled += mask[i];
      const box = (bounds.maxX - bounds.minX + 1) * (bounds.maxY - bounds.minY + 1);

      // A silhouette that lost its body to the hole detection would be a thin
      // outline; one that lost its holes would fill the box.
      expect(filled / box).toBeGreaterThan(0.4);
      expect(filled / box).toBeLessThan(0.9);
    });

    it('fits the canvas without touching its edges', () => {
      const pixels = rasterizeSilhouette(silhouette, 64, MONOCHROME_LIVE_AREA);
      const alphaAt = (x, y) => pixels[(y * 64 + x) * 4 + 3];
      let edge = 0;
      for (let i = 0; i < 64; i += 1) {
        edge += alphaAt(i, 0) + alphaAt(i, 63) + alphaAt(0, i) + alphaAt(63, i);
      }

      expect(edge).toBe(0);
      expect(alphaAt(32, 32)).toBeGreaterThan(0);
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

    // Compared through the alpha channel rather than byte-for-byte: deflate
    // output is not stable across Node versions, the pixels are.
    it('monochrome-icon.png is what the generator produces today', () => {
      const onDisk = decodePng(MONOCHROME_ICON);
      const fresh = rasterizeSilhouette(
        mascotSilhouette(ADAPTIVE_ICON),
        MONOCHROME_SIZE,
        MONOCHROME_LIVE_AREA,
      );

      expect(onDisk.width).toBe(MONOCHROME_SIZE);
      let differences = 0;
      for (let i = 3; i < fresh.length; i += 4) {
        if (onDisk.pixels[i] !== fresh[i]) differences += 1;
      }
      expect(differences).toBe(0);
    });
  });
});
