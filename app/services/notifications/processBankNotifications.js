/**
 * Ingestion pipeline: read recent bank notifications, parse them, resolve
 * account/category, and either create an operation (when fully matched) or
 * enqueue the item for review.
 *
 * Processing model (per the feature design): auto-create when both the card and
 * merchant resolve; otherwise queue. Already-processed notifications are skipped
 * using a rolling set of signatures persisted in preferences, because the native
 * listener exposes a pull-only rolling window with no per-item "seen" state.
 */

import { getRecentNotifications } from '../NotificationAccess';
import * as PreferencesDB from '../PreferencesDB';
import * as OperationsDB from '../OperationsDB';
import * as AccountsDB from '../AccountsDB';
import * as Currency from '../currency';
import * as NotificationRulesDB from '../NotificationRulesDB';
import * as PendingNotificationsDB from '../PendingNotificationsDB';
import { serializeLabels, sanitizeLabel } from '../../utils/labelUtils';
import { appEvents, EVENTS } from '../eventEmitter';
import { captureLocationIfEnabled, operationLocationFields } from '../operationLocation';
import { parseBankNotification, kindRequiresCategory } from './parseBankNotification';
import { resolveNotification } from './resolveNotification';

/**
 * A per-run location provider. Captures the device location at most once (lazily,
 * only when an operation is actually created) and reuses it for every operation
 * booked in the same run, so a batch of notifications shares one best-effort fix
 * instead of hammering GPS. Returns { latitude, longitude } or null; the feature
 * being off / permission missing / a failed fix all resolve to null so location
 * capture never blocks booking a notification (issue #1091).
 * @returns {() => Promise<{latitude: string, longitude: string}|null>}
 */
const makeLocationProvider = () => {
  let cached; // undefined until the first attempt
  return async () => {
    if (cached === undefined) {
      cached = await captureLocationIfEnabled();
    }
    return cached;
  };
};

// Cap on remembered signatures. The native side only ever keeps a handful of
// notifications, so this is comfortably large while bounding storage.
const MAX_SIGNATURES = 100;

/**
 * Stable, compact signature for a raw notification so re-processing the same
 * one is a no-op. Combines post time with a hash of the text.
 * @param {{ postTime?: number, text?: string }} notification
 * @returns {string}
 */
export const notificationSignature = (notification) => {
  const text = notification?.text || '';
  let hash = 5381;
  for (let i = 0; i < text.length; i += 1) {
    hash = ((hash << 5) + hash + text.charCodeAt(i)) | 0;
  }
  return `${notification?.postTime || 0}:${hash}`;
};

/**
 * Whether bank-notification processing is enabled (default off).
 * @returns {Promise<boolean>}
 */
export const isBankNotificationsEnabled = async () => {
  const value = await PreferencesDB.getPreference(
    PreferencesDB.PREF_KEYS.BANK_NOTIFICATIONS_ENABLED,
    '0',
  );
  return value === '1' || value === 'true';
};

/**
 * Enable/disable bank-notification processing.
 * @param {boolean} enabled
 * @returns {Promise<void>}
 */
export const setBankNotificationsEnabled = async (enabled) => {
  await PreferencesDB.setPreference(
    PreferencesDB.PREF_KEYS.BANK_NOTIFICATIONS_ENABLED,
    enabled ? '1' : '0',
  );
};

const loadSignatures = async () => {
  const sigs = await PreferencesDB.getJsonPreference(
    PreferencesDB.PREF_KEYS.BANK_NOTIFICATIONS_PROCESSED_SIGS,
    [],
  );
  return Array.isArray(sigs) ? sigs : [];
};

const saveSignatures = async (sigs) => {
  // Keep only the most recent MAX_SIGNATURES entries.
  const trimmed = sigs.slice(-MAX_SIGNATURES);
  await PreferencesDB.setJsonPreference(
    PreferencesDB.PREF_KEYS.BANK_NOTIFICATIONS_PROCESSED_SIGS,
    trimmed,
  );
};

