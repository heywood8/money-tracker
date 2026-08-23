#!/usr/bin/env node
/**
 * Generates Penny's monochrome Android icon assets.
 *
 * Since API 21 Android draws a notification's small icon as an *alpha mask*:
 * every non-transparent pixel is painted flat white and the colour is discarded.
 * Penny's launcher icon is a mascot on a filled disc, so masking it produced a
 * featureless white circle in the status bar — the bug this script exists to fix.
 * A notification icon has to be authored the other way round: a shape carried by
 * its silhouette, with the detail cut *out* of it.
 *
 * Four assets come out of here:
 *
 *   assets/notification-icon.png                          96x96   default small icon
 *   assets/android-drawables/notification_icon_added.xml   vector  "operations added"
 *   assets/android-drawables/notification_icon_pending.xml vector  "waiting for review"
 *   assets/monochrome-icon.png                            592x592 themed launcher icon
 *
 * The two alerts get *different* icons because they ask for different things —
 * one is a receipt, the other is a task — and the status bar is where that
 * difference is worth reading before the shade is even opened. Android picks the
 * small icon per notification, but expo-notifications only exposes one app-wide
 * icon via its config plugin, so the per-notification choice is made natively;
 * see plugins/withNotificationIcons.js.
 *
 * The variants are Android vector drawables (crisp at every density, one file
 * each) while the two PNGs exist because the config plugins that consume them —
 * expo-notifications' `icon` prop and `android.adaptiveIcon.monochromeImage` —
 * take raster input and generate the density buckets themselves.
 *
 * The themed launcher icon is a different job with the same constraint: Android
 * 13+ paints that layer in one colour drawn from the wallpaper, so it too has to
 * survive as a silhouette. It is not drawn here — it is *extracted* from
 * assets/adaptive-icon.png, so the themed icon stays Penny's own mascot and
 * follows the artwork if the artwork is ever redrawn.
 *
 * Artwork: the notification glyphs are Material Design Icons
 * (github.com/Templarian/MaterialDesign), Apache License 2.0 — the unmodified
 * 24x24 path data of `cash-multiple`, `cash-check` and `cash-clock`.
 *
 * Regenerate (only needed when the artwork changes):
 *
 *   node scripts/generate-notification-icon.js
 *
 * Pure Node: rasterization, PNG decoding and PNG encoding are all done here
 * (zlib + CRC32) rather than pulling in an image dependency for four files that
 * rarely change.
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const ASSETS_DIR = path.join(__dirname, '..', 'assets');
const DRAWABLES_DIR = path.join(ASSETS_DIR, 'android-drawables');

/** Material Design Icons path data, in the icons' own 24x24 viewport. */
const GLYPHS = {
  // Stacked banknotes. The fallback icon for any notification the native
  // override does not recognise; the offset second note keeps enough negative
  // space to stay a banknote rather than a white block at 24dp.
  cashMultiple: 'M5,6H23V18H5V6M14,9A3,3 0 0,1 17,12A3,3 0 0,1 14,15A3,3 0 0,1 11,12A3,3 0 0,1 14,9M9,8A2,2 0 0,1 7,10V14A2,2 0 0,1 9,16H19A2,2 0 0,1 21,14V10A2,2 0 0,1 19,8H9M1,10H3V20H19V22H1V10Z',
  // Banknote + tick: operations the background run booked on its own. Done.
  cashCheck: 'M3 6V18H13.32C13.1 17.33 13 16.66 13 16H7C7 14.9 6.11 14 5 14V10C6.11 10 7 9.11 7 8H17C17 9.11 17.9 10 19 10V10.06C19.67 10.06 20.34 10.18 21 10.4V6H3M12 9C10.3 9.03 9 10.3 9 12C9 13.7 10.3 14.94 12 15C12.38 15 12.77 14.92 13.14 14.77C13.41 13.67 13.86 12.63 14.97 11.61C14.85 10.28 13.59 8.97 12 9M21.63 12.27L17.76 16.17L16.41 14.8L15 16.22L17.75 19L23.03 13.68L21.63 12.27Z',
  // Banknote + clock: transactions parked in the review queue. Waiting on you.
  cashClock: 'M17.5 16.82L19.94 18.23L19.19 19.53L16 17.69V14H17.5V16.82M24 17C24 20.87 20.87 24 17 24S10 20.87 10 17C10 16.66 10.03 16.33 10.08 16H2V4H20V10.68C22.36 11.81 24 14.21 24 17M10.68 14C10.86 13.64 11.05 13.3 11.28 12.97C11.19 13 11.1 13 11 13C9.34 13 8 11.66 8 10S9.34 7 11 7 14 8.34 14 10C14 10.25 13.96 10.5 13.9 10.73C14.84 10.27 15.89 10 17 10C17.34 10 17.67 10.03 18 10.08V8C16.9 8 16 7.11 16 6H6C6 7.11 5.11 8 4 8V12C5.11 12 6 12.9 6 14H10.68M22 17C22 14.24 19.76 12 17 12S12 14.24 12 17 14.24 22 17 22 22 19.76 22 17Z',
};

