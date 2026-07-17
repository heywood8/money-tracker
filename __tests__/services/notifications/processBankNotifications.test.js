/**
 * Tests for the bank-notification ingestion pipeline.
 *
 * Mocks the I/O ports (notification source, preferences, DB writers) and uses
 * the real parser + resolver so the wiring is exercised end to end.
 */

import * as pipeline from '../../../app/services/notifications/processBankNotifications';
import * as NotificationAccess from '../../../app/services/NotificationAccess';
import * as OperationsDB from '../../../app/services/OperationsDB';
import * as AccountsDB from '../../../app/services/AccountsDB';
import * as NotificationRulesDB from '../../../app/services/NotificationRulesDB';
import * as PendingNotificationsDB from '../../../app/services/PendingNotificationsDB';
import { appEvents, EVENTS } from '../../../app/services/eventEmitter';

jest.mock('../../../app/services/NotificationAccess');
jest.mock('../../../app/services/OperationsDB');
jest.mock('../../../app/services/AccountsDB');
jest.mock('../../../app/services/NotificationRulesDB');
jest.mock('../../../app/services/PendingNotificationsDB');

const PREF_KEYS = {
  BANK_NOTIFICATIONS_ENABLED: 'bank_notifications_enabled',
  BANK_NOTIFICATIONS_PROCESSED_SIGS: 'bank_notifications_processed_sigs',
  BANK_NOTIFICATIONS_PACKAGES: 'bank_notifications_packages',
  BANK_NOTIFICATIONS_ATM_ACCOUNT: 'bank_notifications_atm_account',
};
jest.mock('../../../app/services/PreferencesDB', () => ({
  PREF_KEYS: {
    BANK_NOTIFICATIONS_ENABLED: 'bank_notifications_enabled',
    BANK_NOTIFICATIONS_PROCESSED_SIGS: 'bank_notifications_processed_sigs',
    BANK_NOTIFICATIONS_PACKAGES: 'bank_notifications_packages',
    BANK_NOTIFICATIONS_ATM_ACCOUNT: 'bank_notifications_atm_account',
    BANK_NOTIFICATIONS_ACCOUNT_BINDINGS: 'bank_notifications_account_bindings',
  },
  getPreference: jest.fn(),
  setPreference: jest.fn(),
  deletePreference: jest.fn(),
  getNumberPreference: jest.fn(),
  getJsonPreference: jest.fn(),
  setJsonPreference: jest.fn(),
}));
import * as PreferencesDB from '../../../app/services/PreferencesDB';

// Location capture is preference-gated; mock it so we can drive "fix available"
// vs "feature off / no fix" directly. operationLocationFields stays the real pure
// function so the merge-into-createOperation behavior is exercised.
jest.mock('../../../app/services/operationLocation', () => ({
  captureLocationIfEnabled: jest.fn(),
  operationLocationFields: (loc) =>
    loc && loc.latitude != null && loc.longitude != null
      ? { latitude: loc.latitude, longitude: loc.longitude }
      : {},
}));
import * as OperationLocation from '../../../app/services/operationLocation';

// Use the real currency math but stub the live-rate fetch so conversions are
// deterministic and never hit the network.
jest.mock('../../../app/services/currency', () => {
  const actual = jest.requireActual('../../../app/services/currency');
  return { ...actual, fetchLiveExchangeRate: jest.fn() };
});
import * as Currency from '../../../app/services/currency';

const PKG = 'com.banqr.ameriabank';
const PURCHASE = {
  title: 'АРКА транзакции',
  text: 'PURCHASE | 3,900.00 AMD | 4083***7027, | NAREK MEHRABYAN, AM | 28.06.2026 10:15 | BALANCE: 133,719.97 AMD',
  packageName: PKG,
  postTime: 1782000900000,
};
const PURCHASE_NO_DATE = {
  title: 'АРКА транзакции',
  text: 'PURCHASE | 3,900.00 AMD | 4083***7027 | NAREK MEHRABYAN, AM',
  packageName: PKG,
  postTime: 1782000900000,
};
// E-POS (online point-of-sale) purchase charged in EUR on an AMD card account.
const EPOS_EUR = {
  title: 'АРКА транзакции',
  text: 'E-POS PURCHASE | 129.99 EUR | 4083***7027, | Nike ES, ES | 29.06.2026 15:14 | BALANCE: 27,608.20 AMD',
  packageName: PKG,
  postTime: 1782062040000,
};
const C2C = {
  title: 'АРКА транзакции',
  text: 'C2C | 19,200.00 AMD | 4083***7027, | TO: N. DORVANYAN | AMERIABANK API GATE, AM | 28.06.2026 16:23 | BALANCE: 106,819.97 AMD',
  packageName: PKG,
  postTime: 1782002580000,
};
// ATM cash withdrawal — booked as a transfer from the card account to a cash account.
const ATM_CASH = {
  title: 'АРКА транзакции',
  text: 'ATM CASH | 200,000.00 AMD | 4083***7027, | ATM 401 REPUBLIC 67/1, AM | 01.07.2026 09:13 | BALANCE: 111,820.20 AMD',
  packageName: PKG,
  postTime: 1782003180000,
};
const NON_TRANSACTION = {
  title: 'Chat', text: 'Hi there', packageName: 'com.chat', postTime: 1782000800000,
};

// Route getJsonPreference by key: signatures vs allowed-packages.
const prefs = (sigs = [], packages = []) => (key) => {
  if (key === PREF_KEYS.BANK_NOTIFICATIONS_PACKAGES) return packages;
  return sigs;
};