/**
 * ISO "YYYY-MM-DD" for an epoch-millis post time, or null if unusable.
 */
const isoDateFromPostTime = (postTime) => {
  if (!postTime) return null;
  const d = new Date(postTime);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
};

/** Today's ISO date — the last-resort fallback for a missing date. */
const todayIso = () => new Date().toISOString().slice(0, 10);

/**
 * Build the amount + multi-currency fields for booking a parsed notification
 * against an account whose currency may differ from the notification's.
 *
 * A bank notification can be charged in a currency other than the card's account
 * currency (e.g. a 129.99 EUR purchase on an AMD card). This mirrors how a
 * manually-entered foreign-currency operation is stored so the balance is hit in
 * the account currency while the original foreign value is preserved:
 *   amount              = value in the account currency (what hits the balance)
 *   destinationAmount   = original notification amount (foreign currency)
 *   exchangeRate        = account→foreign rate
 *   sourceCurrency      = foreign currency
 *   destinationCurrency = account currency
 *
 * The conversion uses the *current* exchange rate (live, with offline fallback),
 * the same source the operation form uses. When the currencies already match (or
 * either is unknown) the amount is booked as-is.
 *
 * @param {{ amount: string, currency: string }} item - parsed descriptor / pending row
 * @param {string|null|undefined} accountCurrency - currency of the booking account
 * @returns {Promise<Object|null>} operation field overrides, or null when a
 *   conversion is required but no exchange rate is available (caller must not
 *   book a wrong amount — leave it for manual review).
 */
export const buildOperationCurrencyFields = async (item, accountCurrency) => {
  if (!accountCurrency || !item.currency || item.currency === accountCurrency) {
    // Same currency (or unknown account): book as-is, but normalize to the
    // account currency's decimal places when known, matching the manual-entry
    // path (useOperationForm) so notification and hand-entered amounts agree.
    return {
      amount: accountCurrency
        ? Currency.formatAmount(item.amount, accountCurrency)
        : item.amount,
    };
  }

  // foreign → account rate (e.g. EUR→AMD), at the current rate.
  const { rate } = await Currency.fetchLiveExchangeRate(item.currency, accountCurrency);
  if (!rate) return null;

  const convertedAmount = Currency.convertAmount(item.amount, item.currency, accountCurrency, rate);
  if (!convertedAmount) return null;

  // Store the account→foreign rate, inverted with decimal precision.
  const exchangeRate = Currency.invertRate(rate);
  if (!exchangeRate) return null;

  return {
    amount: convertedAmount,                                              // account currency
    destinationAmount: Currency.formatAmount(item.amount, item.currency), // foreign currency
    exchangeRate,                                                         // account→foreign
    sourceCurrency: item.currency,                                        // foreign currency
    destinationCurrency: accountCurrency,                                 // account currency
  };
};

/**
 * Build the amount + multi-currency fields for booking an ATM-withdrawal transfer
 * from the card (source) account into the bound cash (target) account.
 *
 * The notification amount is charged in `item.currency`. It becomes the transfer's
 * source-side `amount` (in the source account currency); when the target account's
 * currency differs it is additionally converted to a `destinationAmount` at the
 * current rate, mirroring how a manual multi-currency transfer is stored:
 *   amount            = value leaving the source account (source currency)
 *   destinationAmount = value entering the target account (target currency)
 *   exchangeRate      = source -> target rate
 *
 * When every currency already agrees the amount is booked as-is and the balance
 * layer mirrors it to the target side.
 *
 * @param {{ amount: string, currency: string }} item - parsed descriptor / pending row
 * @param {string|null|undefined} sourceCurrency - currency of the card account
 * @param {string|null|undefined} targetCurrency - currency of the cash account
 * @returns {Promise<Object|null>} operation field overrides, or null when a
 *   required exchange rate is unavailable (caller must not book a wrong amount).
 */