const VIEWPORT = 24;

// ---------------------------------------------------------------------------
// SVG path -> polygons
// ---------------------------------------------------------------------------

/** Curve/arc flattening resolution. 24 segments is well past what 96px shows. */
const CURVE_STEPS = 24;

/**
 * Flatten an SVG path into closed polygons (arrays of [x, y] points).
 *
 * Supports the commands Material Design Icons actually emits — M, L, H, V, C, S,
 * A, Z in both absolute and relative form — and throws on anything else rather
 * than silently dropping part of a glyph.
 *
 * @param {string} d - the `d` attribute of an SVG path
 * @returns {Array<Array<[number, number]>>}
 */
const flattenPath = (d) => {
  // Any letter is tokenized as a command, not just the supported ones: an
  // unsupported command has to reach the `else` below and throw rather than
  // fall through the regex and let its coordinates continue the previous one.
  const tokens = d.match(/[A-Za-z]|-?\d*\.?\d+(?:e[-+]?\d+)?/g) || [];
  const contours = [];
  let index = 0;
  let contour = null;
  let x = 0;
  let y = 0;
  let startX = 0;
  let startY = 0;
  let prevControlX = 0;
  let prevControlY = 0;
  let command = null;

  const num = () => parseFloat(tokens[index++]);
  const push = (px, py) => contour.push([px, py]);

  const cubicTo = (x1, y1, x2, y2, x3, y3) => {
    for (let step = 1; step <= CURVE_STEPS; step += 1) {
      const t = step / CURVE_STEPS;
      const mt = 1 - t;
      push(
        mt * mt * mt * x + 3 * mt * mt * t * x1 + 3 * mt * t * t * x2 + t * t * t * x3,
        mt * mt * mt * y + 3 * mt * mt * t * y1 + 3 * mt * t * t * y2 + t * t * t * y3,
      );
    }
  };

  // Endpoint -> centre parameterisation, per the SVG implementation notes.
  const arcTo = (rxIn, ryIn, rotation, largeArc, sweep, endX, endY) => {
    // Both degenerate cases are spelled out by the spec: a zero radius draws a
    // straight line, and coincident endpoints omit the arc entirely. Neither can
    // go through the maths below — the second divides by zero, which would put
    // NaN into the contours and from there into a drawable's transform.
    if (rxIn === 0 || ryIn === 0) {
      push(endX, endY);
      return;
    }
    if (x === endX && y === endY) return;
    let rx = Math.abs(rxIn);
    let ry = Math.abs(ryIn);
    const phi = (rotation * Math.PI) / 180;
    const cosPhi = Math.cos(phi);
    const sinPhi = Math.sin(phi);
    const dx = (x - endX) / 2;
    const dy = (y - endY) / 2;
    const x1 = cosPhi * dx + sinPhi * dy;
    const y1 = -sinPhi * dx + cosPhi * dy;
    const oversize = (x1 * x1) / (rx * rx) + (y1 * y1) / (ry * ry);
    if (oversize > 1) {
      const scale = Math.sqrt(oversize);
      rx *= scale;
      ry *= scale;
    }
    const numerator = Math.max(
      0,
      rx * rx * ry * ry - rx * rx * y1 * y1 - ry * ry * x1 * x1,
    );
    const denominator = rx * rx * y1 * y1 + ry * ry * x1 * x1;
    const factor = (largeArc !== sweep ? 1 : -1) * Math.sqrt(numerator / denominator);
    const cx1 = (factor * rx * y1) / ry;
    const cy1 = (-factor * ry * x1) / rx;
    const cx = cosPhi * cx1 - sinPhi * cy1 + (x + endX) / 2;
    const cy = sinPhi * cx1 + cosPhi * cy1 + (y + endY) / 2;

    const angle = (ux, uy, vx, vy) => {
      const dot = ux * vx + uy * vy;
      const length = Math.hypot(ux, uy) * Math.hypot(vx, vy);
      const value = Math.acos(Math.max(-1, Math.min(1, dot / length)));
      return ux * vy - uy * vx < 0 ? -value : value;
    };

    const startAngle = angle(1, 0, (x1 - cx1) / rx, (y1 - cy1) / ry);
    let sweepAngle = angle(
      (x1 - cx1) / rx,
      (y1 - cy1) / ry,
      (-x1 - cx1) / rx,
      (-y1 - cy1) / ry,
    );
    if (!sweep && sweepAngle > 0) sweepAngle -= 2 * Math.PI;
    if (sweep && sweepAngle < 0) sweepAngle += 2 * Math.PI;

    const steps = Math.max(6, Math.ceil((Math.abs(sweepAngle) / Math.PI) * CURVE_STEPS));
    for (let step = 1; step <= steps; step += 1) {
      const theta = startAngle + (sweepAngle * step) / steps;
      const ex = Math.cos(theta) * rx;
      const ey = Math.sin(theta) * ry;
      push(cosPhi * ex - sinPhi * ey + cx, sinPhi * ex + cosPhi * ey + cy);
    }
  };

  while (index < tokens.length) {
    if (/[A-Za-z]/.test(tokens[index])) command = tokens[index++];
    const relative = command === command.toLowerCase();
    const absolute = command.toUpperCase();

    if (absolute === 'M') {
      if (contour && contour.length > 1) contours.push(contour);
      const nx = num();
      const ny = num();
      x = relative ? x + nx : nx;
      y = relative ? y + ny : ny;
      startX = x;
      startY = y;
      contour = [[x, y]];
      // A second coordinate pair after M continues as an implicit lineto.
      command = relative ? 'l' : 'L';
    } else if (absolute === 'L') {
      const nx = num();
      const ny = num();
      x = relative ? x + nx : nx;
      y = relative ? y + ny : ny;
      push(x, y);
    } else if (absolute === 'H') {
      const nx = num();
      x = relative ? x + nx : nx;
      push(x, y);
    } else if (absolute === 'V') {
      const ny = num();
      y = relative ? y + ny : ny;
      push(x, y);
    } else if (absolute === 'C' || absolute === 'S') {
      let x1;
      let y1;
      if (absolute === 'C') {
        const a = num();
        const b = num();
        x1 = relative ? x + a : a;
        y1 = relative ? y + b : b;
      } else {
        // Smooth curve: reflect the previous control point about the current one.
        x1 = 2 * x - prevControlX;
        y1 = 2 * y - prevControlY;
      }
      const c = num();
      const e = num();
      const f = num();
      const g = num();
      const x2 = relative ? x + c : c;
      const y2 = relative ? y + e : e;
      const x3 = relative ? x + f : f;
      const y3 = relative ? y + g : g;
      cubicTo(x1, y1, x2, y2, x3, y3);
      prevControlX = x2;
      prevControlY = y2;
      x = x3;
      y = y3;
      continue;
    } else if (absolute === 'A') {
      const rx = num();
      const ry = num();
      const rotation = num();
      const largeArc = num();
      const sweep = num();
      const a = num();
      const b = num();
      const endX = relative ? x + a : a;
      const endY = relative ? y + b : b;
      arcTo(rx, ry, rotation, largeArc, sweep, endX, endY);
      x = endX;
      y = endY;
    } else if (absolute === 'Z') {
      if (contour && contour.length > 1) contours.push(contour);
      x = startX;
      y = startY;
      contour = [[x, y]];
    } else {
      throw new Error(`Unsupported path command: ${command}`);
    }

    prevControlX = x;
    prevControlY = y;
  }

  if (contour && contour.length > 1) contours.push(contour);
  return contours;
};

