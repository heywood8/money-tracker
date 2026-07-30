/**
 * Tests for duplicate detection between bank notifications and operations the
 * user has already recorded by hand. Uses the real currency math; mocks the DB
 * ports.
 */

import {
  operationMatchesNotification,
  findMatchingOperation,
  hasMatchingOperation,
  reconcilePendingNotifications,
} from '../../../app/services/notifications/duplicateOperations';
import * as OperationsDB from '../../../app/services/OperationsDB';
import * as AccountsDB from '../../../app/services/AccountsDB';
import * as PendingNotificationsDB from '../../../app/services/PendingNotificationsDB';

jest.mock('../../../app/services/OperationsDB');
jest.mock('../../../app/services/AccountsDB');
jest.mock('../../../app/services/PendingNotificationsDB');

const AMD = { id: 9, currency: 'AMD', autoTxnRounding: null, autoTxnRoundingMode: null };
const AMD_ROUND_100 = { id: 9, currency: 'AMD', autoTxnRounding: 100, autoTxnRoundingMode: 'nearest' };

const op = (over = {}) => ({
  id: 1,
  type: 'expense',
  amount: '1683',
  accountId: 9,
  date: '2026-07-30',
  destinationAmount: null,
  sourceCurrency: null,
  destinationCurrency: null,
  ...over,
});

const item = (over = {}) => ({
  type: 'expense',
  amount: '1683',
  currency: 'AMD',
  date: '2026-07-30',
  accountId: 9,
  ...over,
});

describe('operationMatchesNotification', () => {
  it('matches same type, account, date, and amount', () => {
    expect(operationMatchesNotification(op(), item(), AMD)).toBe(true);
  });

  it('matches "1683.00" against "1683" (decimal-safe)', () => {
    expect(operationMatchesNotification(op({ amount: '1683.00' }), item(), AMD)).toBe(true);
  });

  it('matches the account-rounded amount when the account rounds transactions', () => {
    // 1683 rounded to the nearest 100 = 1700, the value a hand-entry may carry.
    expect(operationMatchesNotification(op({ amount: '1700' }), item(), AMD_ROUND_100)).toBe(true);
  });

  it('does not match the rounded amount when the account has no rounding', () => {
    expect(operationMatchesNotification(op({ amount: '1700' }), item(), AMD)).toBe(false);
  });

  it('does not match a different date', () => {
    expect(operationMatchesNotification(op({ date: '2026-07-29' }), item(), AMD)).toBe(false);
  });

  it('does not match a different account', () => {
    expect(operationMatchesNotification(op({ accountId: 8 }), item(), AMD)).toBe(false);
  });

  it('does not match a different type', () => {
    expect(operationMatchesNotification(op({ type: 'income' }), item(), AMD)).toBe(false);
  });

  it('does not match a different amount', () => {
    expect(operationMatchesNotification(op({ amount: '2000' }), item(), AMD)).toBe(false);
  });

  it('never matches a dateless notification', () => {
    expect(operationMatchesNotification(op(), item({ date: null }), AMD)).toBe(false);
  });

  it('matches a cross-currency charge on the preserved foreign amount', () => {
    // 129.99 EUR booked on an AMD account: the account amount differs, but the
    // original foreign charge is kept in destination_amount.
    const eurItem = item({ currency: 'EUR', amount: '129.99' });
    const eurOp = op({ amount: '55000', destinationAmount: '129.99', sourceCurrency: 'EUR', destinationCurrency: 'AMD' });
    expect(operationMatchesNotification(eurOp, eurItem, AMD)).toBe(true);
  });

  it('does not cross-currency match when the foreign amount was not preserved', () => {
    const eurItem = item({ currency: 'EUR', amount: '129.99' });
    const eurOp = op({ amount: '55000', destinationAmount: null });
    expect(operationMatchesNotification(eurOp, eurItem, AMD)).toBe(false);
  });
});

describe('findMatchingOperation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns the matching operation from the account/type/date lookup', async () => {
    OperationsDB.getOperationsByAccountTypeAndDate.mockResolvedValue([op()]);
    const match = await findMatchingOperation(item(), AMD);
    expect(match).toEqual(op());
    expect(OperationsDB.getOperationsByAccountTypeAndDate).toHaveBeenCalledWith(9, 'expense', '2026-07-30');
  });

  it('returns null when no candidate matches', async () => {
    OperationsDB.getOperationsByAccountTypeAndDate.mockResolvedValue([op({ amount: '999' })]);
    expect(await findMatchingOperation(item(), AMD)).toBeNull();
  });

  it('fetches the account by id when none is passed', async () => {
    AccountsDB.getAccountById.mockResolvedValue(AMD_ROUND_100);
    OperationsDB.getOperationsByAccountTypeAndDate.mockResolvedValue([op({ amount: '1700' })]);
    const match = await findMatchingOperation(item());
    expect(AccountsDB.getAccountById).toHaveBeenCalledWith(9);
    expect(match).not.toBeNull();
  });

  it('returns null (no lookup) for an item without a resolved account', async () => {
    expect(await findMatchingOperation(item({ accountId: null }), AMD)).toBeNull();
    expect(OperationsDB.getOperationsByAccountTypeAndDate).not.toHaveBeenCalled();
  });

  it('hasMatchingOperation reflects findMatchingOperation', async () => {
    OperationsDB.getOperationsByAccountTypeAndDate.mockResolvedValue([op()]);
    expect(await hasMatchingOperation(item(), AMD)).toBe(true);
    OperationsDB.getOperationsByAccountTypeAndDate.mockResolvedValue([]);
    expect(await hasMatchingOperation(item(), AMD)).toBe(false);
  });
});

describe('reconcilePendingNotifications', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    AccountsDB.getAccountById.mockResolvedValue(AMD);
  });

  it('deletes queued items that now have a matching operation', async () => {
    PendingNotificationsDB.getPendingNotifications.mockResolvedValue([
      { id: 'p1', ...item() },
      { id: 'p2', ...item({ amount: '5000' }) },
    ]);
    // p1 has a match; p2 does not.
    OperationsDB.getOperationsByAccountTypeAndDate.mockImplementation(async () => [op()]);

    const pruned = await reconcilePendingNotifications();

    expect(pruned).toBe(1);
    expect(PendingNotificationsDB.deletePendingNotification).toHaveBeenCalledTimes(1);
    expect(PendingNotificationsDB.deletePendingNotification).toHaveBeenCalledWith('p1');
  });

  it('returns 0 and deletes nothing when the queue is empty', async () => {
    PendingNotificationsDB.getPendingNotifications.mockResolvedValue([]);
    expect(await reconcilePendingNotifications()).toBe(0);
    expect(PendingNotificationsDB.deletePendingNotification).not.toHaveBeenCalled();
  });

  it('skips items without a resolved account', async () => {
    PendingNotificationsDB.getPendingNotifications.mockResolvedValue([
      { id: 'p1', ...item({ accountId: null }) },
    ]);
    expect(await reconcilePendingNotifications()).toBe(0);
    expect(OperationsDB.getOperationsByAccountTypeAndDate).not.toHaveBeenCalled();
    expect(PendingNotificationsDB.deletePendingNotification).not.toHaveBeenCalled();
  });

  it('is best-effort: a read failure leaves the queue untouched', async () => {
    PendingNotificationsDB.getPendingNotifications.mockRejectedValue(new Error('db down'));
    expect(await reconcilePendingNotifications()).toBe(0);
    expect(PendingNotificationsDB.deletePendingNotification).not.toHaveBeenCalled();
  });
});