export const buildTransferCurrencyFields = async (item, sourceCurrency, targetCurrency) => {
  // 1. Amount leaving the source account, expressed in the source currency.
  let sourceAmount;
  if (!sourceCurrency || !item.currency || item.currency === sourceCurrency) {
    sourceAmount = sourceCurrency
      ? Currency.formatAmount(item.amount, sourceCurrency)
      : item.amount;
  } else {
    const { rate } = await Currency.fetchLiveExchangeRate(item.currency, sourceCurrency);
    if (!rate) return null;
    const converted = Currency.convertAmount(item.amount, item.currency, sourceCurrency, rate);
    if (!converted) return null;
    sourceAmount = converted;
  }

  // 2. Same-currency transfer: the target receives the identical amount (the
  //    balance layer defaults destinationAmount to amount), so no extra fields.
  if (!targetCurrency || !sourceCurrency || targetCurrency === sourceCurrency) {
    return { amount: sourceAmount };
  }

  // 3. Cross-currency transfer: convert to the target currency at the current rate.
  const { rate } = await Currency.fetchLiveExchangeRate(sourceCurrency, targetCurrency);
  if (!rate) return null;
  const destinationAmount = Currency.convertAmount(sourceAmount, sourceCurrency, targetCurrency, rate);
  if (!destinationAmount) return null;

  return {
    amount: sourceAmount,             // source account currency
    destinationAmount,                // target account currency
    exchangeRate: rate,               // source -> target
    sourceCurrency,
    destinationCurrency: targetCurrency,
  };
};

/**
 * The account bound as the destination for ATM cash-withdrawal transfers, or null
 * when none is bound yet (or the bound account was since deleted). Resolved from
 * a preference set the first time the user reviews an ATM CASH notification.
 * @returns {Promise<Object|null>} the account row, or null
 */
export const resolveAtmTargetAccount = async () => {
  const id = await PreferencesDB.getNumberPreference(
    PreferencesDB.PREF_KEYS.BANK_NOTIFICATIONS_ATM_ACCOUNT,
    null,
  );
  if (id == null) return null;
  try {
    const account = await AccountsDB.getAccountById(id);
    return account || null;
  } catch (error) {
    return null;
  }
};

/** Bind the cash account that ATM-withdrawal transfers move money into. */
export const setAtmTargetAccount = async (accountId) => {
  if (accountId == null) return;
  await PreferencesDB.setPreference(
    PreferencesDB.PREF_KEYS.BANK_NOTIFICATIONS_ATM_ACCOUNT,
    String(accountId),
  );
};

/**
 * Packages whose notifications are trusted to auto-create operations. A package
 * is added the first time the user resolves one of its notifications from the
 * review queue, so an unknown/forged source can never silently book money — it
 * can only ever produce a pending item the user must approve.
 * @returns {Promise<string[]>}
 */
export const getAllowedPackages = async () => {
  const list = await PreferencesDB.getJsonPreference(
    PreferencesDB.PREF_KEYS.BANK_NOTIFICATIONS_PACKAGES,
    [],
  );
  return Array.isArray(list) ? list : [];
};

/** Remember a package as a trusted auto-create source. */
export const learnSourcePackage = async (packageName) => {
  if (!packageName) return;
  const list = await getAllowedPackages();
  if (!list.includes(packageName)) {
    await PreferencesDB.setJsonPreference(
      PreferencesDB.PREF_KEYS.BANK_NOTIFICATIONS_PACKAGES,
      [...list, packageName],
    );
  }
};

const isAllowedSource = (packageName, allowed) =>
  !!packageName && allowed.includes(packageName);

/**
 * Book a parsed expense/income notification: auto-create the operation when the
 * card resolves to an account, the merchant resolves to a category, and the source
 * is trusted; otherwise enqueue it for review. Mutates `summary`.
 *
 * @param {Object} descriptor - parsed notification
 * @param {Object} resolution - resolveNotification() result
 * @param {string} date - resolved ISO date (never null)
 * @param {string[]} allowedPackages - trusted-source allowlist
 * @param {{ created: number, pending: number }} summary
 * @param {() => Promise<Object|null>} [getLocation] - best-effort location provider
 *   for auto-created operations; omitted callers book without coordinates.
 */
