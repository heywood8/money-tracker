/**
 * Localized copy for the background "transactions to review" notification.
 *
 * The background task runs headless — there is no React tree and therefore no
 * LocalizationContext / `t()` available. This module resolves the user's stored
 * language directly from preferences and reads the same per-language JSON bundles
 * the app ships, falling back to English for any missing key or language.
 */

import * as PreferencesDB from '../PreferencesDB';
import * as Currency from '../currency';
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

/** Localized key naming what the user still has to pick for a queued item. */
const MISSING_KEYS = {
  account: 'bank_notifications_bg_needs_account',
  category: 'bank_notifications_bg_needs_category',
  account_category: 'bank_notifications_bg_needs_account_category',
  target: 'bank_notifications_bg_needs_target',
  account_target: 'bank_notifications_bg_needs_account_target',
};

/**
 * "Jun 28" for an ISO date, in the app's language. The T00:00:00 anchors the bare
 * date to local midnight (a bare string parses as UTC and shifts a day west of
 * Greenwich), matching the review card's formatting.
 * @returns {string|null}
 */
const formatShortDate = (language, isoDate) => {
  if (!isoDate) return null;
  const parsed = new Date(`${isoDate}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return isoDate;
  try {
    return parsed.toLocaleDateString(language, { month: 'short', day: 'numeric' });
  } catch (error) {
    return isoDate;
  }
};

/** "1 299 AMD · Pyaterochka" — the amount and payee that were parsed. */
const headlineFor = (language, detail) => {
  const amount = Currency.formatAmountTrimmed(detail.amount, detail.currency || 2);
  const payee = detail.merchant
    || translate(language, 'bank_notifications_bg_unknown_merchant');
  return `${amount} ${detail.currency || ''}`.trim() + ` · ${payee}`;
};

/** Localized sentence for what is still missing (or "confirm to add"). */
const needsFor = (language, detail) => translate(
  language,
  MISSING_KEYS[detail.missing] || 'bank_notifications_bg_needs_confirm',
);

/**
 * "4083***7027 · Jun 28 · Account: Main · Category: Groceries" — everything the
 * pipeline managed to resolve for one item. Absent parts are dropped.
 */
const recognizedFor = (language, detail) => {
  const categoryName = detail.categoryNameKey
    ? translate(language, detail.categoryNameKey)
    : detail.categoryName;
  return [
    detail.cardMask,
    formatShortDate(language, detail.date),
    detail.accountName
      ? translate(language, 'bank_notifications_bg_detected_account').replace('{name}', detail.accountName)
      : null,
    categoryName
      ? translate(language, 'bank_notifications_bg_detected_category').replace('{name}', categoryName)
      : null,
  ].filter(Boolean).join(' · ');
};

/**
 * Build the localized title/body/channel-name for the pending-operations alert.
 *
 * With no details it stays a plain count ("3 transactions are waiting to be
 * added"). With details it says what was recognized and what is still needed:
 * a single item puts the amount + payee in the title and the resolved
 * card/date/account/category plus the missing field in the body; several items
 * get one line each (Android expands the body via BigTextStyle), with a
 * "+N more" line when the queue is longer than the described batch.
 *
 * @param {number} count - number of transactions currently awaiting review
 * @param {Array<Object>} [details] - described items (see collectPendingAlertDetails)
 * @returns {Promise<{ title: string, body: string, channelName: string }>}
 */
export const getPendingAlertCopy = async (count, details = []) => {
  const language = await resolveLanguage();
  const safeCount = Number.isFinite(count) && count > 0 ? count : 1;
  const bodyKey = safeCount === 1
    ? 'bank_notifications_bg_notification_body_one'
    : 'bank_notifications_bg_notification_body_other';
  const countLine = translate(language, bodyKey).replace('{count}', String(safeCount));
  const channelName = translate(language, 'bank_notifications_channel_name');
  const items = Array.isArray(details) ? details.filter(Boolean) : [];

  if (items.length === 0) {
    return {
      title: translate(language, 'bank_notifications_bg_notification_title'),
      body: countLine,
      channelName,
    };
  }

  if (items.length === 1 && safeCount === 1) {
    const detail = items[0];
    return {
      title: headlineFor(language, detail),
      body: [recognizedFor(language, detail), needsFor(language, detail)]
        .filter(Boolean)
        .join('\n'),
      channelName,
    };
  }

  const lines = items.map(
    (detail) => `${headlineFor(language, detail)} — ${needsFor(language, detail)}`,
  );
  const hidden = safeCount - items.length;
  if (hidden > 0) {
    lines.push(
      translate(language, 'bank_notifications_bg_notification_more').replace('{count}', String(hidden)),
    );
  }

  return {
    title: countLine,
    body: lines.join('\n'),
    channelName,
  };
};