/**
 * Non-zero winding test — the SVG (and Android) default fill rule, and what makes
 * the holes in these glyphs holes.
 *
 * @param {Array<Array<[number, number]>>} contours
 * @param {number} x
 * @param {number} y
 * @returns {boolean}
 */
const isFilled = (contours, x, y) => {
  let winding = 0;
  for (const contour of contours) {
    for (let i = 0; i < contour.length; i += 1) {
      const [x0, y0] = contour[i];
      const [x1, y1] = contour[(i + 1) % contour.length];
      const side = (x1 - x0) * (y - y0) - (x - x0) * (y1 - y0);
      if (y0 <= y) {
        if (y1 > y && side > 0) winding += 1;
      } else if (y1 <= y && side < 0) {
        winding -= 1;
      }
    }
  }
  return winding !== 0;
};

// ---------------------------------------------------------------------------
// Optical normalization
// ---------------------------------------------------------------------------

/**
 * Every glyph is fitted to the same live area before it is written out.
 *
 * The icons are not drawn to a common bounding box: `cash-clock` runs to the very
 * edge of its 24x24 viewport while `cash-check` stops well short of it. Left as
 * drawn, and scaled CENTER_INSIDE the way the status bar scales small icons, the
 * two alerts would arrive at visibly different sizes and off-centre from each
 * other — the one thing a pair of icons meant to be told apart cannot afford.
 * Fitting the *ink* rather than the viewport makes them a set.
 *
 * @param {Array<Array<[number, number]>>} contours
 * @param {number} liveArea - target size of the glyph's longest side, in viewport units
 * @returns {{ contours: Array<Array<[number, number]>>, scale: number, translateX: number, translateY: number }}
 */