const bookExpenseOrQueue = async (descriptor, resolution, date, allowedPackages, summary, getLocation) => {
  // Everything an auto-create needs except the currency match. Auto-create only
  // for trusted sources; kinds that require a manual category (C2C transfers,
  // DEBIT ACCOUNT) always wait in the queue.
  const eligibleForAutoCreate =
    resolution.matchedAccount &&
    resolution.matchedCategory &&
    !descriptor.requiresCategory &&
    isAllowedSource(descriptor.packageName, allowedPackages);

  // When the account currency differs from the notification currency, convert the
  // amount at the current exchange rate. A failed conversion (no rate) means we
  // must not book a wrong amount — leave it for manual review.
  let currencyFields = { amount: descriptor.amount };
  let currencyResolved = resolution.currencyMatch;
  if (eligibleForAutoCreate && !resolution.currencyMatch) {
    const built = await buildOperationCurrencyFields(descriptor, resolution.accountCurrency);
    if (built) {
      currencyFields = built;
      currencyResolved = true;
    }
  }

  const autoCreate = eligibleForAutoCreate && currencyResolved;

  if (autoCreate) {
    // Apply the account's automatic-transaction rounding (10/100/1000) to the
    // amount that hits the balance. Only the booked `amount` is rounded; any
    // preserved foreign `destinationAmount` keeps the original charged value.
    if (resolution.accountRounding) {
      currencyFields = {
        ...currencyFields,
        amount: Currency.roundToNearest(
          currencyFields.amount,
          resolution.accountRounding,
          resolution.accountCurrency,
        ),
      };
    }

    // A learned label override (e.g. "ECOSENSE BYUZAND" -> "Ecosense") wins over
    // the raw merchant for the operation's label.
    const label = resolution.labelOverride || descriptor.merchant;
    const location = getLocation ? await getLocation() : null;
    await OperationsDB.createOperation({
      type: descriptor.type,
      ...currencyFields,
      accountId: resolution.accountId,
      categoryId: resolution.categoryId,
      date,
      description: label ? serializeLabels([label]) : null,
      ...operationLocationFields(location),
    });
    summary.created += 1;
  } else {
    await PendingNotificationsDB.addPendingNotification({
      ...descriptor,
      date,
      accountId: resolution.accountId,
      // Pre-fill the resolved category whenever we have an account to book
      // against; a currency mismatch is no longer a blocker since it is resolved
      // by conversion at save time.
      categoryId: resolution.matchedAccount ? resolution.categoryId : null,
    });
    summary.pending += 1;
  }
};

/**
 * Book a parsed transfer notification (e.g. an ATM cash withdrawal): auto-create
 * the transfer when the card resolves to a source account, a target "cash" account
 * is bound, and the source is trusted; otherwise enqueue it for review so the user
 * can pick/confirm the source and target accounts (binding the target for next
 * time). Mutates `summary`.
 *
 * @param {Object} descriptor - parsed notification (type 'transfer')
 * @param {Object} resolution - resolveNotification() result (source account)
 * @param {string} date - resolved ISO date (never null)
 * @param {string[]} allowedPackages - trusted-source allowlist
 * @param {{ created: number, pending: number }} summary
 * @param {() => Promise<Object|null>} [getLocation] - best-effort location provider
 *   for auto-created transfers; omitted callers book without coordinates.
 */
