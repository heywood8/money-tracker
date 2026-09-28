/**
 * Every literal translation key in the app must exist in en.json.
 *
 * `t()` resolves to `translations[key] || key`, so a missing key renders the
 * raw key ("remove", "account") and a `t('key') || 'Fallback'` guard never
 * reaches its fallback. translationKeyParity only compares locales against
 * en.json; this closes the other side, code against en.json.
 *
 * Covers `t('key')` and the two wrappers that take a literal key:
 * `label('key', fallback)` (NotificationTemplateEditorPanel) and
 * `translate(language, 'key')` (notificationStrings). Dynamic keys
 * (`t(someVariable)`, template literals) are out of reach of a static scan.
 */

import fs from 'fs';
import path from 'path';

import enJson from '../../assets/i18n/en.json';

const APP_DIR = path.join(__dirname, '..', '..', 'app');
const KEY_CALLS = [
  /\bt\(\s*['"]([A-Za-z0-9_.]+)['"]/g,
  /\blabel\(\s*['"]([A-Za-z0-9_.]+)['"]/g,
  /\btranslate\(\s*[A-Za-z_$][\w$]*\s*,\s*['"]([A-Za-z0-9_.]+)['"]/g,
];

const listSourceFiles = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
  const full = path.join(dir, entry.name);
  if (entry.isDirectory()) return listSourceFiles(full);
  return /\.(js|jsx|ts|tsx)$/.test(entry.name) ? [full] : [];
});

const collectKeyUsages = () => {
  const usages = [];
  for (const file of listSourceFiles(APP_DIR)) {
    const source = fs.readFileSync(file, 'utf8');
    for (const pattern of KEY_CALLS) {
      for (const match of source.matchAll(pattern)) {
        usages.push({ key: match[1], file: path.relative(APP_DIR, file) });
      }
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

  it('reads the key from t(), label() and translate() calls', () => {
    const sample = "t('a_key'); label('b_key', 'B'); translate(language, 'c_key');";
    const keys = KEY_CALLS.flatMap(pattern => [...sample.matchAll(pattern)].map(match => match[1]));
    expect(keys).toEqual(['a_key', 'b_key', 'c_key']);
  });

  it('every literal key has a non-empty value in en.json', () => {
    // An empty string is as good as missing: `translations[key] || key`
    // falls through to the raw key.
    const missing = usages
      .filter(({ key }) => typeof enJson[key] !== 'string' || enJson[key] === '')
      .map(({ key, file }) => `${key} (${file})`);
    expect(missing).toEqual([]);
  });
});
