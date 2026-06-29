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
};
jest.mock('../../../app/services/PreferencesDB', () => ({
  PREF_KEYS: {
    BANK_NOTIFICATIONS_ENABLED: 'bank_notifications_enabled',
    BANK_NOTIFICATIONS_PROCESSED_SIGS: 'bank_notifications_processed_sigs',
    BANK_NOTIFICATIONS_PACKAGES: 'bank_notifications_packages',
  },
  getPreference: jest.fn(),
  setPreference: jest.fn(),
  getJsonPreference: jest.fn(),
  setJsonPreference: jest.fn(),
}));
import * as PreferencesDB from '../../../app/services/PreferencesDB';

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
const C2C = {
  title: 'АРКА транзакции',
  text: 'C2C | 19,200.00 AMD | 4083***7027, | TO: N. DORVANYAN | AMERIABANK API GATE, AM | 28.06.2026 16:23 | BALANCE: 106,819.97 AMD',
  packageName: PKG,
  postTime: 1782002580000,
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
    NotificationRulesDB.getCategoryForMerchant.mockResolvedValue(null);
    OperationsDB.createOperation.mockResolvedValue({ id: 1 });
    PendingNotificationsDB.addPendingNotification.mockResolvedValue({ id: 'p1' });
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
    NotificationRulesDB.getCategoryForMerchant.mockResolvedValue('cat-food');
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

  it('uses a learned label override as the operation label on auto-create', async () => {
    NotificationAccess.getRecentNotifications.mockResolvedValue([PURCHASE]);
    AccountsDB.getAccountByCardMask.mockResolvedValue({ id: 7, currency: 'AMD' });
    NotificationRulesDB.getCategoryForMerchant.mockResolvedValue('cat-food');
    NotificationRulesDB.getLabelForMerchant.mockResolvedValue('Ecosense');
    PreferencesDB.getJsonPreference.mockImplementation((key) => prefs([], [PKG])(key));

    await pipeline.processBankNotifications();

    expect(OperationsDB.createOperation).toHaveBeenCalledWith(
      expect.objectContaining({ description: 'Ecosense' }),
    );
  });

  it('queues instead of auto-creating when the source is not trusted', async () => {
    NotificationAccess.getRecentNotifications.mockResolvedValue([PURCHASE]);
    AccountsDB.getAccountByCardMask.mockResolvedValue({ id: 7, currency: 'AMD' });
    NotificationRulesDB.getCategoryForMerchant.mockResolvedValue('cat-food');
    // allowlist empty -> not trusted
    const summary = await pipeline.processBankNotifications();
    expect(summary).toEqual({ created: 0, pending: 1, skipped: 0 });
    expect(OperationsDB.createOperation).not.toHaveBeenCalled();
    expect(PendingNotificationsDB.addPendingNotification).toHaveBeenCalled();
  });

  it('queues (does not auto-create) on a currency mismatch even if trusted', async () => {
    NotificationAccess.getRecentNotifications.mockResolvedValue([PURCHASE]); // AMD
    AccountsDB.getAccountByCardMask.mockResolvedValue({ id: 7, currency: 'USD' });
    NotificationRulesDB.getCategoryForMerchant.mockResolvedValue('cat-food');
    PreferencesDB.getJsonPreference.mockImplementation((key) => prefs([], [PKG])(key));

    const summary = await pipeline.processBankNotifications();

    expect(summary).toEqual({ created: 0, pending: 1, skipped: 0 });
    expect(OperationsDB.createOperation).not.toHaveBeenCalled();
    expect(PendingNotificationsDB.addPendingNotification).toHaveBeenCalledWith(
      expect.objectContaining({ accountId: 7, categoryId: null }),
    );
  });

  it('queues a pending item when not fully matched', async () => {
    NotificationAccess.getRecentNotifications.mockResolvedValue([PURCHASE]);
    AccountsDB.getAccountByCardMask.mockResolvedValue({ id: 7, currency: 'AMD' });
    NotificationRulesDB.getCategoryForMerchant.mockResolvedValue(null); // no category

    const summary = await pipeline.processBankNotifications();

    expect(summary).toEqual({ created: 0, pending: 1, skipped: 0 });
    expect(OperationsDB.createOperation).not.toHaveBeenCalled();
    expect(PendingNotificationsDB.addPendingNotification).toHaveBeenCalledWith(
      expect.objectContaining({ merchant: 'NAREK MEHRABYAN', cardMask: '4083***7027', accountId: 7 }),
    );
  });

  describe('C2C transfers always require a manual category', () => {
    it('queues a C2C transfer even when the card resolves and the source is trusted', async () => {
      NotificationAccess.getRecentNotifications.mockResolvedValue([C2C]);
      AccountsDB.getAccountByCardMask.mockResolvedValue({ id: 7, currency: 'AMD' });
      // Even a learned rule for this person must not auto-apply or auto-create.
      NotificationRulesDB.getCategoryForMerchant.mockResolvedValue('cat-loan');
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

  it('falls back to a valid date when the notification has none', async () => {
    NotificationAccess.getRecentNotifications.mockResolvedValue([PURCHASE_NO_DATE]);
    AccountsDB.getAccountByCardMask.mockResolvedValue({ id: 7, currency: 'AMD' });
    NotificationRulesDB.getCategoryForMerchant.mockResolvedValue('cat-food');
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
    NotificationRulesDB.getCategoryForMerchant.mockResolvedValue('cat-food');

    const summary = await pipeline.processBankNotifications();
    expect(summary).toEqual({ created: 0, pending: 0, skipped: 0 });
    expect(OperationsDB.createOperation).not.toHaveBeenCalled();
  });

  it('retries (does not record signature) when processing throws', async () => {
    NotificationAccess.getRecentNotifications.mockResolvedValue([PURCHASE]);
    AccountsDB.getAccountByCardMask.mockResolvedValue({ id: 7, currency: 'AMD' });
    NotificationRulesDB.getCategoryForMerchant.mockResolvedValue('cat-food');
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
      expect(AccountsDB.setAccountCardMask).toHaveBeenCalledWith(7, '4083***7027');
      expect(NotificationRulesDB.upsertMerchantRule).toHaveBeenCalledWith('NAREK MEHRABYAN', 'cat-food', PKG);
      expect(PreferencesDB.setJsonPreference).toHaveBeenCalledWith(
        'bank_notifications_packages', [PKG],
      );
      expect(PendingNotificationsDB.deletePendingNotification).toHaveBeenCalledWith('p1');
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
      expect(AccountsDB.setAccountCardMask).not.toHaveBeenCalled();
      expect(NotificationRulesDB.upsertMerchantRule).not.toHaveBeenCalled();
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
      // A typed override never consults the learned one.
      expect(NotificationRulesDB.getLabelForMerchant).not.toHaveBeenCalled();
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
      expect(AccountsDB.setAccountCardMask).toHaveBeenCalledWith(7, '4083***7027');
      // ...but the friend -> category rule is never remembered.
      expect(NotificationRulesDB.upsertMerchantRule).not.toHaveBeenCalled();
    });
  });
});