const bookTransferOrQueue = async (descriptor, resolution, date, allowedPackages, summary, getLocation) => {
  const target = await resolveAtmTargetAccount();
  const eligibleForAutoCreate =
    resolution.matchedAccount &&
    !!target &&
    target.id !== resolution.accountId &&
    isAllowedSource(descriptor.packageName, allowedPackages);

  // Convert across the source/target currencies at the current rate when needed;
  // a missing rate leaves the transfer for manual review rather than booking a
  // wrong amount.
  let transferFields = null;
  if (eligibleForAutoCreate) {
    transferFields = await buildTransferCurrencyFields(
      descriptor,
      resolution.accountCurrency,
      target.currency,
    );
  }

  if (eligibleForAutoCreate && transferFields) {
    // Round the source-side amount only for a same-currency transfer, where the
    // target receives the identical amount; a cross-currency transfer keeps its
    // rate-derived destinationAmount intact so both sides stay consistent.
    if (resolution.accountRounding && !transferFields.destinationAmount) {
      transferFields = {
        ...transferFields,
        amount: Currency.roundToNearest(
          transferFields.amount,
          resolution.accountRounding,
          resolution.accountCurrency,
        ),
      };
    }
    const location = getLocation ? await getLocation() : null;
    await OperationsDB.createOperation({
      type: 'transfer',
      ...transferFields,
      accountId: resolution.accountId,
      toAccountId: target.id,
      date,
      description: descriptor.merchant ? serializeLabels([descriptor.merchant]) : null,
      ...operationLocationFields(location),
    });
    summary.created += 1;
  } else {
    await PendingNotificationsDB.addPendingNotification({
      ...descriptor,
      date,
      accountId: resolution.accountId,
      // Transfers carry no category; the target account is chosen at review time.
      categoryId: null,
    });
    summary.pending += 1;
  }
};

// Guards against overlapping runs (foreground listener + panel mount/refresh)
// double-creating operations: a second call awaits the first instead of racing.
let _inFlight = null;

/**
 * Process all currently-available bank notifications once.
 *
 * Safe to call repeatedly (e.g. on app foreground): already-seen notifications
 * are skipped, and overlapping invocations share a single run. Does nothing when
 * the feature is disabled.
 *
 * @returns {Promise<{ created: number, pending: number, skipped: number }>}
 */
export const processBankNotifications = async () => {
  if (_inFlight) return _inFlight;
  _inFlight = runProcess();
  try {
    return await _inFlight;
  } finally {
    _inFlight = null;
  }
};

const runProcess = async () => {
  const summary = { created: 0, pending: 0, skipped: 0 };

  if (!(await isBankNotificationsEnabled())) {
    return summary;
  }

  const notifications = await getRecentNotifications();
  if (!notifications || notifications.length === 0) {
    return summary;
  }

  const seen = new Set(await loadSignatures());
  const allowedPackages = await getAllowedPackages();
  const newlySeen = [];

  // One best-effort location fix, shared by every operation auto-created this run.
  const getLocation = makeLocationProvider();

  // Oldest first so operations are created in chronological order.
  const ordered = [...notifications].sort(
    (a, b) => (a.postTime || 0) - (b.postTime || 0),
  );

  for (const notification of ordered) {
    const signature = notificationSignature(notification);
    if (seen.has(signature)) {
      continue;
    }

    const descriptor = parseBankNotification(notification);
    if (!descriptor) {
      // Not a recognized transaction — mark seen so we don't re-parse it.
      seen.add(signature);
      newlySeen.push(signature);
      summary.skipped += 1;
      continue;
    }

    // operations.date is NOT NULL — always supply a valid date.
    const date = descriptor.date || isoDateFromPostTime(notification.postTime) || todayIso();

    try {
      const resolution = await resolveNotification(descriptor);

      // Transfers (ATM cash withdrawals) move money between the user's own
      // accounts, so they resolve a *target* account (a bound "cash" account)
      // instead of a category. Everything else books as expense/income.
      if (descriptor.isTransfer) {
        await bookTransferOrQueue(descriptor, resolution, date, allowedPackages, summary, getLocation);
      } else {
        await bookExpenseOrQueue(descriptor, resolution, date, allowedPackages, summary, getLocation);
      }

      seen.add(signature);
      newlySeen.push(signature);
    } catch (error) {
      // Leave the signature unrecorded so a transient failure is retried next run.
      console.error('[processBankNotifications] Failed to process notification:', error);
    }
  }

  if (newlySeen.length > 0) {
    await saveSignatures([...seen]);
  }

  // Refresh on any change so a pending badge updates too, not just on creates.
  if (summary.created > 0 || summary.pending > 0) {
    appEvents.emit(EVENTS.RELOAD_ALL);
  }

  return summary;
};

