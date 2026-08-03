/**
 * Key parity across the 11 locale files.
 *
 * `t()` resolves to `translations[key] || key` (LocalizationContext), so there
 * is no English fallback: a key present in en.json but missing from another
 * locale renders the raw key string ("show_archived_accounts") to the user.
 * Nothing else in CI catches that, which makes a partial rename or a
 * half-applied new string silently ship broken copy in 10 languages.
 */

import fs from 'fs';
import path from 'path';

// Suffixed names on purpose: a bare `it` import would shadow Jest's global.
import deJson from '../../assets/i18n/de.json';
import enJson from '../../assets/i18n/en.json';
import esJson from '../../assets/i18n/es.json';
import frJson from '../../assets/i18n/fr.json';
import hyJson from '../../assets/i18n/hy.json';
import itJson from '../../assets/i18n/it.json';
import jaJson from '../../assets/i18n/ja.json';
import koJson from '../../assets/i18n/ko.json';
import ptJson from '../../assets/i18n/pt.json';
import ruJson from '../../assets/i18n/ru.json';
import zhJson from '../../assets/i18n/zh.json';

const TRANSLATED = {
  de: deJson,
  es: esJson,
  fr: frJson,
  hy: hyJson,
  it: itJson,
  ja: jaJson,
  ko: koJson,
  pt: ptJson,
  ru: ruJson,
  zh: zhJson,
};
const ALL = { en: enJson, ...TRANSLATED };
const enKeys = Object.keys(enJson);

describe('i18n translation key parity', () => {
  describe.each(Object.keys(ALL))('%s.json', (lang) => {
    it('declares no duplicate keys', () => {
      // JSON.parse silently keeps the last duplicate, so scan the raw text.
      const raw = fs.readFileSync(
        path.join(__dirname, `../../assets/i18n/${lang}.json`),
        'utf8',
      );
      const declared = [...raw.matchAll(/^\s*"([^"]+)":/gm)].map((m) => m[1]);
      const seen = new Set();
      const duplicates = declared.filter((key) => {
        if (seen.has(key)) return true;
        seen.add(key);
        return false;
      });
      expect(duplicates).toEqual([]);
    });

    it('has a non-empty string for every key', () => {
      const blank = Object.entries(ALL[lang])
        .filter(([, value]) => typeof value !== 'string' || value.trim() === '')
        .map(([key]) => key);
      expect(blank).toEqual([]);
    });
  });

  // Pre-existing gaps, untranslated in every locale but en/ru. Listed rather
  // than skipped so the check below still fails on any NEW missing key; shrink
  // this list as the strings get translated, never grow it.
  const KNOWN_UNTRANSLATED = [
    'resetting_database',
    'database_reset_done',
    'google_sheets_setup_export_now',
  ];

  describe.each(Object.keys(TRANSLATED))('%s.json vs en.json', (lang) => {
    it('defines every key present in en.json', () => {
      const missing = enKeys.filter(
        (key) => !(key in TRANSLATED[lang]) && !KNOWN_UNTRANSLATED.includes(key),
      );
      expect(missing).toEqual([]);
    });

    it('defines no keys absent from en.json', () => {
      const extra = Object.keys(TRANSLATED[lang]).filter((key) => !(key in enJson));
      expect(extra).toEqual([]);
    });
  });

  describe('archived accounts', () => {
    const ARCHIVED_KEYS = [
      'archived_account',
      'archived_account_hint',
      'show_archived_accounts',
      'hide_archived_accounts',
    ];
    // The pre-rename names. Guards against a locale being reverted or a stale
    // file reintroducing the old wording.
    const OLD_KEYS = [
      'hidden_account',
      'hidden_account_hint',
      'show_hidden_accounts',
      'hide_hidden_accounts',
    ];

    it.each(Object.keys(ALL))('%s.json uses the archived_* keys', (lang) => {
      ARCHIVED_KEYS.forEach((key) => expect(typeof ALL[lang][key]).toBe('string'));
      OLD_KEYS.forEach((key) => expect(ALL[lang][key]).toBeUndefined());
    });
  });
});
