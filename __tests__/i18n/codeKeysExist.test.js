/**
 * Every literal `t('key')` in the app must name a key that exists in en.json.
 *
 * `t()` resolves to `translations[key] || key`, so a missing key renders the
 * raw key ("remove", "account") and a `t('key') || 'Fallback'` guard never
 * reaches its fallback. translationKeyParity only compares locales against
 * en.json; this closes the other side, code against en.json.
 *
 * Dynamic keys (`t(someVariable)`, template literals) are out of reach of a
 * static scan and are not checked here.
 */

import fs from 'fs';
import path from 'path';

import enJson from '../../assets/i18n/en.json';

const APP_DIR = path.join(__dirname, '..', '..', 'app');
const T_CALL = /\bt\(\s*['"]([A-Za-z0-9_.]+)['"]/g;

const listSourceFiles = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
  const full = path.join(dir, entry.name);
  if (entry.isDirectory()) return listSourceFiles(full);
  return /\.(js|jsx|ts|tsx)$/.test(entry.name) ? [full] : [];
});

const collectKeyUsages = () => {
  const usages = [];
  for (const file of listSourceFiles(APP_DIR)) {
    const source = fs.readFileSync(file, 'utf8');
    for (const match of source.matchAll(T_CALL)) {
      usages.push({ key: match[1], file: path.relative(APP_DIR, file) });
    }
  }
  return usages;
};

describe('translation keys used in code', () => {
  const usages = collectKeyUsages();

  it('finds t() calls to check', () => {
    // Guards the scan itself: a broken regex or path would otherwise pass vacuously.
    expect(usages.length).toBeGreaterThan(100);
  });

  it('every literal t() key exists in en.json', () => {
    const missing = usages
      .filter(({ key }) => !Object.prototype.hasOwnProperty.call(enJson, key))
      .map(({ key, file }) => `${key} (${file})`);
    expect(missing).toEqual([]);
  });
});
