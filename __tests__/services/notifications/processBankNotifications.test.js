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

// Partial mock of PreferencesDB: keep PREF_KEYS, stub the accessors.
jest.mock('../../../app/services/PreferencesDB', () => ({
  PREF_KEYS: {
    BANK_NOTIFICATIONS_ENABLED: 'bank_notifications_enabled',
    BANK_NOTIFICATIONS_PROCESSED_SIGS: 'bank_notifications_processed_sigs',
  },
  getPreference: jest.fn(),
  setPreference: jest.fn(),
  getJsonPreference: jest.fn(),
  setJsonPreference: jest.fn(),
}));
import * as PreferencesDB from '../../../app/services/PreferencesDB';

const PURCHASE = {
  title: 'АРКА транзакции',
  text: 'PURCHASE | 3,900.00 AMD | 4083***7027, | NAREK MEHRABYAN, AM | 28.06.2026 10:15 | BALANCE: 133,719.97 AMD',
  packageName: 'am.ameriabank.mobile',
  postTime: 1782000900000,
};
const NON_TRANSACTION = {
  title: 'Chat', text: 'Hi there', packageName: 'com.chat', postTime: 1782000800000,
};

describe('processBankNotifications', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // enabled by default
    PreferencesDB.getPreference.mockResolvedValue('1');
    PreferencesDB.getJsonPreference.mockResolvedValue([]);
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

  it('auto-creates an operation when fully matched', async () => {
    NotificationAccess.getRecentNotifications.mockResolvedValue([PURCHASE]);
    AccountsDB.getAccountByCardMask.mockResolvedValue({ id: 7 });
    NotificationRulesDB.getCategoryForMerchant.mockResolvedValue('cat-food');
    const emitSpy = jest.spyOn(appEvents, 'emit');

    const summary = await pipeline.processBankNotifications();

    expect(summary).toEqual({ created: 1, pending: 0, skipped: 0 });
    expect(OperationsDB.createOperation).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'expense',
        amount: '3900.00',
        accountId: 7,
        categoryId: 'cat-food',
        date: '2026-06-28',
        description: 'NAREK MEHRABYAN',
      }),
    );
    expect(PendingNotificationsDB.addPendingNotification).not.toHaveBeenCalled();
    expect(emitSpy).toHaveBeenCalledWith(EVENTS.RELOAD_ALL);
  });

  it('queues a pending item when not fully matched', async () => {
    NotificationAccess.getRecentNotifications.mockResolvedValue([PURCHASE]);
    AccountsDB.getAccountByCardMask.mockResolvedValue({ id: 7 }); // account ok
    NotificationRulesDB.getCategoryForMerchant.mockResolvedValue(null); // no category

    const summary = await pipeline.processBankNotifications();

    expect(summary).toEqual({ created: 0, pending: 1, skipped: 0 });
    expect(OperationsDB.createOperation).not.toHaveBeenCalled();
    expect(PendingNotificationsDB.addPendingNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        merchant: 'NAREK MEHRABYAN',
        cardMask: '4083***7027',
        accountId: 7,
        categoryId: null,
      }),
    );
  });

  it('skips non-transaction notifications but records them as seen', async () => {
    NotificationAccess.getRecentNotifications.mockResolvedValue([NON_TRANSACTION]);
    const summary = await pipeline.processBankNotifications();
    expect(summary).toEqual({ created: 0, pending: 0, skipped: 1 });
    expect(PreferencesDB.setJsonPreference).toHaveBeenCalled();
  });

  it('does not reprocess an already-seen notification', async () => {
    const sig = pipeline.notificationSignature(PURCHASE);
    PreferencesDB.getJsonPreference.mockResolvedValue([sig]);
    NotificationAccess.getRecentNotifications.mockResolvedValue([PURCHASE]);
    AccountsDB.getAccountByCardMask.mockResolvedValue({ id: 7 });
    NotificationRulesDB.getCategoryForMerchant.mockResolvedValue('cat-food');

    const summary = await pipeline.processBankNotifications();
    expect(summary).toEqual({ created: 0, pending: 0, skipped: 0 });
    expect(OperationsDB.createOperation).not.toHaveBeenCalled();
  });

  it('retries (does not record signature) when processing throws', async () => {
    NotificationAccess.getRecentNotifications.mockResolvedValue([PURCHASE]);
    AccountsDB.getAccountByCardMask.mockResolvedValue({ id: 7 });
    NotificationRulesDB.getCategoryForMerchant.mockResolvedValue('cat-food');
    OperationsDB.createOperation.mockRejectedValue(new Error('db down'));

    const summary = await pipeline.processBankNotifications();
    expect(summary).toEqual({ created: 0, pending: 0, skipped: 0 });
    // Nothing newly seen -> signatures not persisted
    expect(PreferencesDB.setJsonPreference).not.toHaveBeenCalled();
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
      accountId: null, categoryId: null, packageName: 'am.bank',
    };

    it('creates the operation and learns both bindings', async () => {
      PendingNotificationsDB.getPendingNotificationById.mockResolvedValue(pending);
      await pipeline.resolvePendingNotification('p1', { accountId: 7, categoryId: 'cat-food' });

      expect(OperationsDB.createOperation).toHaveBeenCalledWith(
        expect.objectContaining({ accountId: 7, categoryId: 'cat-food', amount: '3900.00' }),
      );
      expect(AccountsDB.setAccountCardMask).toHaveBeenCalledWith(7, '4083***7027');
      expect(NotificationRulesDB.upsertMerchantRule).toHaveBeenCalledWith('NAREK MEHRABYAN', 'cat-food', 'am.bank');
      expect(PendingNotificationsDB.deletePendingNotification).toHaveBeenCalledWith('p1');
    });

    it('throws when no account is chosen', async () => {
      PendingNotificationsDB.getPendingNotificationById.mockResolvedValue(pending);
      await expect(pipeline.resolvePendingNotification('p1', { categoryId: 'cat-food' }))
        .rejects.toThrow(/account/);
    });

    it('does not learn bindings when opted out', async () => {
      PendingNotificationsDB.getPendingNotificationById.mockResolvedValue(pending);
      await pipeline.resolvePendingNotification('p1', {
        accountId: 7, categoryId: 'cat-food', learnCardMask: false, learnMerchant: false,
      });
      expect(AccountsDB.setAccountCardMask).not.toHaveBeenCalled();
      expect(NotificationRulesDB.upsertMerchantRule).not.toHaveBeenCalled();
    });

    it('returns null for an unknown pending id', async () => {
      PendingNotificationsDB.getPendingNotificationById.mockResolvedValue(null);
      expect(await pipeline.resolvePendingNotification('nope', { accountId: 7 })).toBeNull();
    });
  });
});