const fitToLiveArea = (contours, liveArea) => {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const contour of contours) {
    for (const [x, y] of contour) {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }

  const width = maxX - minX;
  const height = maxY - minY;
  const scale = liveArea / Math.max(width, height);
  const translateX = (VIEWPORT - scale * width) / 2 - scale * minX;
  const translateY = (VIEWPORT - scale * height) / 2 - scale * minY;

  return {
    contours: contours.map((contour) =>
      contour.map(([x, y]) => [x * scale + translateX, y * scale + translateY]),
    ),
    scale,
    translateX,
    translateY,
  };
};

// ---------------------------------------------------------------------------
// Rasterization
// ---------------------------------------------------------------------------

/** Samples per axis per pixel; 6 gives 36 coverage steps, plenty for edges. */
const SUPERSAMPLE = 6;

/**
 * Render fitted contours to an RGBA buffer: white throughout, with the shape
 * carried entirely by the alpha channel — all the notification mask reads, and
 * what lets the themed launcher layer be tinted any colour.
 *
 * @param {Array<Array<[number, number]>>} contours - already fitted to the viewport
 * @param {number} size - canvas edge in pixels
 * @returns {Buffer}
 */
const rasterize = (contours, size) => {
  const pixels = Buffer.alloc(size * size * 4);
  const step = 1 / SUPERSAMPLE;
  const samples = SUPERSAMPLE * SUPERSAMPLE;

  for (let py = 0; py < size; py += 1) {
    for (let px = 0; px < size; px += 1) {
      let hits = 0;
      for (let sy = 0; sy < SUPERSAMPLE; sy += 1) {
        for (let sx = 0; sx < SUPERSAMPLE; sx += 1) {
          const ux = ((px + (sx + 0.5) * step) / size) * VIEWPORT;
          const uy = ((py + (sy + 0.5) * step) / size) * VIEWPORT;
          if (isFilled(contours, ux, uy)) hits += 1;
        }
      }
      const offset = (py * size + px) * 4;
      pixels[offset] = 255;
      pixels[offset + 1] = 255;
      pixels[offset + 2] = 255;
      pixels[offset + 3] = Math.round((hits / samples) * 255);
    }
  }
  return pixels;
};

