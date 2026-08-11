import fs from 'fs';
import path from 'path';
import {
  NATIVE_LANGUAGE_NAMES,
  ENGLISH_LANGUAGE_NAMES,
  LANGUAGE_FLAGS,
  languageLabel,
} from '../../app/utils/languages';
import { availableLanguages } from '../../app/contexts/LocalizationContext';

// Derived from the translations actually shipped, not restated here: a locale
// added to assets/i18n/ then fails this test until it has a name and a flag,
// instead of quietly rendering as a bare code in the language picker.
const SUPPORTED = fs
  .readdirSync(path.join(__dirname, '../../assets/i18n'))
  .filter(f => f.endsWith('.json'))
  .map(f => path.basename(f, '.json'))
  .sort();

describe('language display names', () => {
  it('has a shipped translation to describe', () => {
    expect(SUPPORTED.length).toBeGreaterThan(1);
  });

  it('names and flags every shipped language', () => {
    SUPPORTED.forEach(code => {
      expect(NATIVE_LANGUAGE_NAMES[code]).toBeTruthy();
      expect(ENGLISH_LANGUAGE_NAMES[code]).toBeTruthy();
      expect(LANGUAGE_FLAGS[code]).toBeTruthy();
    });
  });

  it('carries no entry for a language the app cannot render', () => {
    expect(Object.keys(NATIVE_LANGUAGE_NAMES).sort()).toEqual(SUPPORTED);
    expect(Object.keys(ENGLISH_LANGUAGE_NAMES).sort()).toEqual(SUPPORTED);
    expect(Object.keys(LANGUAGE_FLAGS).sort()).toEqual(SUPPORTED);
  });

  it('can actually load every language it names', () => {
    // The first-run picker builds its list from the loader map, so a locale
    // whose JSON ships without a loader would be named nowhere and offered
    // nowhere. This is the assertion that says which one was forgotten.
    expect([...availableLanguages].sort()).toEqual(SUPPORTED);
  });

  it('names each language in its own script', () => {
    expect(NATIVE_LANGUAGE_NAMES.ru).toBe('Русский');
    expect(NATIVE_LANGUAGE_NAMES.hy).toBe('Հայերեն');
    expect(NATIVE_LANGUAGE_NAMES.ja).toBe('日本語');
    expect(NATIVE_LANGUAGE_NAMES.ko).toBe('한국어');
  });

  describe('languageLabel', () => {
    it('pairs the flag with the native name', () => {
      expect(languageLabel('pt')).toBe('🇵🇹  Português');
    });

    it('falls back to the bare code for an unknown language', () => {
      // Better a visible "eo" row than a blank one, if a translation ever ships
      // ahead of its entry here.
      expect(languageLabel('eo')).toBe('eo');
    });
  });
});