/**
 * Resolve a pending notification from the review queue: create the operation
 * with the user's chosen account/category, learn the bindings for next time,
 * then remove the pending row.
 *
 * @param {string} pendingId
 * @param {Object} choices - { accountId, categoryId, learnCardMask?, learnMerchant? }
 * @returns {Promise<Object|null>} the created operation, or null if not found
 */
export const resolvePendingNotification = async (pendingId, choices = {}) => {
  const pending = await PendingNotificationsDB.getPendingNotificationById(pendingId);
  if (!pending) return null;

  // Transfers (ATM cash withdrawals) resolve to a source + target account instead
  // of an account + category, so they take a dedicated path.
  if (pending.type === 'transfer') {
    return resolvePendingTransfer(pending, choices);
  }

  const accountId = choices.accountId ?? pending.accountId;
  const categoryId = choices.categoryId ?? pending.categoryId;

  if (accountId == null) {
    throw new Error('Cannot resolve pending notification without an account');
  }

  // Resolve the operation's label. When the review UI supplies a `labelOverride`
  // (always a string from that flow) it is authoritative: its text is the label,
  // and a blank field means "no override — use the raw shop name". Programmatic
  // callers that omit the field fall back to any previously-learned override.
  const hasLabelChoice = typeof choices.labelOverride === 'string';
  const typedLabel = sanitizeLabel(choices.labelOverride); // '' when blank/absent
  const learnedLabel = pending.merchant
    ? (await NotificationRulesDB.getLabelForMerchant(pending.merchant, pending.packageName)) || ''
    : '';
  const chosenLabel = hasLabelChoice ? typedLabel : learnedLabel;
  const label = chosenLabel || pending.merchant;

  // Fetch the chosen account once: its currency drives conversion and its
  // rounding setting is applied to the booked amount below.
  const account = await AccountsDB.getAccountById(accountId);
  const accountCurrency = account ? account.currency : null;

  // Convert to the chosen account's currency at the current rate when they
  // differ (e.g. a EUR purchase booked against an AMD account). Unlike the
  // auto-create path (which silently re-queues when no rate is available), this
  // is a user-driven save with no further fallback — so a missing rate throws
  // rather than booking a wrong amount, surfacing the failure to the caller.
  let currencyFields = { amount: pending.amount };
  if (pending.currency) {
    const built = await buildOperationCurrencyFields(pending, accountCurrency);
    if (built) {
      currencyFields = built;
    } else {
      throw new Error(
        `Cannot resolve pending notification ${pendingId}: no exchange rate for ${pending.currency}→${accountCurrency}`,
      );
    }
  }

  // Apply the account's automatic-transaction rounding (10/100/1000) to the
  // amount that hits the balance, matching the auto-create path. Only the booked
  // `amount` is rounded; any preserved foreign `destinationAmount` keeps the
  // original charged value.
  const accountRounding = account ? account.autoTxnRounding : null;
  if (accountRounding) {
    currencyFields = {
      ...currencyFields,
      amount: Currency.roundToNearest(currencyFields.amount, accountRounding, accountCurrency),
    };
  }

  // Best-effort location for this user-driven save (attached only when enabled).
  const location = await captureLocationIfEnabled();

  const operation = await OperationsDB.createOperation({
    type: pending.type,
    ...currencyFields,
    accountId,
    categoryId: categoryId || null,
    // operations.date is NOT NULL — fall back to the row's creation date / today.
    date: pending.date || (pending.createdAt ? pending.createdAt.slice(0, 10) : todayIso()),
    description: label ? serializeLabels([label]) : null,
    ...operationLocationFields(location),
  });

  // Persist an override change only when the user actually changed it in the
  // review UI: a new/edited name is learned, a blanked field clears the override.
  // An unchanged value writes nothing — avoiding updated_at churn that would
  // reorder the rules list. A label is a display name, so — unlike the category —
  // it is learned for every kind, including C2C transfers.
  if (hasLabelChoice && pending.merchant && typedLabel !== learnedLabel) {
    try {
      await NotificationRulesDB.upsertMerchantLabel(
        pending.merchant,
        typedLabel,
        pending.packageName,
      );
    } catch (error) {
      console.error('[resolvePendingNotification] Failed to learn merchant label:', error);
    }
  }

  // Learn the card -> account binding (default on when a card mask is present).
  if (choices.learnCardMask !== false && pending.cardMask && accountId != null) {
    try {
      await AccountsDB.setAccountCardMask(accountId, pending.cardMask);
    } catch (error) {
      console.error('[resolvePendingNotification] Failed to learn card mask:', error);
    }
  }

  // Learn the merchant -> category rule (default on when both are present).
  // Never learn a rule for kinds that must always be categorized manually
  // (C2C): a transfer to a friend has no stable category to remember.
  if (
    choices.learnMerchant !== false &&
    pending.merchant &&
    categoryId &&
    !kindRequiresCategory(pending.kind, pending.packageName)
  ) {
    try {
      await NotificationRulesDB.upsertMerchantRule(
        pending.merchant,
        categoryId,
        pending.packageName,
      );
    } catch (error) {
      console.error('[resolvePendingNotification] Failed to learn merchant rule:', error);
    }
  }

  // Trust this source for auto-create going forward (default on).
  if (choices.learnSource !== false && pending.packageName) {
    try {
      await learnSourcePackage(pending.packageName);
    } catch (error) {
      console.error('[resolvePendingNotification] Failed to learn source package:', error);
    }
  }

  await PendingNotificationsDB.deletePendingNotification(pendingId);
  appEvents.emit(EVENTS.RELOAD_ALL);
  return operation;
};