// ---------------------------------------------------------------------------
// PNG encoding
// ---------------------------------------------------------------------------

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c;
  }
  return table;
})();

const crc32 = (buffer) => {
  let c = 0xffffffff;
  for (let i = 0; i < buffer.length; i += 1) {
    c = CRC_TABLE[(c ^ buffer[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
};

const pngChunk = (type, data) => {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([length, body, crc]);
};

/**
 * Encode an RGBA buffer as a PNG (8-bit, colour type 6, no filtering).
 *
 * @param {Buffer} pixels - size*size*4 bytes
 * @param {number} size
 * @returns {Buffer}
 */
const encodePng = (pixels, size) => {
  const stride = size * 4;
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y += 1) {
    raw[y * (stride + 1)] = 0; // filter: none
    pixels.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0; // deflate
  ihdr[11] = 0; // adaptive filtering
  ihdr[12] = 0; // no interlace

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
};

// ---------------------------------------------------------------------------
// Mascot silhouette
// ---------------------------------------------------------------------------

/**
 * Decode an 8-bit RGBA PNG into a flat pixel buffer.
 *
 * Handles what the project's own assets are (colour type 6, no interlacing) and
 * refuses anything else rather than returning quietly wrong pixels.
 *
 * @param {string} file
 * @returns {{ width: number, height: number, pixels: Buffer }}
 */
const decodePng = (file) => {
  const png = fs.readFileSync(file);
  let offset = 8; // skip the signature
  let width = 0;
  let height = 0;
  const data = [];

  while (offset < png.length) {
    const length = png.readUInt32BE(offset);
    const type = png.toString('ascii', offset + 4, offset + 8);
    const chunk = png.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') {
      width = chunk.readUInt32BE(0);
      height = chunk.readUInt32BE(4);
      if (chunk[8] !== 8 || chunk[9] !== 6 || chunk[12] !== 0) {
        throw new Error(`${file}: expected an 8-bit RGBA non-interlaced PNG`);
      }
    } else if (type === 'IDAT') {
      data.push(chunk);
    }
    offset += 12 + length;
  }

  const raw = zlib.inflateSync(Buffer.concat(data));
  const stride = width * 4;
  const pixels = Buffer.alloc(height * stride);
  let read = 0;

  // Undo the per-row filter. Each byte is predicted from the one to its left
  // (a), above (b) and above-left (c); see the PNG spec, "Filtering".
  for (let y = 0; y < height; y += 1) {
    const filter = raw[read];
    read += 1;
    for (let i = 0; i < stride; i += 1) {
      const value = raw[read + i];
      const a = i >= 4 ? pixels[y * stride + i - 4] : 0;
      const b = y > 0 ? pixels[(y - 1) * stride + i] : 0;
      const c = i >= 4 && y > 0 ? pixels[(y - 1) * stride + i - 4] : 0;
      let restored;
      switch (filter) {
      case 0: restored = value; break;
      case 1: restored = value + a; break;
      case 2: restored = value + b; break;
      case 3: restored = value + ((a + b) >> 1); break;
      case 4: {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        restored = value + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c);
        break;
      }
      default: throw new Error(`${file}: unknown row filter ${filter}`);
      }
      pixels[y * stride + i] = restored & 0xff;
    }
    read += stride;
  }

  return { width, height, pixels };
};

/**
 * How the mascot artwork is read. The character is drawn in warm colours (orange
 * fill, brown line work) on a cold near-black plate, which is what these two
 * thresholds separate — no colour is matched exactly, so a re-coloured mascot
 * still comes out right.
 */
const PLATE_MAX_CHANNEL = 90; // the plate is dark…
const LINE_WORK_LUMA = 110; // …and the line work is darker than the fill

/**
 * Extract the mascot as a one-bit silhouette: the character solid, its face cut
 * out of it.
 *
 * The whole point is the cut-outs. Flattened naively, the mascot is a filled
 * disc — the very white blob this script exists to avoid — so the eyes and smile
 * have to become holes. They are found structurally rather than by position: the
 * dark line work is grouped into connected regions, and a region is a hole when
 * it is fully enclosed by the character. The outline and the limbs touch the
 * outside and stay solid; the eyes, lashes and smile do not and are punched out.
 *
 * @param {string} file - the adaptive icon's foreground artwork
 * @returns {{ width: number, height: number, mask: Uint8Array, bounds: { minX: number, minY: number, maxX: number, maxY: number } }}
 */
const mascotSilhouette = (file) => {
  const { width, height, pixels } = decodePng(file);
  const count = width * height;
  const isCharacter = new Uint8Array(count);
  const isLineWork = new Uint8Array(count);

  for (let i = 0; i < count; i += 1) {
    const r = pixels[i * 4];
    const g = pixels[i * 4 + 1];
    const b = pixels[i * 4 + 2];
    if (pixels[i * 4 + 3] < 128) continue;
    if (b >= r && Math.max(r, g, b) < PLATE_MAX_CHANNEL) continue; // the plate
    isCharacter[i] = 1;
    if (0.299 * r + 0.587 * g + 0.114 * b < LINE_WORK_LUMA) isLineWork[i] = 1;
  }

  // Flood the background in from the border. Anything it cannot reach is inside
  // the character — which also fills the stray specks the artwork's own
  // anti-aliasing leaves behind, instead of pitting the silhouette with them.
  const outside = new Uint8Array(count);
  const queue = [];
  const visit = (index) => {
    if (!isCharacter[index] && !outside[index]) {
      outside[index] = 1;
      queue.push(index);
    }
  };
  for (let x = 0; x < width; x += 1) {
    visit(x);
    visit((height - 1) * width + x);
  }
  for (let y = 0; y < height; y += 1) {
    visit(y * width);
    visit(y * width + width - 1);
  }
  while (queue.length) {
    const index = queue.pop();
    const x = index % width;
    const y = (index - x) / width;
    if (x > 0) visit(index - 1);
    if (x < width - 1) visit(index + 1);
    if (y > 0) visit(index - width);
    if (y < height - 1) visit(index + width);
  }

  // Group the line work, tracking whether each group reaches the outside.
  const group = new Int32Array(count).fill(-1);
  const reachesOutside = [];
  const groupSize = [];
  for (let start = 0; start < count; start += 1) {
    if (!isLineWork[start] || group[start] >= 0) continue;
    const id = reachesOutside.length;
    reachesOutside.push(false);
    groupSize.push(0);
    group[start] = id;
    queue.push(start);
    while (queue.length) {
      const index = queue.pop();
      const x = index % width;
      const y = (index - x) / width;
      groupSize[id] += 1;
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) {
            reachesOutside[id] = true;
            continue;
          }
          const neighbour = ny * width + nx;
          if (outside[neighbour]) reachesOutside[id] = true;
          else if (isLineWork[neighbour] && group[neighbour] < 0) {
            group[neighbour] = id;
            queue.push(neighbour);
          }
        }
      }
    }
  }

  // A few pixels of enclosed line work is a compression artefact, not a feature.
  const minimumFeature = Math.round(count * 0.00005);
  const isHole = (id) => !reachesOutside[id] && groupSize[id] >= minimumFeature;

  const mask = new Uint8Array(count);
  const bounds = { minX: width, minY: height, maxX: -1, maxY: -1 };
  for (let i = 0; i < count; i += 1) {
    if (outside[i]) continue;
    const x = i % width;
    const y = (i - x) / width;
    if (x < bounds.minX) bounds.minX = x;
    if (x > bounds.maxX) bounds.maxX = x;
    if (y < bounds.minY) bounds.minY = y;
    if (y > bounds.maxY) bounds.maxY = y;
    if (group[i] >= 0 && isHole(group[i])) continue;
    mask[i] = 1;
  }

  if (bounds.maxX < 0) throw new Error(`${file}: found no artwork to extract`);
  return { width, height, mask, bounds };
};

