// The display identity of each supported language: its name written in itself,
// and its flag. Shared by the language subpanel and the settings row that shows
// the current choice, so the two cannot drift apart.
//
// A language is named in its own script deliberately — someone who has the app
// in a language they cannot read needs to recognise their own language in the
// list, and "Armenian" does not help them; "Հայերեն" does.

export const NATIVE_LANGUAGE_NAMES = {
  en: 'English',
  ru: 'Русский',
  zh: '中文',
  es: 'Español',
  fr: 'Français',
  de: 'Deutsch',
  it: 'Italiano',
  hy: 'Հայերեն',
  ja: '日本語',
  ko: '한국어',
  pt: 'Português',
};

export const LANGUAGE_FLAGS = {
  en: '🇬🇧',
  ru: '🇷🇺',
  zh: '🇨🇳',
  es: '🇪🇸',
  fr: '🇫🇷',
  de: '🇩🇪',
  it: '🇮🇹',
  hy: '🇦🇲',
  ja: '🇯🇵',
  ko: '🇰🇷',
  pt: '🇵🇹',
};

// How a language is labelled in a list or row. Falls back to the bare code so an
// unrecognised language still renders as something rather than blank.
export const languageLabel = (code) => {
  const name = NATIVE_LANGUAGE_NAMES[code] || code;
  const flag = LANGUAGE_FLAGS[code];
  return flag ? `${flag}  ${name}` : name;
};
