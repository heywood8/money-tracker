/**
 * Localized copy for the background "transactions to review" notification.
 *
 * The background task runs headless — there is no React tree and therefore no
 * LocalizationContext / `t()` available. This module resolves the user's stored
 * language directly from preferences and reads the same per-language JSON bundles
 * the app ships, falling back to English for any missing key or language.
 */

import * as PreferencesDB from '../PreferencesDB';
import enTranslations from '../../../assets/i18n/en.json';
import itTranslations from '../../../assets/i18n/it.json';
import ruTranslations from '../../../assets/i18n/ru.json';
import esTranslations from '../../../assets/i18n/es.json';
import frTranslations from '../../../assets/i18n/fr.json';
import zhTranslations from '../../../assets/i18n/zh.json';
import deTranslations from '../../../assets/i18n/de.json';
import hyTranslations from '../../../assets/i18n/hy.json';
import jaTranslations from '../../../assets/i18n/ja.json';
import koTranslations from '../../../assets/i18n/ko.json';
import ptTranslations from '../../../assets/i18n/pt.json';

const i18nData = {
  en: enTranslations,
  it: itTranslations,
  ru: ruTranslations,
  es: esTranslations,
  fr: frTranslations,
  zh: zhTranslations,
  de: deTranslations,
  hy: hyTranslations,
  ja: jaTranslations,
  ko: koTranslations,
  pt: ptTranslations,
};

/**
 * Translate a key for a language, falling back to English then to the key.
 * @param {string} language
 * @param {string} key
 * @returns {string}
 */
const translate = (language, key) =>
  i18nData[language]?.[key] || i18nData.en?.[key] || key;

/**
 * Resolve the stored UI language, or 'en' when unset/unavailable.
 * @returns {Promise<string>}
 */
const resolveLanguage = async () => {
  try {
    const stored = await PreferencesDB.getPreference(PreferencesDB.PREF_KEYS.LANGUAGE);
    return stored && i18nData[stored] ? stored : 'en';
  } catch (error) {
    return 'en';
  }
};

/**
 * Build the localized title/body/channel-name for the pending-operations alert.
 *
 * @param {number} count - number of transactions currently awaiting review
 * @returns {Promise<{ title: string, body: string, channelName: string }>}
 */
export const getPendingAlertCopy = async (count) => {
  const language = await resolveLanguage();
  const safeCount = Number.isFinite(count) && count > 0 ? count : 1;
  const bodyKey = safeCount === 1
    ? 'bank_notifications_bg_notification_body_one'
    : 'bank_notifications_bg_notification_body_other';
  return {
    title: translate(language, 'bank_notifications_bg_notification_title'),
    body: translate(language, bodyKey).replace('{count}', String(safeCount)),
    channelName: translate(language, 'bank_notifications_channel_name'),
  };
};