/**
 * Draw a silhouette onto a square canvas, fitted to the live area the same way
 * `fitToLiveArea` fits a path — same rule, different input.
 *
 * @param {{ width: number, height: number, mask: Uint8Array, bounds: object }} silhouette
 * @param {number} size - canvas edge in pixels
 * @param {number} liveArea - target size of the glyph's longest side, in viewport units
 * @returns {Buffer}
 */
const rasterizeSilhouette = (silhouette, size, liveArea) => {
  const { width, height, mask, bounds } = silhouette;
  const artWidth = bounds.maxX - bounds.minX + 1;
  const artHeight = bounds.maxY - bounds.minY + 1;
  const target = (size * liveArea) / VIEWPORT;
  const scale = target / Math.max(artWidth, artHeight);
  const originX = (size - artWidth * scale) / 2;
  const originY = (size - artHeight * scale) / 2;

  const pixels = Buffer.alloc(size * size * 4);
  const step = 1 / SUPERSAMPLE;
  const samples = SUPERSAMPLE * SUPERSAMPLE;

  for (let py = 0; py < size; py += 1) {
    for (let px = 0; px < size; px += 1) {
      let hits = 0;
      for (let sy = 0; sy < SUPERSAMPLE; sy += 1) {
        for (let sx = 0; sx < SUPERSAMPLE; sx += 1) {
          const ax = Math.floor((px + (sx + 0.5) * step - originX) / scale) + bounds.minX;
          const ay = Math.floor((py + (sy + 0.5) * step - originY) / scale) + bounds.minY;
          if (ax >= 0 && ay >= 0 && ax < width && ay < height && mask[ay * width + ax]) {
            hits += 1;
          }
        }
      }
      const offset = (py * size + px) * 4;
      pixels[offset] = 255;
      pixels[offset + 1] = 255;
      pixels[offset + 2] = 255;
      pixels[offset + 3] = Math.round((hits / samples) * 255);
    }
  }
  return pixels;
};