/**
 * Resolve a pending transfer (ATM cash withdrawal) from the review queue: create
 * a transfer from the chosen source (card) account to the chosen target (cash)
 * account, learn the card -> source binding, and remember the target account so
 * future ATM withdrawals auto-create. Then remove the pending row.
 *
 * @param {Object} pending - the pending row (type 'transfer')
 * @param {Object} choices - { accountId, toAccountId, labelOverride?,
 *   learnCardMask?, learnTargetAccount?, learnSource? }
 * @returns {Promise<Object>} the created operation
 */
const resolvePendingTransfer = async (pending, choices = {}) => {
  const accountId = choices.accountId ?? pending.accountId;
  const toAccountId = choices.toAccountId ?? null;

  if (accountId == null) {
    throw new Error('Cannot resolve pending transfer without a source account');
  }
  if (toAccountId == null) {
    throw new Error('Cannot resolve pending transfer without a target account');
  }
  if (accountId === toAccountId) {
    throw new Error('Cannot resolve pending transfer with the same source and target account');
  }

  const [sourceAccount, targetAccount] = await Promise.all([
    AccountsDB.getAccountById(accountId),
    AccountsDB.getAccountById(toAccountId),
  ]);
  const sourceCurrency = sourceAccount ? sourceAccount.currency : null;
  const targetCurrency = targetAccount ? targetAccount.currency : null;

  // Convert across the source/target currencies at the current rate when needed.
  // Unlike auto-create (which re-queues on a missing rate) this is a user-driven
  // save with no further fallback, so a missing rate throws rather than booking a
  // wrong amount.
  let transferFields = await buildTransferCurrencyFields(pending, sourceCurrency, targetCurrency);
  if (!transferFields) {
    throw new Error(
      `Cannot resolve pending transfer ${pending.id}: no exchange rate for ${pending.currency}→${sourceCurrency}→${targetCurrency}`,
    );
  }

  // Round the source-side amount only for a same-currency transfer, where the
  // target receives the identical amount; a cross-currency transfer keeps its
  // rate-derived destinationAmount intact so both sides stay consistent. Mirrors
  // the auto-create transfer path.
  const accountRounding = sourceAccount ? sourceAccount.autoTxnRounding : null;
  if (accountRounding && !transferFields.destinationAmount) {
    transferFields = {
      ...transferFields,
      amount: Currency.roundToNearest(transferFields.amount, accountRounding, sourceCurrency),
    };
  }

  // An optional custom name typed in the review UI becomes the operation label;
  // otherwise the raw ATM location (merchant) is used. No merchant rule is learned
  // for a transfer — an ATM location is not a category to remember.
  const typedLabel = sanitizeLabel(choices.labelOverride);
  const label = typedLabel || pending.merchant;

  // Best-effort location for this user-driven save (attached only when enabled).
  const location = await captureLocationIfEnabled();

  const operation = await OperationsDB.createOperation({
    type: 'transfer',
    ...transferFields,
    accountId,
    toAccountId,
    // operations.date is NOT NULL — fall back to the row's creation date / today.
    date: pending.date || (pending.createdAt ? pending.createdAt.slice(0, 10) : todayIso()),
    description: label ? serializeLabels([label]) : null,
    ...operationLocationFields(location),
  });

  // Learn the card -> source-account binding (default on when a card is present).
  if (choices.learnCardMask !== false && pending.cardMask && accountId != null) {
    try {
      await AccountsDB.setAccountCardMask(accountId, pending.cardMask);
    } catch (error) {
      console.error('[resolvePendingNotification] Failed to learn card mask:', error);
    }
  }

  // Bind the target "cash" account so future ATM withdrawals auto-create (default
  // on). This is the "bind target account on first time" behavior.
  if (choices.learnTargetAccount !== false && toAccountId != null) {
    try {
      await setAtmTargetAccount(toAccountId);
    } catch (error) {
      console.error('[resolvePendingNotification] Failed to bind ATM target account:', error);
    }
  }

  // Trust this source for auto-create going forward (default on).
  if (choices.learnSource !== false && pending.packageName) {
    try {
      await learnSourcePackage(pending.packageName);
    } catch (error) {
      console.error('[resolvePendingNotification] Failed to learn source package:', error);
    }
  }

  await PendingNotificationsDB.deletePendingNotification(pending.id);
  appEvents.emit(EVENTS.RELOAD_ALL);
  return operation;
};

