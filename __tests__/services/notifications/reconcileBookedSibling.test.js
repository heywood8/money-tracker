/**
 * Two same-price purchases on one card in one day are common. When one of
 * them is auto-created (its merchant is bound) and the other is queued for
 * review, the queued card must survive the reconcile pass: the operation
 * booked from the sibling notification is not the user's hand entry of it.
 *
 * Runs the real pipeline, parser and duplicate detection against in-memory
 * DB ports, so the booked-operations registry is actually written and read.
 */

import * as pipeline from '../../../app/services/notifications/processBankNotifications';
import { reconcilePendingNotifications } from '../../../app/services/notifications/duplicateOperations';
import * as NotificationAccess from '../../../app/services/NotificationAccess';
import * as OperationsDB from '../../../app/services/OperationsDB';
import * as AccountsDB from '../../../app/services/AccountsDB';
import * as NotificationRulesDB from '../../../app/services/NotificationRulesDB';
import * as PendingNotificationsDB from '../../../app/services/PendingNotificationsDB';

jest.mock('../../../app/services/DismissedNotificationsDB', () => {
  const actual = jest.requireActual('../../../app/services/DismissedNotificationsDB');
  return {
    notificationFingerprint: actual.notificationFingerprint,
    loadDismissedFingerprints: jest.fn(async () => new Set()),
    rememberDismissedNotification: jest.fn(),
    forgetDismissedNotification: jest.fn(),
  };
});
jest.mock('../../../app/services/NotificationAccess');
jest.mock('../../../app/services/OperationsDB');
jest.mock('../../../app/services/AccountsDB');
jest.mock('../../../app/services/NotificationRulesDB');
jest.mock('../../../app/services/PendingNotificationsDB');
jest.mock('../../../app/services/PreferencesDB', () => {
  const { PREF_KEYS } = jest.requireActual('../../../app/services/PreferencesDB');
  const store = new Map();
  return {
    PREF_KEYS,
    __store: store,
    getPreference: jest.fn(async (key) => (key === PREF_KEYS.BANK_NOTIFICATIONS_ENABLED ? '1' : null)),
    setPreference: jest.fn(),
    deletePreference: jest.fn(),
    getNumberPreference: jest.fn(async () => null),
    getJsonPreference: jest.fn(async (key, fallback = null) => {
      if (key === PREF_KEYS.BANK_NOTIFICATIONS_PACKAGES) return ['com.banqr.ameriabank'];
      return store.has(key) ? JSON.parse(store.get(key)) : fallback;
    }),
    setJsonPreference: jest.fn(async (key, value) => { store.set(key, JSON.stringify(value)); }),
  };
});
jest.mock('../../../app/services/operationLocation', () => ({
  captureLocationIfEnabled: jest.fn(async () => null),
  isAttachLocationEnabled: jest.fn(async () => false),
  operationLocationFields: () => ({}),
}));
jest.mock('../../../app/services/currency', () => {
  const actual = jest.requireActual('../../../app/services/currency');
  return { ...actual, fetchLiveExchangeRate: jest.fn(async () => ({ rate: null })) };
});
jest.mock('../../../app/services/perfTrace', () => ({
  startTrace: () => ({ mark: () => {}, end: () => {} }),
  traceAsync: (name, fn) => fn(),
}));
jest.mock('../../../app/services/notifications/localNotifications', () => ({
  dismissPendingOperationsAlert: jest.fn(async () => {}),
  presentPendingOperationsAlert: jest.fn(async () => {}),
  syncPendingOperationsAlert: jest.fn(async () => {}),
}));

const PKG = 'com.banqr.ameriabank';
const AMD = { id: 9, currency: 'AMD', autoTxnRounding: null, autoTxnRoundingMode: null, hidden: false };
const purchase = (merchant, time, postTime) => ({
  title: 'ARCA',
  text: `PURCHASE | 1,000.00 AMD | 4083***7027, | ${merchant}, AM | 28.06.2026 ${time} | BALANCE: 90,000.00 AMD`,
  packageName: PKG,
  postTime,
});

let ops;
let pending;

beforeEach(() => {
  jest.clearAllMocks();
  require('../../../app/services/PreferencesDB').__store.clear();
  ops = [];
  pending = [];
  let nextId = 1;
  OperationsDB.createOperation.mockImplementation(async (op) => {
    const row = { ...op, id: nextId++ };
    ops.push(row);
    return row;
  });
  OperationsDB.getOperationsByAccountTypeAndDate.mockImplementation(async (accountId, type, date) =>
    ops.filter(o => String(o.accountId) === String(accountId) && o.type === type && o.date === date));
  PendingNotificationsDB.addPendingNotification.mockImplementation(async (item) => {
    const row = { ...item, id: `p${pending.length + 1}` };
    pending.push(row);
    return row;
  });
  PendingNotificationsDB.getPendingNotifications.mockImplementation(async () => [...pending]);
  PendingNotificationsDB.deletePendingNotification.mockImplementation(async (id) => {
    pending = pending.filter(p => p.id !== id);
  });
  PendingNotificationsDB.getPendingCount.mockImplementation(async () => pending.length);
  AccountsDB.getAccountByCardMask.mockImplementation(async (mask) => (mask === '4083***7027' ? AMD : null));
  AccountsDB.getAllAccounts.mockResolvedValue([AMD]);
  AccountsDB.getAccountById.mockImplementation(async (id) => (id === AMD.id ? AMD : null));
  NotificationRulesDB.getMerchantRule.mockImplementation(async (merchant) => (
    String(merchant).toUpperCase() === 'YANDEX.GO'
      ? { categoryId: 'cat-taxi', labelOverride: 'Yandex Go' }
      : null
  ));
  NotificationRulesDB.touchMerchantRuleMatch.mockResolvedValue();
});

describe('reconcile against an operation the pipeline booked', () => {
  it('keeps a queued card whose same-amount sibling was auto-created', async () => {
    NotificationAccess.getRecentNotifications.mockResolvedValue([
      purchase('NEW BAKERY', '09:10', 1782000000000),
      purchase('YANDEX.GO', '10:15', 1782000900000),
    ]);

    const summary = await pipeline.processBankNotifications();
    expect(summary.created).toBe(1);
    expect(pending.map(p => p.merchant)).toEqual(['NEW BAKERY']);

    const pruned = await reconcilePendingNotifications();

    expect(pruned).toBe(0);
    expect(pending.map(p => p.merchant)).toEqual(['NEW BAKERY']);
  });

  it('does not skip a later notification for another payee as a duplicate', async () => {
    NotificationAccess.getRecentNotifications.mockResolvedValue([purchase('YANDEX.GO', '10:15', 1782000900000)]);
    await pipeline.processBankNotifications();

    NotificationAccess.getRecentNotifications.mockResolvedValue([
      purchase('YANDEX.GO', '10:15', 1782000900000),
      purchase('NEW BAKERY', '11:40', 1782005000000),
    ]);
    await pipeline.processBankNotifications();

    expect(pending.map(p => p.merchant)).toEqual(['NEW BAKERY']);
  });

  it('still prunes a queued card the user then entered by hand', async () => {
    NotificationAccess.getRecentNotifications.mockResolvedValue([purchase('NEW BAKERY', '09:10', 1782000000000)]);
    await pipeline.processBankNotifications();
    expect(pending).toHaveLength(1);

    ops.push({ id: 500, type: 'expense', amount: '1000.00', accountId: AMD.id, date: pending[0].date, description: 'Bread' });

    expect(await reconcilePendingNotifications()).toBe(1);
    expect(pending).toHaveLength(0);
  });
});