// ---------------------------------------------------------------------------
// Vector drawable
// ---------------------------------------------------------------------------

/** Four decimals: past what a 24dp icon can show, short enough to read. */
const round = (value) => Number(value.toFixed(4));

/**
 * Wrap path data in an Android vector drawable, fitted by a <group> transform
 * rather than by rewriting the coordinates: the path stays the artwork as
 * shipped, and the fit stays readable next to it.
 *
 * White fill — the status bar masks it anyway, and the shade tints it with the
 * notification's accent colour.
 *
 * @param {string} pathData
 * @param {{ scale: number, translateX: number, translateY: number }} fit
 * @returns {string}
 */
const vectorDrawable = (pathData, fit) => `<?xml version="1.0" encoding="utf-8"?>
<!-- Generated by scripts/generate-notification-icon.js — do not edit by hand. -->
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="24dp"
    android:height="24dp"
    android:viewportWidth="${VIEWPORT}"
    android:viewportHeight="${VIEWPORT}">
  <group
      android:pivotX="0"
      android:pivotY="0"
      android:scaleX="${round(fit.scale)}"
      android:scaleY="${round(fit.scale)}"
      android:translateX="${round(fit.translateX)}"
      android:translateY="${round(fit.translateY)}">
    <path
        android:fillColor="#FFFFFFFF"
        android:pathData="${pathData}" />
  </group>
</vector>
`;