describe('processBankNotifications', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    PreferencesDB.getPreference.mockResolvedValue('1'); // enabled
    PreferencesDB.getJsonPreference.mockImplementation((key) => prefs([], [])(key));
    PreferencesDB.setJsonPreference.mockResolvedValue();
    NotificationAccess.getRecentNotifications.mockResolvedValue([]);
    AccountsDB.getAccountByCardMask.mockResolvedValue(null);
    AccountsDB.getAllAccounts.mockResolvedValue([]);
    // resolveNotification reads the merchant rule once via getMerchantRule;
    // resolvePendingNotification reads the learned label via getLabelForMerchant.
    NotificationRulesDB.getMerchantRule.mockResolvedValue(null);
    NotificationRulesDB.getLabelForMerchant.mockResolvedValue(null);
    OperationsDB.createOperation.mockResolvedValue({ id: 1 });
    PendingNotificationsDB.addPendingNotification.mockResolvedValue({ id: 'p1' });
    AccountsDB.getAccountById.mockResolvedValue(null);
    AccountsDB.addAccountCardMask.mockResolvedValue();
    // No ATM "cash" target account bound by default.
    PreferencesDB.getNumberPreference.mockResolvedValue(null);
    PreferencesDB.setPreference.mockResolvedValue();
    Currency.fetchLiveExchangeRate.mockResolvedValue({ rate: null, source: 'none' });
    // Location feature off by default — no coordinates attached.
    OperationLocation.captureLocationIfEnabled.mockResolvedValue(null);
  });

  it('does nothing when disabled', async () => {
    PreferencesDB.getPreference.mockResolvedValue('0');
    const summary = await pipeline.processBankNotifications();
    expect(summary).toEqual({ created: 0, pending: 0, skipped: 0 });
    expect(NotificationAccess.getRecentNotifications).not.toHaveBeenCalled();
  });

  it('auto-creates an operation when fully matched and source is trusted', async () => {
    NotificationAccess.getRecentNotifications.mockResolvedValue([PURCHASE]);
    AccountsDB.getAccountByCardMask.mockResolvedValue({ id: 7, currency: 'AMD' });
    NotificationRulesDB.getMerchantRule.mockResolvedValue({ categoryId: 'cat-food' });
    PreferencesDB.getJsonPreference.mockImplementation((key) => prefs([], [PKG])(key));
    const emitSpy = jest.spyOn(appEvents, 'emit');

    const summary = await pipeline.processBankNotifications();

    expect(summary).toEqual({ created: 1, pending: 0, skipped: 0 });
    expect(OperationsDB.createOperation).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'expense', amount: '3900.00', accountId: 7,
        categoryId: 'cat-food', date: '2026-06-28', description: 'NAREK MEHRABYAN',
      }),
    );
    expect(emitSpy).toHaveBeenCalledWith(EVENTS.RELOAD_ALL);
  });

  describe('location capture', () => {
    it('attaches the captured location to an auto-created operation when enabled', async () => {
      OperationLocation.captureLocationIfEnabled.mockResolvedValue({ latitude: '40.1', longitude: '44.2' });
      NotificationAccess.getRecentNotifications.mockResolvedValue([PURCHASE]);
      AccountsDB.getAccountByCardMask.mockResolvedValue({ id: 7, currency: 'AMD' });
      NotificationRulesDB.getMerchantRule.mockResolvedValue({ categoryId: 'cat-food' });
      PreferencesDB.getJsonPreference.mockImplementation((key) => prefs([], [PKG])(key));

      await pipeline.processBankNotifications();

      expect(OperationsDB.createOperation).toHaveBeenCalledWith(
        expect.objectContaining({ latitude: '40.1', longitude: '44.2' }),
      );
    });

    it('books an auto-created operation without coordinates when capture yields none', async () => {
      OperationLocation.captureLocationIfEnabled.mockResolvedValue(null);
      NotificationAccess.getRecentNotifications.mockResolvedValue([PURCHASE]);
      AccountsDB.getAccountByCardMask.mockResolvedValue({ id: 7, currency: 'AMD' });
      NotificationRulesDB.getMerchantRule.mockResolvedValue({ categoryId: 'cat-food' });
      PreferencesDB.getJsonPreference.mockImplementation((key) => prefs([], [PKG])(key));

      await pipeline.processBankNotifications();

      const arg = OperationsDB.createOperation.mock.calls[0][0];
      expect(arg).not.toHaveProperty('latitude');
      expect(arg).not.toHaveProperty('longitude');
    });

    it('captures at most one fix per run even across multiple auto-created operations', async () => {
      OperationLocation.captureLocationIfEnabled.mockResolvedValue({ latitude: '40.1', longitude: '44.2' });
      const SECOND = { ...PURCHASE, text: PURCHASE.text.replace('NAREK MEHRABYAN', 'SECOND SHOP'), postTime: PURCHASE.postTime + 1000 };
      NotificationAccess.getRecentNotifications.mockResolvedValue([PURCHASE, SECOND]);
      AccountsDB.getAccountByCardMask.mockResolvedValue({ id: 7, currency: 'AMD' });
      NotificationRulesDB.getMerchantRule.mockResolvedValue({ categoryId: 'cat-food' });
      PreferencesDB.getJsonPreference.mockImplementation((key) => prefs([], [PKG])(key));

      const summary = await pipeline.processBankNotifications();

      expect(summary.created).toBe(2);
      expect(OperationLocation.captureLocationIfEnabled).toHaveBeenCalledTimes(1);
      expect(OperationsDB.createOperation).toHaveBeenNthCalledWith(1,
        expect.objectContaining({ latitude: '40.1', longitude: '44.2' }));
      expect(OperationsDB.createOperation).toHaveBeenNthCalledWith(2,
        expect.objectContaining({ latitude: '40.1', longitude: '44.2' }));
    });

    it('does not capture a location when nothing is auto-created (all queued)', async () => {
      // Untrusted source → the notification is queued, not booked, so no fix.
      NotificationAccess.getRecentNotifications.mockResolvedValue([PURCHASE]);
      AccountsDB.getAccountByCardMask.mockResolvedValue({ id: 7, currency: 'AMD' });
      NotificationRulesDB.getMerchantRule.mockResolvedValue({ categoryId: 'cat-food' });
      PreferencesDB.getJsonPreference.mockImplementation((key) => prefs([], [])(key));

      const summary = await pipeline.processBankNotifications();

      expect(summary).toEqual({ created: 0, pending: 1, skipped: 0 });
      expect(OperationLocation.captureLocationIfEnabled).not.toHaveBeenCalled();
    });

    it('attaches the captured location when resolving a pending notification', async () => {
      OperationLocation.captureLocationIfEnabled.mockResolvedValue({ latitude: '1.5', longitude: '2.5' });
      PendingNotificationsDB.getPendingNotificationById.mockResolvedValue({
        id: 'p1', type: 'expense', amount: '3900.00', currency: 'AMD',
        cardMask: '4083***7027', merchant: 'NAREK MEHRABYAN', date: '2026-06-28',
        accountId: null, categoryId: null, packageName: PKG,
        createdAt: '2026-06-28T10:15:00.000Z',
      });

      await pipeline.resolvePendingNotification('p1', { accountId: 7, categoryId: 'cat-food' });

      expect(OperationsDB.createOperation).toHaveBeenCalledWith(
        expect.objectContaining({ latitude: '1.5', longitude: '2.5' }),
      );
    });
  });

  it('uses a learned label override as the operation label on auto-create', async () => {
    NotificationAccess.getRecentNotifications.mockResolvedValue([PURCHASE]);
    AccountsDB.getAccountByCardMask.mockResolvedValue({ id: 7, currency: 'AMD' });
    NotificationRulesDB.getMerchantRule.mockResolvedValue({ categoryId: 'cat-food', labelOverride: 'Ecosense' });
    PreferencesDB.getJsonPreference.mockImplementation((key) => prefs([], [PKG])(key));

    await pipeline.processBankNotifications();

    expect(OperationsDB.createOperation).toHaveBeenCalledWith(
      expect.objectContaining({ description: 'Ecosense' }),
    );
  });

  it('rounds the auto-created amount per the account rounding setting', async () => {
    const ROUNDED = {
      ...PURCHASE,
      text: 'PURCHASE | 3,916.00 AMD | 4083***7027, | NAREK MEHRABYAN, AM | 28.06.2026 10:15 | BALANCE: 133,719.97 AMD',
    };
    NotificationAccess.getRecentNotifications.mockResolvedValue([ROUNDED]);
    AccountsDB.getAccountByCardMask.mockResolvedValue({ id: 7, currency: 'AMD', autoTxnRounding: 100 });
    NotificationRulesDB.getMerchantRule.mockResolvedValue({ categoryId: 'cat-food' });
    PreferencesDB.getJsonPreference.mockImplementation((key) => prefs([], [PKG])(key));

    const summary = await pipeline.processBankNotifications();

    expect(summary).toEqual({ created: 1, pending: 0, skipped: 0 });
    // 3916 AMD rounded to the nearest 100 → 3900 (AMD has 0 decimals)
    expect(OperationsDB.createOperation).toHaveBeenCalledWith(
      expect.objectContaining({ amount: '3900' }),
    );
  });

  it("rounds the auto-created amount up when the account rounding mode is 'up'", async () => {
    const ROUNDED = {
      ...PURCHASE,
      text: 'PURCHASE | 3,916.00 AMD | 4083***7027, | NAREK MEHRABYAN, AM | 28.06.2026 10:15 | BALANCE: 133,719.97 AMD',
    };
    NotificationAccess.getRecentNotifications.mockResolvedValue([ROUNDED]);
    AccountsDB.getAccountByCardMask.mockResolvedValue({ id: 7, currency: 'AMD', autoTxnRounding: 100, autoTxnRoundingMode: 'up' });
    NotificationRulesDB.getMerchantRule.mockResolvedValue({ categoryId: 'cat-food' });
    PreferencesDB.getJsonPreference.mockImplementation((key) => prefs([], [PKG])(key));

    await pipeline.processBankNotifications();

    // 3916 AMD rounded up to the next 100 → 4000 (AMD has 0 decimals)
    expect(OperationsDB.createOperation).toHaveBeenCalledWith(
      expect.objectContaining({ amount: '4000' }),
    );
  });

  it("rounds the auto-created amount down when the account rounding mode is 'down'", async () => {
    // 3960 rounds up to 4000 in the default 'nearest' mode, so 'down' → 3900 is
    // a distinct, direction-specific result.
    const ROUNDED = {
      ...PURCHASE,
      text: 'PURCHASE | 3,960.00 AMD | 4083***7027, | NAREK MEHRABYAN, AM | 28.06.2026 10:15 | BALANCE: 133,719.97 AMD',
    };
    NotificationAccess.getRecentNotifications.mockResolvedValue([ROUNDED]);
    AccountsDB.getAccountByCardMask.mockResolvedValue({ id: 7, currency: 'AMD', autoTxnRounding: 100, autoTxnRoundingMode: 'down' });
    NotificationRulesDB.getMerchantRule.mockResolvedValue({ categoryId: 'cat-food' });
    PreferencesDB.getJsonPreference.mockImplementation((key) => prefs([], [PKG])(key));

    await pipeline.processBankNotifications();

    // 3960 AMD rounded down to the previous 100 → 3900 (AMD has 0 decimals)
    expect(OperationsDB.createOperation).toHaveBeenCalledWith(
      expect.objectContaining({ amount: '3900' }),
    );
  });

  it('rounds the converted amount on a currency mismatch, leaving the foreign value intact', async () => {
    NotificationAccess.getRecentNotifications.mockResolvedValue([PURCHASE]); // 3,900 AMD
    AccountsDB.getAccountByCardMask.mockResolvedValue({ id: 7, currency: 'USD', autoTxnRounding: 10 });
    NotificationRulesDB.getMerchantRule.mockResolvedValue({ categoryId: 'cat-food' });
    PreferencesDB.getJsonPreference.mockImplementation((key) => prefs([], [PKG])(key));
    Currency.fetchLiveExchangeRate.mockResolvedValue({ rate: '0.0026', source: 'offline' });

    await pipeline.processBankNotifications();

    expect(OperationsDB.createOperation).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: '10.00',          // 10.14 USD rounded to the nearest 10
        destinationAmount: '3900', // original foreign value preserved (unrounded)
        sourceCurrency: 'AMD',
        destinationCurrency: 'USD',
      }),
    );
  });

  it('does not round the auto-created amount when no rounding is set', async () => {
    NotificationAccess.getRecentNotifications.mockResolvedValue([PURCHASE]); // 3,900.00 AMD
    AccountsDB.getAccountByCardMask.mockResolvedValue({ id: 7, currency: 'AMD' }); // no autoTxnRounding
    NotificationRulesDB.getMerchantRule.mockResolvedValue({ categoryId: 'cat-food' });
    PreferencesDB.getJsonPreference.mockImplementation((key) => prefs([], [PKG])(key));

    await pipeline.processBankNotifications();

    expect(OperationsDB.createOperation).toHaveBeenCalledWith(
      expect.objectContaining({ amount: '3900.00' }),
    );
  });

  it('queues instead of auto-creating when the source is not trusted', async () => {
    NotificationAccess.getRecentNotifications.mockResolvedValue([PURCHASE]);
    AccountsDB.getAccountByCardMask.mockResolvedValue({ id: 7, currency: 'AMD' });
    NotificationRulesDB.getMerchantRule.mockResolvedValue({ categoryId: 'cat-food' });
    // allowlist empty -> not trusted
    const summary = await pipeline.processBankNotifications();
    expect(summary).toEqual({ created: 0, pending: 1, skipped: 0 });
    expect(OperationsDB.createOperation).not.toHaveBeenCalled();
    expect(PendingNotificationsDB.addPendingNotification).toHaveBeenCalled();
  });

  it('auto-creates with a converted amount on a currency mismatch (trusted, fully matched)', async () => {
    NotificationAccess.getRecentNotifications.mockResolvedValue([PURCHASE]); // 3,900 AMD
    AccountsDB.getAccountByCardMask.mockResolvedValue({ id: 7, currency: 'USD' });
    NotificationRulesDB.getMerchantRule.mockResolvedValue({ categoryId: 'cat-food' });
    PreferencesDB.getJsonPreference.mockImplementation((key) => prefs([], [PKG])(key));
    Currency.fetchLiveExchangeRate.mockResolvedValue({ rate: '0.0026', source: 'offline' });

    const summary = await pipeline.processBankNotifications();

    expect(summary).toEqual({ created: 1, pending: 0, skipped: 0 });
    expect(Currency.fetchLiveExchangeRate).toHaveBeenCalledWith('AMD', 'USD');
    expect(OperationsDB.createOperation).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'expense',
        accountId: 7,
        categoryId: 'cat-food',
        amount: '10.14', // 3900 AMD * 0.0026 → USD
        destinationAmount: '3900', // original foreign value (AMD, 0 decimals)
        sourceCurrency: 'AMD',
        destinationCurrency: 'USD',
      }),
    );
  });

  it('queues a foreign-currency purchase when no exchange rate is available', async () => {
    NotificationAccess.getRecentNotifications.mockResolvedValue([PURCHASE]); // AMD
    AccountsDB.getAccountByCardMask.mockResolvedValue({ id: 7, currency: 'USD' });
    NotificationRulesDB.getMerchantRule.mockResolvedValue({ categoryId: 'cat-food' });
    PreferencesDB.getJsonPreference.mockImplementation((key) => prefs([], [PKG])(key));
    Currency.fetchLiveExchangeRate.mockResolvedValue({ rate: null, source: 'none' });

    const summary = await pipeline.processBankNotifications();

    expect(summary).toEqual({ created: 0, pending: 1, skipped: 0 });
    expect(OperationsDB.createOperation).not.toHaveBeenCalled();
    // Account + category are still suggested for the review queue.
    expect(PendingNotificationsDB.addPendingNotification).toHaveBeenCalledWith(
      expect.objectContaining({ accountId: 7, categoryId: 'cat-food' }),
    );
  });

  it('does not fetch an exchange rate for a foreign-currency notification destined for the review queue', async () => {
    // Account resolves (currency mismatch) but the merchant has no learned
    // category, so the item will be queued — converting now would be wasted work
    // (the result is discarded and recomputed at resolve time).
    NotificationAccess.getRecentNotifications.mockResolvedValue([EPOS_EUR]); // EUR
    AccountsDB.getAccountByCardMask.mockResolvedValue({ id: 7, currency: 'AMD' });
    NotificationRulesDB.getMerchantRule.mockResolvedValue(null); // no category
    PreferencesDB.getJsonPreference.mockImplementation((key) => prefs([], [PKG])(key));

    const summary = await pipeline.processBankNotifications();

    expect(summary).toEqual({ created: 0, pending: 1, skipped: 0 });
    expect(Currency.fetchLiveExchangeRate).not.toHaveBeenCalled();
    expect(OperationsDB.createOperation).not.toHaveBeenCalled();
  });

  it('does not fetch an exchange rate for a foreign-currency notification from an untrusted source', async () => {
    NotificationAccess.getRecentNotifications.mockResolvedValue([EPOS_EUR]); // EUR
    AccountsDB.getAccountByCardMask.mockResolvedValue({ id: 7, currency: 'AMD' });
    NotificationRulesDB.getMerchantRule.mockResolvedValue({ categoryId: 'cat-shopping' });
    // allowlist empty → not trusted → not eligible for auto-create

    const summary = await pipeline.processBankNotifications();

    expect(summary).toEqual({ created: 0, pending: 1, skipped: 0 });
    expect(Currency.fetchLiveExchangeRate).not.toHaveBeenCalled();
  });

  it('auto-creates an E-POS PURCHASE, converting the foreign amount to the account currency', async () => {
    NotificationAccess.getRecentNotifications.mockResolvedValue([EPOS_EUR]); // 129.99 EUR
    AccountsDB.getAccountByCardMask.mockResolvedValue({ id: 7, currency: 'AMD' });
    NotificationRulesDB.getMerchantRule.mockResolvedValue({ categoryId: 'cat-shopping' });
    PreferencesDB.getJsonPreference.mockImplementation((key) => prefs([], [PKG])(key));
    Currency.fetchLiveExchangeRate.mockResolvedValue({ rate: '418.5', source: 'offline' });

    const summary = await pipeline.processBankNotifications();

    expect(summary).toEqual({ created: 1, pending: 0, skipped: 0 });
    expect(Currency.fetchLiveExchangeRate).toHaveBeenCalledWith('EUR', 'AMD');
    expect(OperationsDB.createOperation).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'expense',
        accountId: 7,
        categoryId: 'cat-shopping',
        amount: '54401', // 129.99 EUR * 418.5 → AMD (0 decimals)
        destinationAmount: '129.99',
        sourceCurrency: 'EUR',
        destinationCurrency: 'AMD',
        description: 'Nike ES',
      }),
    );
  });

  it('queues a pending item when not fully matched', async () => {
    NotificationAccess.getRecentNotifications.mockResolvedValue([PURCHASE]);
    AccountsDB.getAccountByCardMask.mockResolvedValue({ id: 7, currency: 'AMD' });
    NotificationRulesDB.getMerchantRule.mockResolvedValue(null); // no category

    const summary = await pipeline.processBankNotifications();

    expect(summary).toEqual({ created: 0, pending: 1, skipped: 0 });
    expect(OperationsDB.createOperation).not.toHaveBeenCalled();
    expect(PendingNotificationsDB.addPendingNotification).toHaveBeenCalledWith(
      expect.objectContaining({ merchant: 'NAREK MEHRABYAN', cardMask: '4083***7027', accountId: 7 }),
    );
  });

  // Regression: a learned merchant->category must still pre-fill the pending item
  // even when the account cannot be resolved. Reproduces the real T-Bank case —
  // the notification carries a card mask that isn't bound yet AND there are two
  // non-hidden RUB accounts, so the single-account fallback can't fire. The
  // category (merchant-derived) must not be dropped just because the account is
  // unknown, otherwise a binding visible in the bindings list never gets applied.
  it('pre-fills the learned category in the pending item even when the account does not resolve', async () => {
    const TBANK_PURCHASE = {
      title: 'PEREKRESTOK',
      text: 'Покупка на 1304,89 ₽, кэшбэк 65 ₽, счет карты *4087 Доступно 148 000 ₽',
      packageName: 'com.idamob.tinkoff.android',
      postTime: 1782000900000,
    };
    NotificationAccess.getRecentNotifications.mockResolvedValue([TBANK_PURCHASE]);
    // Card mask *4087 is not bound to any account.
    AccountsDB.getAccountByCardMask.mockResolvedValue(null);
    // Two non-hidden RUB accounts → the single-currency fallback finds >1 match
    // and returns null, so no account resolves.
    AccountsDB.getAllAccounts.mockResolvedValue([
      { id: 23, currency: 'RUB', hidden: 0 },
      { id: 24, currency: 'RUB', hidden: 0 },
    ]);
    // But the merchant already has a learned category.
    NotificationRulesDB.getMerchantRule.mockResolvedValue({ categoryId: 'cat-transport' });

    const summary = await pipeline.processBankNotifications();

    expect(summary).toEqual({ created: 0, pending: 1, skipped: 0 });
    expect(OperationsDB.createOperation).not.toHaveBeenCalled();
    expect(PendingNotificationsDB.addPendingNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        merchant: 'PEREKRESTOK',
        cardMask: '*4087',
        accountId: null,
        categoryId: 'cat-transport',
      }),
    );
  });

  describe('C2C transfers always require a manual category', () => {
    it('queues a C2C transfer even when the card resolves and the source is trusted', async () => {
      NotificationAccess.getRecentNotifications.mockResolvedValue([C2C]);
      AccountsDB.getAccountByCardMask.mockResolvedValue({ id: 7, currency: 'AMD' });
      // Even a learned rule for this person must not auto-apply or auto-create.
      NotificationRulesDB.getMerchantRule.mockResolvedValue({ categoryId: 'cat-loan' });
      PreferencesDB.getJsonPreference.mockImplementation((key) => prefs([], [PKG])(key));

      const summary = await pipeline.processBankNotifications();

      expect(summary).toEqual({ created: 0, pending: 1, skipped: 0 });
      expect(OperationsDB.createOperation).not.toHaveBeenCalled();
      // Queued with the recipient as merchant and the category left blank.
      expect(PendingNotificationsDB.addPendingNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          kind: 'C2C', merchant: 'N. DORVANYAN', accountId: 7, categoryId: null,
        }),
      );
    });
  });

  describe('ATM CASH withdrawals (transfer)', () => {
    it('auto-creates a transfer when the card + a bound cash account resolve and the source is trusted', async () => {
      NotificationAccess.getRecentNotifications.mockResolvedValue([ATM_CASH]);
      AccountsDB.getAccountByCardMask.mockResolvedValue({ id: 7, currency: 'AMD' });
      PreferencesDB.getJsonPreference.mockImplementation((key) => prefs([], [PKG])(key));
      // A cash account (id 9) is bound as the ATM transfer target.
      PreferencesDB.getNumberPreference.mockResolvedValue(9);
      AccountsDB.getAccountById.mockResolvedValue({ id: 9, currency: 'AMD' });

      const summary = await pipeline.processBankNotifications();

      expect(summary).toEqual({ created: 1, pending: 0, skipped: 0 });
      expect(OperationsDB.createOperation).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'transfer', amount: '200000', accountId: 7, toAccountId: 9,
          date: '2026-07-01', description: 'ATM 401 REPUBLIC 67/1',
        }),
      );
    });

    it('queues the transfer when no cash account is bound yet (first time)', async () => {
      NotificationAccess.getRecentNotifications.mockResolvedValue([ATM_CASH]);
      AccountsDB.getAccountByCardMask.mockResolvedValue({ id: 7, currency: 'AMD' });
      PreferencesDB.getJsonPreference.mockImplementation((key) => prefs([], [PKG])(key));
      PreferencesDB.getNumberPreference.mockResolvedValue(null); // no target bound

      const summary = await pipeline.processBankNotifications();

      expect(summary).toEqual({ created: 0, pending: 1, skipped: 0 });
      expect(OperationsDB.createOperation).not.toHaveBeenCalled();
      expect(PendingNotificationsDB.addPendingNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          kind: 'ATM CASH', type: 'transfer', merchant: 'ATM 401 REPUBLIC 67/1',
          accountId: 7, categoryId: null,
        }),
      );
    });

    it('queues the transfer when the source is not trusted even if a cash account is bound', async () => {
      NotificationAccess.getRecentNotifications.mockResolvedValue([ATM_CASH]);
      AccountsDB.getAccountByCardMask.mockResolvedValue({ id: 7, currency: 'AMD' });
      PreferencesDB.getNumberPreference.mockResolvedValue(9);
      AccountsDB.getAccountById.mockResolvedValue({ id: 9, currency: 'AMD' });
      // allowlist empty -> not trusted

      const summary = await pipeline.processBankNotifications();

      expect(summary).toEqual({ created: 0, pending: 1, skipped: 0 });
      expect(OperationsDB.createOperation).not.toHaveBeenCalled();
    });
  });

  describe('ATM target account binding helpers', () => {
    it('resolves the bound cash account from the preference', async () => {
      PreferencesDB.getNumberPreference.mockResolvedValue(9);
      AccountsDB.getAccountById.mockResolvedValue({ id: 9, currency: 'AMD' });
      const account = await pipeline.resolveAtmTargetAccount();
      expect(account).toEqual({ id: 9, currency: 'AMD' });
    });

    it('returns null when no cash account is bound', async () => {
      PreferencesDB.getNumberPreference.mockResolvedValue(null);
      const account = await pipeline.resolveAtmTargetAccount();
      expect(account).toBeNull();
    });

    it('persists the chosen cash account', async () => {
      await pipeline.setAtmTargetAccount(9);
      expect(PreferencesDB.setPreference).toHaveBeenCalledWith(
        'bank_notifications_atm_account',
        '9',
      );
    });

    it('clears the bound cash account by deleting the preference', async () => {
      await pipeline.clearAtmTargetAccount();
      expect(PreferencesDB.deletePreference).toHaveBeenCalledWith(
        'bank_notifications_atm_account',
      );
    });
  });

  it('falls back to a valid date when the notification has none', async () => {
    NotificationAccess.getRecentNotifications.mockResolvedValue([PURCHASE_NO_DATE]);
    AccountsDB.getAccountByCardMask.mockResolvedValue({ id: 7, currency: 'AMD' });
    NotificationRulesDB.getMerchantRule.mockResolvedValue({ categoryId: 'cat-food' });
    PreferencesDB.getJsonPreference.mockImplementation((key) => prefs([], [PKG])(key));

    await pipeline.processBankNotifications();

    const arg = OperationsDB.createOperation.mock.calls[0][0];
    expect(arg.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(arg.date).not.toBeNull();
  });

  it('skips non-transaction notifications but records them as seen', async () => {
    NotificationAccess.getRecentNotifications.mockResolvedValue([NON_TRANSACTION]);
    const summary = await pipeline.processBankNotifications();
    expect(summary).toEqual({ created: 0, pending: 0, skipped: 1 });
    expect(PreferencesDB.setJsonPreference).toHaveBeenCalled();
  });

  it('does not reprocess an already-seen notification', async () => {
    const sig = pipeline.notificationSignature(PURCHASE);
    PreferencesDB.getJsonPreference.mockImplementation((key) => prefs([sig], [PKG])(key));
    NotificationAccess.getRecentNotifications.mockResolvedValue([PURCHASE]);
    AccountsDB.getAccountByCardMask.mockResolvedValue({ id: 7, currency: 'AMD' });
    NotificationRulesDB.getMerchantRule.mockResolvedValue({ categoryId: 'cat-food' });

    const summary = await pipeline.processBankNotifications();
    expect(summary).toEqual({ created: 0, pending: 0, skipped: 0 });
    expect(OperationsDB.createOperation).not.toHaveBeenCalled();
  });

  it('retries (does not record signature) when processing throws', async () => {
    NotificationAccess.getRecentNotifications.mockResolvedValue([PURCHASE]);
    AccountsDB.getAccountByCardMask.mockResolvedValue({ id: 7, currency: 'AMD' });
    NotificationRulesDB.getMerchantRule.mockResolvedValue({ categoryId: 'cat-food' });
    PreferencesDB.getJsonPreference.mockImplementation((key) => prefs([], [PKG])(key));
    OperationsDB.createOperation.mockRejectedValue(new Error('db down'));

    const summary = await pipeline.processBankNotifications();
    expect(summary).toEqual({ created: 0, pending: 0, skipped: 0 });
    expect(PreferencesDB.setJsonPreference).not.toHaveBeenCalled();
  });

  it('shares a single run across overlapping calls (concurrency guard)', async () => {
    NotificationAccess.getRecentNotifications.mockResolvedValue([NON_TRANSACTION]);
    const [a, b] = await Promise.all([
      pipeline.processBankNotifications(),
      pipeline.processBankNotifications(),
    ]);
    expect(a).toBe(b); // same in-flight promise/result
    expect(NotificationAccess.getRecentNotifications).toHaveBeenCalledTimes(1);
  });

  describe('isBankNotificationsEnabled / setBankNotificationsEnabled', () => {
    it('reads the flag', async () => {
      PreferencesDB.getPreference.mockResolvedValue('1');
      expect(await pipeline.isBankNotificationsEnabled()).toBe(true);
      PreferencesDB.getPreference.mockResolvedValue('0');
      expect(await pipeline.isBankNotificationsEnabled()).toBe(false);
    });
    it('writes the flag', async () => {
      await pipeline.setBankNotificationsEnabled(true);
      expect(PreferencesDB.setPreference).toHaveBeenCalledWith('bank_notifications_enabled', '1');
    });
  });

  describe('resolvePendingNotification', () => {
    const pending = {
      id: 'p1', type: 'expense', amount: '3900.00', currency: 'AMD',
      cardMask: '4083***7027', merchant: 'NAREK MEHRABYAN', date: '2026-06-28',
      accountId: null, categoryId: null, packageName: PKG,
      createdAt: '2026-06-28T10:15:00.000Z',
    };

    it('creates the operation and learns card, merchant, and source', async () => {
      PendingNotificationsDB.getPendingNotificationById.mockResolvedValue(pending);
      await pipeline.resolvePendingNotification('p1', { accountId: 7, categoryId: 'cat-food' });

      expect(OperationsDB.createOperation).toHaveBeenCalledWith(
        expect.objectContaining({ accountId: 7, categoryId: 'cat-food', amount: '3900.00', date: '2026-06-28' }),
      );
      expect(AccountsDB.addAccountCardMask).toHaveBeenCalledWith(7, '4083***7027');
      expect(NotificationRulesDB.upsertMerchantRule).toHaveBeenCalledWith('NAREK MEHRABYAN', 'cat-food', PKG);
      expect(PreferencesDB.setJsonPreference).toHaveBeenCalledWith(
        'bank_notifications_packages', [PKG],
      );
      expect(PendingNotificationsDB.deletePendingNotification).toHaveBeenCalledWith('p1');
    });

    it('bumps the merchant rule match so its binding floats to the top', async () => {
      PendingNotificationsDB.getPendingNotificationById.mockResolvedValue(pending);
      await pipeline.resolvePendingNotification('p1', { accountId: 7, categoryId: 'cat-food' });
      expect(NotificationRulesDB.touchMerchantRuleMatch).toHaveBeenCalledWith('NAREK MEHRABYAN', PKG);
    });

    it('converts the amount to the chosen account currency when they differ', async () => {
      PendingNotificationsDB.getPendingNotificationById.mockResolvedValue({
        ...pending, amount: '129.99', currency: 'EUR', merchant: 'Nike ES',
      });
      AccountsDB.getAccountById.mockResolvedValue({ id: 7, currency: 'AMD' });
      Currency.fetchLiveExchangeRate.mockResolvedValue({ rate: '418.5', source: 'offline' });

      await pipeline.resolvePendingNotification('p1', { accountId: 7, categoryId: 'cat-shopping' });

      expect(Currency.fetchLiveExchangeRate).toHaveBeenCalledWith('EUR', 'AMD');
      expect(OperationsDB.createOperation).toHaveBeenCalledWith(
        expect.objectContaining({
          accountId: 7,
          categoryId: 'cat-shopping',
          amount: '54401', // 129.99 EUR * 418.5 → AMD
          destinationAmount: '129.99',
          sourceCurrency: 'EUR',
          destinationCurrency: 'AMD',
        }),
      );
    });

    it('normalizes the amount to the account currency decimal places when currencies match', async () => {
      // AMD has 0 decimal places: a '3900.00' charge should be stored as '3900',
      // matching how a hand-entered AMD operation is formatted.
      PendingNotificationsDB.getPendingNotificationById.mockResolvedValue({
        ...pending, amount: '3900.00', currency: 'AMD',
      });
      AccountsDB.getAccountById.mockResolvedValue({ id: 7, currency: 'AMD' });

      await pipeline.resolvePendingNotification('p1', { accountId: 7, categoryId: 'cat-food' });

      expect(Currency.fetchLiveExchangeRate).not.toHaveBeenCalled();
      expect(OperationsDB.createOperation).toHaveBeenCalledWith(
        expect.objectContaining({ amount: '3900' }),
      );
    });

    it('rounds the booked amount per the account rounding setting (regression)', async () => {
      // A merchant charge of 7160 AMD resolved from the review queue against an
      // account with rounding=100 must be stored as 7200 — matching the
      // auto-create path, which previously rounded while this path did not.
      PendingNotificationsDB.getPendingNotificationById.mockResolvedValue({
        ...pending, amount: '7160.00', currency: 'AMD',
      });
      AccountsDB.getAccountById.mockResolvedValue({ id: 7, currency: 'AMD', autoTxnRounding: 100 });

      await pipeline.resolvePendingNotification('p1', { accountId: 7, categoryId: 'cat-food' });

      expect(OperationsDB.createOperation).toHaveBeenCalledWith(
        expect.objectContaining({ amount: '7200' }),
      );
    });

    it('rounds the converted amount on a currency mismatch, leaving the foreign value intact', async () => {
      PendingNotificationsDB.getPendingNotificationById.mockResolvedValue({
        ...pending, amount: '129.99', currency: 'EUR', merchant: 'Nike ES',
      });
      AccountsDB.getAccountById.mockResolvedValue({ id: 7, currency: 'AMD', autoTxnRounding: 100 });
      Currency.fetchLiveExchangeRate.mockResolvedValue({ rate: '418.5', source: 'offline' });

      await pipeline.resolvePendingNotification('p1', { accountId: 7, categoryId: 'cat-shopping' });

      expect(OperationsDB.createOperation).toHaveBeenCalledWith(
        expect.objectContaining({
          amount: '54400',           // 54401 AMD rounded to the nearest 100
          destinationAmount: '129.99', // original foreign value preserved (unrounded)
        }),
      );
    });

    it('throws (does not book a wrong amount) when no rate is available for a foreign purchase', async () => {
      PendingNotificationsDB.getPendingNotificationById.mockResolvedValue({
        ...pending, amount: '129.99', currency: 'EUR',
      });
      AccountsDB.getAccountById.mockResolvedValue({ id: 7, currency: 'AMD' });
      Currency.fetchLiveExchangeRate.mockResolvedValue({ rate: null, source: 'none' });

      await expect(
        pipeline.resolvePendingNotification('p1', { accountId: 7, categoryId: 'cat-shopping' }),
      ).rejects.toThrow(/exchange rate/);
      expect(OperationsDB.createOperation).not.toHaveBeenCalled();
    });

    it('falls back to a valid date when the pending row has none', async () => {
      PendingNotificationsDB.getPendingNotificationById.mockResolvedValue({ ...pending, date: null });
      await pipeline.resolvePendingNotification('p1', { accountId: 7, categoryId: 'cat-food' });
      const arg = OperationsDB.createOperation.mock.calls[0][0];
      expect(arg.date).toBe('2026-06-28'); // from createdAt
    });

    it('throws when no account is chosen', async () => {
      PendingNotificationsDB.getPendingNotificationById.mockResolvedValue(pending);
      await expect(pipeline.resolvePendingNotification('p1', { categoryId: 'cat-food' }))
        .rejects.toThrow(/account/);
    });

    it('does not learn bindings when opted out', async () => {
      PendingNotificationsDB.getPendingNotificationById.mockResolvedValue(pending);
      await pipeline.resolvePendingNotification('p1', {
        accountId: 7, categoryId: 'cat-food',
        learnCardMask: false, learnMerchant: false, learnSource: false,
      });
      expect(AccountsDB.addAccountCardMask).not.toHaveBeenCalled();
      expect(NotificationRulesDB.upsertMerchantRule).not.toHaveBeenCalled();
    });

    // A card-less notification (T-Bank SBP "счет RUB") carries no card mask, so
    // the manual pick is remembered as an (app + currency) -> account binding
    // instead of a card mask.
    const cardlessPending = {
      ...pending, cardMask: null, currency: 'RUB', merchant: 'РЖД',
      packageName: 'com.idamob.tinkoff.android',
    };

    it('learns the (app+currency) account binding for a card-less notification', async () => {
      PendingNotificationsDB.getPendingNotificationById.mockResolvedValue(cardlessPending);
      AccountsDB.getAccountById.mockResolvedValue({ id: 7, currency: 'RUB' });
      await pipeline.resolvePendingNotification('p1', { accountId: 7, categoryId: 'cat-food' });
      expect(PreferencesDB.setJsonPreference).toHaveBeenCalledWith(
        'bank_notifications_account_bindings',
        { 'com.idamob.tinkoff.android|RUB': 7 },
      );
      // No card to learn for a card-less notification.
      expect(AccountsDB.addAccountCardMask).not.toHaveBeenCalled();
    });

    it('does not learn an account binding when opted out', async () => {
      PendingNotificationsDB.getPendingNotificationById.mockResolvedValue(cardlessPending);
      AccountsDB.getAccountById.mockResolvedValue({ id: 7, currency: 'RUB' });
      await pipeline.resolvePendingNotification('p1', {
        accountId: 7, categoryId: 'cat-food', learnAccountBinding: false,
      });
      expect(PreferencesDB.setJsonPreference).not.toHaveBeenCalledWith(
        'bank_notifications_account_bindings', expect.anything(),
      );
    });

    it('does not learn an account binding when the chosen account currency differs', async () => {
      // Booking a RUB SBP charge against a USD account converts the amount, but the
      // RUB->account key would mis-book future RUB notifications, so nothing is learned.
      PendingNotificationsDB.getPendingNotificationById.mockResolvedValue(cardlessPending);
      AccountsDB.getAccountById.mockResolvedValue({ id: 7, currency: 'USD' });
      Currency.fetchLiveExchangeRate.mockResolvedValue({ rate: '0.011', source: 'offline' });
      await pipeline.resolvePendingNotification('p1', { accountId: 7, categoryId: 'cat-food' });
      expect(PreferencesDB.setJsonPreference).not.toHaveBeenCalledWith(
        'bank_notifications_account_bindings', expect.anything(),
      );
    });

    it('returns null for an unknown pending id', async () => {
      PendingNotificationsDB.getPendingNotificationById.mockResolvedValue(null);
      expect(await pipeline.resolvePendingNotification('nope', { accountId: 7 })).toBeNull();
    });

    it('applies and learns a typed label override', async () => {
      PendingNotificationsDB.getPendingNotificationById.mockResolvedValue({
        ...pending, merchant: 'ECOSENSE BYUZAND',
      });
      await pipeline.resolvePendingNotification('p1', {
        accountId: 7, categoryId: 'cat-health', labelOverride: 'Ecosense',
      });

      // The operation carries the override, not the raw shop name...
      expect(OperationsDB.createOperation).toHaveBeenCalledWith(
        expect.objectContaining({ description: 'Ecosense' }),
      );
      // ...and the override is remembered for future notifications.
      expect(NotificationRulesDB.upsertMerchantLabel).toHaveBeenCalledWith(
        'ECOSENSE BYUZAND', 'Ecosense', PKG,
      );
    });

    it('clears a learned override when the review field is blanked', async () => {
      PendingNotificationsDB.getPendingNotificationById.mockResolvedValue({
        ...pending, merchant: 'ECOSENSE BYUZAND',
      });
      NotificationRulesDB.getLabelForMerchant.mockResolvedValue('Ecosense');

      // User cleared the pre-filled name to revert this op to the raw shop name.
      await pipeline.resolvePendingNotification('p1', {
        accountId: 7, categoryId: 'cat-health', labelOverride: '',
      });

      // The operation falls back to the raw shop name...
      expect(OperationsDB.createOperation).toHaveBeenCalledWith(
        expect.objectContaining({ description: 'ECOSENSE BYUZAND' }),
      );
      // ...and the blanked field clears the stored override.
      expect(NotificationRulesDB.upsertMerchantLabel).toHaveBeenCalledWith(
        'ECOSENSE BYUZAND', '', PKG,
      );
    });

    it('does not rewrite an unchanged pre-filled override', async () => {
      PendingNotificationsDB.getPendingNotificationById.mockResolvedValue({
        ...pending, merchant: 'ECOSENSE BYUZAND',
      });
      NotificationRulesDB.getLabelForMerchant.mockResolvedValue('Ecosense');

      // The field was pre-filled with the learned name and saved unchanged.
      await pipeline.resolvePendingNotification('p1', {
        accountId: 7, categoryId: 'cat-health', labelOverride: 'Ecosense',
      });

      expect(OperationsDB.createOperation).toHaveBeenCalledWith(
        expect.objectContaining({ description: 'Ecosense' }),
      );
      // No change → no write (avoids updated_at churn / rules reordering).
      expect(NotificationRulesDB.upsertMerchantLabel).not.toHaveBeenCalled();
    });

    it('falls back to a previously-learned override when none is typed', async () => {
      PendingNotificationsDB.getPendingNotificationById.mockResolvedValue({
        ...pending, merchant: 'ECOSENSE BYUZAND',
      });
      NotificationRulesDB.getLabelForMerchant.mockResolvedValue('Ecosense');

      await pipeline.resolvePendingNotification('p1', { accountId: 7, categoryId: 'cat-health' });

      expect(OperationsDB.createOperation).toHaveBeenCalledWith(
        expect.objectContaining({ description: 'Ecosense' }),
      );
      // Nothing new typed, so no learning happens.
      expect(NotificationRulesDB.upsertMerchantLabel).not.toHaveBeenCalled();
    });

    it('uses the raw merchant when there is no override at all', async () => {
      PendingNotificationsDB.getPendingNotificationById.mockResolvedValue(pending);
      NotificationRulesDB.getLabelForMerchant.mockResolvedValue(null);

      await pipeline.resolvePendingNotification('p1', { accountId: 7, categoryId: 'cat-food' });

      expect(OperationsDB.createOperation).toHaveBeenCalledWith(
        expect.objectContaining({ description: 'NAREK MEHRABYAN' }),
      );
      expect(NotificationRulesDB.upsertMerchantLabel).not.toHaveBeenCalled();
    });

    it('does not learn a merchant rule for a C2C transfer, even with a category', async () => {
      PendingNotificationsDB.getPendingNotificationById.mockResolvedValue({
        ...pending, kind: 'C2C', merchant: 'N. DORVANYAN',
      });
      await pipeline.resolvePendingNotification('p1', { accountId: 7, categoryId: 'cat-loan' });

      // The operation is still created and the card still learned...
      expect(OperationsDB.createOperation).toHaveBeenCalledWith(
        expect.objectContaining({ accountId: 7, categoryId: 'cat-loan' }),
      );
      expect(AccountsDB.addAccountCardMask).toHaveBeenCalledWith(7, '4083***7027');
      // ...but the friend -> category rule is never remembered.
      expect(NotificationRulesDB.upsertMerchantRule).not.toHaveBeenCalled();
    });

    it('does not learn a merchant rule for a DEBIT ACCOUNT debit, even with a category', async () => {
      PendingNotificationsDB.getPendingNotificationById.mockResolvedValue({
        ...pending, kind: 'DEBIT ACCOUNT', merchant: 'AMERIABANK API GATE',
      });
      await pipeline.resolvePendingNotification('p1', { accountId: 7, categoryId: 'cat-fees' });

      // The operation is still created and the card still learned...
      expect(OperationsDB.createOperation).toHaveBeenCalledWith(
        expect.objectContaining({ accountId: 7, categoryId: 'cat-fees' }),
      );
      expect(AccountsDB.addAccountCardMask).toHaveBeenCalledWith(7, '4083***7027');
      // ...but the generic gateway -> category rule is never remembered.
      expect(NotificationRulesDB.upsertMerchantRule).not.toHaveBeenCalled();
    });
  });

  describe('resolvePendingNotification — transfers (ATM cash)', () => {
    const pendingTransfer = {
      id: 'pt1', kind: 'ATM CASH', type: 'transfer', amount: '200000.00', currency: 'AMD',
      cardMask: '4083***7027', merchant: 'ATM 401 REPUBLIC 67/1', date: '2026-07-01',
      accountId: null, categoryId: null, packageName: PKG,
      createdAt: '2026-07-01T09:13:00.000Z',
    };

    it('creates a transfer, learns the card, binds the cash account and trusts the source', async () => {
      PendingNotificationsDB.getPendingNotificationById.mockResolvedValue(pendingTransfer);
      AccountsDB.getAccountById.mockImplementation(async (id) =>
        id === 7 ? { id: 7, currency: 'AMD' } : id === 9 ? { id: 9, currency: 'AMD' } : null);
      PreferencesDB.getJsonPreference.mockImplementation((key) => prefs([], [])(key));

      await pipeline.resolvePendingNotification('pt1', { accountId: 7, toAccountId: 9 });

      expect(OperationsDB.createOperation).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'transfer', amount: '200000', accountId: 7, toAccountId: 9,
          date: '2026-07-01', description: 'ATM 401 REPUBLIC 67/1',
        }),
      );
      // Learns the card -> source-account binding.
      expect(AccountsDB.addAccountCardMask).toHaveBeenCalledWith(7, '4083***7027');
      // Binds the cash account for future auto-create ("first time" binding).
      expect(PreferencesDB.setPreference).toHaveBeenCalledWith('bank_notifications_atm_account', '9');
      // Trusts the source package for auto-create.
      expect(PreferencesDB.setJsonPreference).toHaveBeenCalledWith(
        'bank_notifications_packages', [PKG],
      );
      // No merchant -> category rule for a transfer.
      expect(NotificationRulesDB.upsertMerchantRule).not.toHaveBeenCalled();
      expect(PendingNotificationsDB.deletePendingNotification).toHaveBeenCalledWith('pt1');
    });

    it('throws when no target account is chosen', async () => {
      PendingNotificationsDB.getPendingNotificationById.mockResolvedValue(pendingTransfer);
      await expect(
        pipeline.resolvePendingNotification('pt1', { accountId: 7 }),
      ).rejects.toThrow(/target account/);
      expect(OperationsDB.createOperation).not.toHaveBeenCalled();
    });

    it('throws when source and target are the same account', async () => {
      PendingNotificationsDB.getPendingNotificationById.mockResolvedValue(pendingTransfer);
      await expect(
        pipeline.resolvePendingNotification('pt1', { accountId: 7, toAccountId: 7 }),
      ).rejects.toThrow(/same source and target/);
      expect(OperationsDB.createOperation).not.toHaveBeenCalled();
    });

    it('rounds a same-currency transfer amount per the source account rounding (regression)', async () => {
      PendingNotificationsDB.getPendingNotificationById.mockResolvedValue({
        ...pendingTransfer, amount: '200160.00',
      });
      AccountsDB.getAccountById.mockImplementation(async (id) =>
        id === 7 ? { id: 7, currency: 'AMD', autoTxnRounding: 100 } : id === 9 ? { id: 9, currency: 'AMD' } : null);
      PreferencesDB.getJsonPreference.mockImplementation((key) => prefs([], [])(key));

      await pipeline.resolvePendingNotification('pt1', { accountId: 7, toAccountId: 9 });

      expect(OperationsDB.createOperation).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'transfer', amount: '200200' }),
      );
    });

    it('does not round a cross-currency transfer amount (destination amount kept intact)', async () => {
      PendingNotificationsDB.getPendingNotificationById.mockResolvedValue(pendingTransfer);
      AccountsDB.getAccountById.mockImplementation(async (id) =>
        id === 7 ? { id: 7, currency: 'AMD', autoTxnRounding: 100 } : id === 9 ? { id: 9, currency: 'USD' } : null);
      Currency.fetchLiveExchangeRate.mockResolvedValue({ rate: '0.0026', source: 'offline' });

      await pipeline.resolvePendingNotification('pt1', { accountId: 7, toAccountId: 9 });

      expect(OperationsDB.createOperation).toHaveBeenCalledWith(
        expect.objectContaining({
          amount: '200000', destinationAmount: '520.00',
        }),
      );
    });

    it('books a cross-currency transfer with a destination amount and rate', async () => {
      PendingNotificationsDB.getPendingNotificationById.mockResolvedValue(pendingTransfer);
      AccountsDB.getAccountById.mockImplementation(async (id) =>
        id === 7 ? { id: 7, currency: 'AMD' } : id === 9 ? { id: 9, currency: 'USD' } : null);
      Currency.fetchLiveExchangeRate.mockResolvedValue({ rate: '0.0026', source: 'offline' });

      await pipeline.resolvePendingNotification('pt1', { accountId: 7, toAccountId: 9 });

      expect(OperationsDB.createOperation).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'transfer', accountId: 7, toAccountId: 9,
          amount: '200000', destinationAmount: '520.00',
          exchangeRate: '0.0026', sourceCurrency: 'AMD', destinationCurrency: 'USD',
        }),
      );
    });
  });

  describe('reAddNotification', () => {
    it('re-creates the operation for a fully-resolved notification, bypassing the trust gate', async () => {
      AccountsDB.getAccountByCardMask.mockResolvedValue({ id: 7, currency: 'AMD' });
      NotificationRulesDB.getMerchantRule.mockResolvedValue({ categoryId: 'cat-food' });
      // allowlist empty -> normally not trusted, but re-add is user-initiated.
      PreferencesDB.getJsonPreference.mockImplementation((key) => prefs([], [])(key));

      const summary = await pipeline.reAddNotification(PURCHASE);

      expect(summary).toEqual({ created: 1, pending: 0, skipped: 0 });
      expect(OperationsDB.createOperation).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'expense', accountId: 7, categoryId: 'cat-food' }),
      );
    });

    it('queues for review when the notification cannot be fully resolved', async () => {
      AccountsDB.getAccountByCardMask.mockResolvedValue(null);
      AccountsDB.getAllAccounts.mockResolvedValue([]);

      const summary = await pipeline.reAddNotification(PURCHASE);

      expect(summary).toEqual({ created: 0, pending: 1, skipped: 0 });
      expect(PendingNotificationsDB.addPendingNotification).toHaveBeenCalled();
    });

    it('re-adds an ATM cash withdrawal as a transfer when a cash account is bound', async () => {
      AccountsDB.getAccountByCardMask.mockResolvedValue({ id: 7, currency: 'AMD' });
      PreferencesDB.getNumberPreference.mockResolvedValue(9);
      AccountsDB.getAccountById.mockResolvedValue({ id: 9, currency: 'AMD' });

      const summary = await pipeline.reAddNotification(ATM_CASH);

      expect(summary).toEqual({ created: 1, pending: 0, skipped: 0 });
      expect(OperationsDB.createOperation).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'transfer', accountId: 7, toAccountId: 9 }),
      );
    });

    it('is a no-op (skipped) for a non-bank notification', async () => {
      const summary = await pipeline.reAddNotification(NON_TRANSACTION);
      expect(summary).toEqual({ created: 0, pending: 0, skipped: 1 });
      expect(OperationsDB.createOperation).not.toHaveBeenCalled();
      expect(PendingNotificationsDB.addPendingNotification).not.toHaveBeenCalled();
    });
  });

  describe('dismissPendingNotification', () => {
    it('deletes the pending row and emits RELOAD_ALL so every live surface updates', async () => {
      PendingNotificationsDB.deletePendingNotification.mockResolvedValue();
      const emitSpy = jest.spyOn(appEvents, 'emit');

      await pipeline.dismissPendingNotification('p1');

      expect(PendingNotificationsDB.deletePendingNotification).toHaveBeenCalledWith('p1');
      expect(emitSpy).toHaveBeenCalledWith(EVENTS.RELOAD_ALL);
    });
  });
});
