/**
 * Localized copy for the background bank notifications — "transactions to
 * review" and its sibling "operations added" receipt.
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

/** The category's display name, resolving a built-in category's key. */
const categoryNameOf = (language, detail) => (detail.categoryNameKey
  ? translate(language, detail.categoryNameKey)
  : detail.categoryName);

/**
 * "4083***7027 · Jun 28 · Account: Main · Category: Groceries" — everything the
 * pipeline managed to resolve for one item. Absent parts are dropped.
 *
 * A transfer (ATM withdrawal) has no category; its counterpart is the cash
 * account the money landed in, shown as "To: Cash".
 */
const recognizedFor = (language, detail) => {
  const categoryName = categoryNameOf(language, detail);
  return [
    detail.cardMask,
    formatShortDate(language, detail.date),
    detail.accountName
      ? translate(language, 'bank_notifications_bg_detected_account').replace('{name}', detail.accountName)
      : null,
    categoryName
      ? translate(language, 'bank_notifications_bg_detected_category').replace('{name}', categoryName)
      : null,
    detail.targetAccountName
      ? translate(language, 'bank_notifications_bg_added_to_account').replace('{name}', detail.targetAccountName)
      : null,
  ].filter(Boolean).join(' · ');
};

/**
 * Whether the review alert for this queue is about one single transaction — the
 * shape whose title is that transaction's own headline rather than a count.
 *
 * Also decides whether the alert may carry a "Reject" button: rejecting from the
 * shade is only offered when the notification names the transaction being
 * rejected (see localNotifications' category docs), which is exactly this shape.
 *
 * @param {number} count - number of transactions currently awaiting review
 * @param {Array<Object>} [details] - described items (see collectPendingAlertDetails)
 * @returns {boolean}
 */
export const isSingleItemAlert = (count, details = []) => {
  const items = Array.isArray(details) ? details.filter(Boolean) : [];
  return items.length === 1 && count === 1;
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
 * `rejectLabel` / `selectLabel` are the alert's two action buttons; which of
 * them the notification actually shows is the presenter's call (see
 * presentPendingOperationsAlert).
 *
 * @param {number} count - number of transactions currently awaiting review
 * @param {Array<Object>} [details] - described items (see collectPendingAlertDetails)
 * @returns {Promise<{ title: string, body: string, channelName: string,
 *   rejectLabel: string, selectLabel: string }>}
 */
