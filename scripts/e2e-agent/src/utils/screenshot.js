// scripts/e2e-agent/src/utils/screenshot.js
import sharp from 'sharp';
import { writeFileSync, mkdirSync } from 'fs';
import { dirname } from 'path';

export async function resizeBuffer(buffer, percent) {
  const meta = await sharp(buffer).metadata();
  const width = Math.round(meta.width * percent);
  return sharp(buffer).resize(width).png().toBuffer();
}

export function toBase64(buffer) {
  return buffer.toString('base64');
}

export function savePng(buffer, filePath) {
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, buffer);
}