// ---------------------------------------------------------------------------

/**
 * Material's live area for a 24dp system icon: a 20dp square inside the 24dp
 * canvas. The padding is what keeps the glyph off the edge of the status bar.
 */
const SMALL_ICON_LIVE_AREA = 20;

/**
 * Themed launcher icons are masked to an arbitrary shape, so the glyph has to
 * stay inside the adaptive safe zone — the inner ~66% of the canvas. 13.5 of 24
 * leaves margin on top of that for the roundest masks.
 */
const MONOCHROME_LIVE_AREA = 13.5;

const PNG_TARGETS = [
  {
    // The 24dp status-bar icon at its largest density: expo-notifications scales
    // a 24px baseline into every bucket, so 96px is the xxxhdpi one and every
    // other bucket is downscaled from it.
    file: path.join(ASSETS_DIR, 'notification-icon.png'),
    glyph: GLYPHS.cashMultiple,
    size: 96,
    liveArea: SMALL_ICON_LIVE_AREA,
  },
];

/** Source and destination for the themed launcher icon. */
const ADAPTIVE_ICON = path.join(ASSETS_DIR, 'adaptive-icon.png');
const MONOCHROME_ICON = path.join(ASSETS_DIR, 'monochrome-icon.png');

/** Themed launcher layers keep the adaptive icon's canvas. */
const MONOCHROME_SIZE = 592;

const VECTOR_TARGETS = [
  { file: path.join(DRAWABLES_DIR, 'notification_icon_added.xml'), glyph: GLYPHS.cashCheck },
  { file: path.join(DRAWABLES_DIR, 'notification_icon_pending.xml'), glyph: GLYPHS.cashClock },
];

const generate = () => {
  fs.mkdirSync(DRAWABLES_DIR, { recursive: true });

  for (const target of PNG_TARGETS) {
    const fit = fitToLiveArea(flattenPath(target.glyph), target.liveArea);
    const png = encodePng(rasterize(fit.contours, target.size), target.size);
    fs.writeFileSync(target.file, png);
    console.log(`wrote ${path.relative(process.cwd(), target.file)} (${target.size}x${target.size}, ${png.length} bytes)`);
  }

  for (const target of VECTOR_TARGETS) {
    const fit = fitToLiveArea(flattenPath(target.glyph), SMALL_ICON_LIVE_AREA);
    fs.writeFileSync(target.file, vectorDrawable(target.glyph, fit));
    console.log(`wrote ${path.relative(process.cwd(), target.file)}`);
  }

  const silhouette = mascotSilhouette(ADAPTIVE_ICON);
  const monochrome = encodePng(
    rasterizeSilhouette(silhouette, MONOCHROME_SIZE, MONOCHROME_LIVE_AREA),
    MONOCHROME_SIZE,
  );
  fs.writeFileSync(MONOCHROME_ICON, monochrome);
  console.log(`wrote ${path.relative(process.cwd(), MONOCHROME_ICON)} (${MONOCHROME_SIZE}x${MONOCHROME_SIZE}, ${monochrome.length} bytes)`);
};

if (require.main === module) {
  generate();
}

// Exported for the tests that pin the geometry — the fitting is what keeps the
// two alert icons the same optical size, and nothing about the rendered PNG
// shows when it stops.
module.exports = {
  GLYPHS,
  VIEWPORT,
  SMALL_ICON_LIVE_AREA,
  MONOCHROME_LIVE_AREA,
  ADAPTIVE_ICON,
  MONOCHROME_SIZE,
  MONOCHROME_ICON,
  decodePng,
  flattenPath,
  fitToLiveArea,
  vectorDrawable,
  mascotSilhouette,
  rasterizeSilhouette,
  generate,
};