export const getPendingAlertCopy = async (count, details = []) => {
  const language = await resolveLanguage();
  const safeCount = Number.isFinite(count) && count > 0 ? count : 1;
  const bodyKey = safeCount === 1
    ? 'bank_notifications_bg_notification_body_one'
    : 'bank_notifications_bg_notification_body_other';
  const countLine = translate(language, bodyKey).replace('{count}', String(safeCount));
  const channelName = translate(language, 'bank_notifications_channel_name');
  const actions = {
    rejectLabel: translate(language, 'bank_notifications_bg_reject'),
    selectLabel: translate(language, 'bank_notifications_bg_select'),
  };
  const items = Array.isArray(details) ? details.filter(Boolean) : [];

  if (items.length === 0) {
    return {
      title: translate(language, 'bank_notifications_bg_notification_title'),
      body: countLine,
      channelName,
      ...actions,
    };
  }

  if (isSingleItemAlert(safeCount, items)) {
    const detail = items[0];
    return {
      title: headlineFor(language, detail),
      body: [recognizedFor(language, detail), needsFor(language, detail)]
        .filter(Boolean)
        .join('\n'),
      channelName,
      ...actions,
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
    ...actions,
  };
};

/**
 * Fill `{name}` placeholders in one pass, so a value that happens to contain a
 * placeholder (an account called "{balance}") or a `$&` sequence is inserted as
 * written instead of being expanded again.
 */
const fillTemplate = (template, values) =>
  template.replace(/\{(\w+)\}/g, (match, key) => (
    Object.prototype.hasOwnProperty.call(values, key) ? values[key] : match
  ));

/**
 * The third part of a single receipt's title: the bare category name for an
 * expense or income ("Groceries"), "To: Cash" for a transfer. Null when neither
 * resolved, which leaves the title at amount · payee.
 *
 * Also null when the category just repeats the payee (a merchant labelled
 * "Pharmacy" filed under "Pharmacy"): the title is a single line, and a second
 * copy of the same word would only push the rest of it out of view.
 */
const destinationFor = (language, detail) => {
  if (detail.type === 'transfer') {
    return detail.targetAccountName
      ? fillTemplate(translate(language, 'bank_notifications_bg_added_to_account'), {
        name: detail.targetAccountName,
      })
      : null;
  }
  const categoryName = categoryNameOf(language, detail);
  if (!categoryName) return null;
  const sameAsPayee = detail.merchant
    && detail.merchant.trim().toLowerCase()
      === categoryName.trim().toLowerCase();
  return sameAsPayee ? null : categoryName;
};

/**
 * "Main card · balance 48 800 AMD" — the account an operation was booked on and
 * what it holds now. Just the account name when the balance was withheld (the
 * user hides balances) or is unknown; null without an account.
 */
const accountLineFor = (language, detail) => {
  if (!detail.accountName) return null;
  if (detail.accountBalance == null || !detail.accountCurrency) return detail.accountName;
  const amount = Currency.formatMoney(detail.accountBalance, detail.accountCurrency, {
    language,
    symbol: false,
  });
  return fillTemplate(translate(language, 'bank_notifications_bg_added_account_balance'), {
    account: detail.accountName,
    balance: `${amount} ${detail.accountCurrency}`,
  });
};

/** Where an auto-created operation landed: its category, or a transfer's target. */
const landedIn = (language, detail) => {
  if (detail.type === 'transfer' && detail.targetAccountName) {
    return translate(language, 'bank_notifications_bg_added_to_account')
      .replace('{name}', detail.targetAccountName);
  }
  const categoryName = categoryNameOf(language, detail);
  if (categoryName) {
    return translate(language, 'bank_notifications_bg_detected_category')
      .replace('{name}', categoryName);
  }
  return detail.accountName
    ? translate(language, 'bank_notifications_bg_detected_account').replace('{name}', detail.accountName)
    : null;
};

/**
 * Build the localized title/body/channel-name for the "operations added" alert —
 * the receipt for operations a background run booked without asking.
 *
 * A single operation fits the whole booking into the title — amount · payee ·
 * category (or "To: Cash" for a transfer) — and puts the account and its balance
 * on the line under it, which is all the collapsed row shows. It deliberately
 * does not say "added automatically": every receipt is about an automatic
 * booking, and a booking that needs the user says so in the review alert
 * instead. The date is left out too, to keep that line for the balance; it is
 * one tap away in the operation itself.
 *
 * Several get one line each ("amount · payee — where it landed"), plus a "+N more"
 * line when the batch is longer than the described one. With no details it
 * degrades to a plain count.
 *
 * `actionLabel` is the receipt's "Acknowledged" button, which clears the
 * notification without opening the app; `changeCategoryLabel` is the button that
 * opens the booked operation's form on its category picker. Whether the receipt
 * actually shows the second one is the presenter's call (see
 * presentAddedOperationsAlert) — only a receipt about a single categorizable
 * booking can name the operation it would edit.
 *
 * @param {number} count - how many operations this run auto-created
 * @param {Array<Object>} [details] - described items (see collectAddedAlertDetails)
 * @returns {Promise<{ title: string, body: string, channelName: string,
 *   actionLabel: string, changeCategoryLabel: string }>}
 */
export const getAddedAlertCopy = async (count, details = []) => {
  const language = await resolveLanguage();
  const safeCount = Number.isFinite(count) && count > 0 ? count : 1;
  const bodyKey = safeCount === 1
    ? 'bank_notifications_bg_added_body_one'
    : 'bank_notifications_bg_added_body_other';
  const countLine = translate(language, bodyKey).replace('{count}', String(safeCount));
  const channelName = translate(language, 'bank_notifications_channel_name');
  const actions = {
    actionLabel: translate(language, 'bank_notifications_bg_added_acknowledge'),
    changeCategoryLabel: translate(language, 'bank_notifications_bg_added_change_category'),
  };
  const items = Array.isArray(details) ? details.filter(Boolean) : [];

  if (items.length === 0) {
    return {
      title: translate(language, 'bank_notifications_bg_added_title'),
      body: countLine,
      channelName,
      ...actions,
    };
  }

  if (items.length === 1 && safeCount === 1) {
    const detail = items[0];
    return {
      title: [headlineFor(language, detail), destinationFor(language, detail)]
        .filter(Boolean)
        .join(' · '),
      body: accountLineFor(language, detail) || '',
      channelName,
      ...actions,
    };
  }

  const lines = items.map((detail) => {
    const where = landedIn(language, detail);
    const headline = headlineFor(language, detail);
    return where ? `${headline} — ${where}` : headline;
  });
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
    ...actions,
  };
};