/**
 * Re-process a single already-seen notification on explicit user request
 * ("Re-add operation" from the recent-notifications feed). Bypasses both the
 * seen-signature dedup and the learn-on-trust allowlist — the user is explicitly
 * asking for this one — so it books the operation when it fully resolves and
 * otherwise enqueues it for review. A no-op (skipped) when the notification does
 * not parse as a bank transaction.
 *
 * @param {{ title?: string, text?: string, packageName?: string, postTime?: number }} notification
 * @returns {Promise<{ created: number, pending: number, skipped: number }>}
 */
export const reAddNotification = async (notification) => {
  const summary = { created: 0, pending: 0, skipped: 0 };

  const descriptor = parseBankNotification(notification);
  if (!descriptor) {
    summary.skipped += 1;
    return summary;
  }

  // operations.date is NOT NULL — always supply a valid date.
  const date = descriptor.date || isoDateFromPostTime(notification.postTime) || todayIso();
  const resolution = await resolveNotification(descriptor);

  // The user explicitly asked to re-add this, so treat its own source as trusted
  // for this booking regardless of the learn-on-trust allowlist.
  const trustedAllowlist = descriptor.packageName ? [descriptor.packageName] : [];
  const getLocation = makeLocationProvider();

  if (descriptor.isTransfer) {
    await bookTransferOrQueue(descriptor, resolution, date, trustedAllowlist, summary, getLocation);
  } else {
    await bookExpenseOrQueue(descriptor, resolution, date, trustedAllowlist, summary, getLocation);
  }

  if (summary.created > 0 || summary.pending > 0) {
    appEvents.emit(EVENTS.RELOAD_ALL);
  }
  return summary;
};

/**
 * Dismiss a pending notification without creating an operation.
 * @param {string} pendingId
 * @returns {Promise<void>}
 */
export const dismissPendingNotification = async (pendingId) => {
  await PendingNotificationsDB.deletePendingNotification(pendingId);
};

export default processBankNotifications;
