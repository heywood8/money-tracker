const { withDangerousMod, withStringsXml, AndroidConfig } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

/**
 * Expo Config Plugin: translate the home-screen widgets' names and
 * descriptions in the launcher's widget picker.
 *
 * react-native-android-widget writes the description into the default
 * strings.xml only, and the label straight into the manifest as a literal, so
 * a Russian phone listed "Exchange rate" in English among its own widgets. The
 * app passes the label to that plugin as `@string/<LABEL_STRING>` instead, and
 * this plugin supplies the strings behind both names: English in the default
 * values/, every other app language in its own values-<lang>/ file. Android
 * then picks by the phone's language, as it does for any app.
 *
 * The text comes from assets/i18n/<lang>.json (WIDGET_STRINGS names the keys),
 * so the picker and the app say the same thing and a new language needs
 * nothing here beyond its JSON file.
 */

// The resource app.config.js names as each widget's label, and the one
// react-native-android-widget names as its description:
// `widget_<name lowercased>_description` for the widget named "ExchangeRate".
const LABEL_STRING = 'widget_exchange_rate_label';
const DESCRIPTION_STRING = 'widget_exchangerate_description';
const PAIR_LABEL_STRING = 'widget_exchange_rate_pair_label';
const PAIR_DESCRIPTION_STRING = 'widget_exchangeratepair_description';

// Resource name → the assets/i18n key its text comes from.
const WIDGET_STRINGS = [
  [LABEL_STRING, 'widget_rate_label'],
  [DESCRIPTION_STRING, 'widget_rate_description'],
  [PAIR_LABEL_STRING, 'widget_pair_label'],
  [PAIR_DESCRIPTION_STRING, 'widget_pair_description'],
];
const LABEL_STRINGS = [LABEL_STRING, PAIR_LABEL_STRING];
const DESCRIPTION_STRINGS = [DESCRIPTION_STRING, PAIR_DESCRIPTION_STRING];
// One file of our own per locale, so nothing else's values-<lang>/strings.xml
// is read or overwritten.
const STRINGS_FILE = 'widget_strings.xml';

const I18N_DIR = path.join(__dirname, '..', 'assets', 'i18n');

/** The languages the app ships, read from the translation files. */
const appLanguages = () => fs.readdirSync(I18N_DIR)
  .filter((file) => file.endsWith('.json'))
  .map((file) => path.basename(file, '.json'))
  .sort();

const readTranslations = (language) => JSON.parse(
  fs.readFileSync(path.join(I18N_DIR, `${language}.json`), 'utf8'),
);

/**
 * Escape text for an Android string resource: XML entities, then the
 * characters aapt itself treats as markup (quotes, a leading @ or ?).
 *
 * @param {string} text
 * @returns {string}
 */
const escapeAndroidString = (text) => String(text)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/\\/g, '\\\\')
  .replace(/'/g, "\\'")
  .replace(/"/g, '\\"')
  .replace(/^([@?])/, '\\$1');

/**
 * The resources file for one locale.
 *
 * @param {Object<string, string>} strings - Resource name → text
 * @returns {string}
 */
const localeStringsXml = (strings) => [
  '<?xml version="1.0" encoding="utf-8"?>',
  '<resources>',
  ...Object.entries(strings).map(([name, text]) => `  <string name="${name}">${escapeAndroidString(text)}</string>`),
  '</resources>',
  '',
].join('\n');

// Resource name → text in one language, English where it has none.
const widgetStringsFor = (language) => {
  const translations = readTranslations(language);
  const english = language === 'en' ? translations : readTranslations('en');
  return Object.fromEntries(WIDGET_STRINGS.map(([name, key]) => [name, translations[key] || english[key]]));
};

/**
 * The library writes the English description as `translatable="false"`. With
 * translations of it in values-<lang>/, release builds would then fail Android
 * lint's fatal ExtraTranslation check, so the flag comes off.
 *
 * The library also escapes the text itself, which it has to: Expo's strings
 * writer escapes every translatable string but skips untranslatable ones. Once
 * the flag is gone the writer escapes it, so the library's escaping is undone
 * here, or "today's" would reach the picker as "today\'s".
 *
 * @param {Object} stringsXml - Parsed strings.xml
 * @returns {Object}
 */
const allowDescriptionTranslations = (stringsXml) => {
  (stringsXml?.resources?.string ?? []).forEach((item) => {
    if (!DESCRIPTION_STRINGS.includes(item?.$?.name) || item.$.translatable === undefined) return;
    delete item.$.translatable;
    item._ = String(item._).replace(/\\(.)/g, '$1');
  });
  return stringsXml;
};

const withWidgetStrings = (config) => {
  // English labels in the default values/ (the library's own plugin writes the
  // English descriptions there). Every locale needs a default to fall back to.
  //
  // This mod has to see the library's description, so app.config.js lists
  // this plugin *before* the library's: Expo runs the mods of later plugins
  // first, and earlier ones after them.
  config = withStringsXml(config, (stringsConfig) => {
    stringsConfig.modResults = allowDescriptionTranslations(AndroidConfig.Strings.setStringItem(
      // Plain text: Expo's strings writer escapes translatable strings itself.
      LABEL_STRINGS.map((name) => ({ $: { name }, _: widgetStringsFor('en')[name] })),
      stringsConfig.modResults,
    ));
    return stringsConfig;
  });

  return withDangerousMod(config, [
    'android',
    async (modConfig) => {
      const resDir = path.join(modConfig.modRequest.projectRoot, 'android', 'app', 'src', 'main', 'res');
      appLanguages()
        .filter((language) => language !== 'en')
        .forEach((language) => {
          const dir = path.join(resDir, `values-${language}`);
          fs.mkdirSync(dir, { recursive: true });
          fs.writeFileSync(path.join(dir, STRINGS_FILE), localeStringsXml(widgetStringsFor(language)));
        });
      return modConfig;
    },
  ]);
};

module.exports = withWidgetStrings;
module.exports.LABEL_STRING = LABEL_STRING;
module.exports.DESCRIPTION_STRING = DESCRIPTION_STRING;
module.exports.PAIR_LABEL_STRING = PAIR_LABEL_STRING;
module.exports.PAIR_DESCRIPTION_STRING = PAIR_DESCRIPTION_STRING;
module.exports.escapeAndroidString = escapeAndroidString;
module.exports.localeStringsXml = localeStringsXml;
module.exports.allowDescriptionTranslations = allowDescriptionTranslations;
