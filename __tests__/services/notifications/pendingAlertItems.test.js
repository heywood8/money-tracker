/**
 * Tests for the alert detail collector: which queued items are described, what
 * the pipeline resolved for each, and which field the user still has to pick.
 */

import { collectPendingAlertDetails, MAX_ALERT_DETAILS } from '../../../app/services/notifications/pendingAlertItems';
import { getPendingNotifications } from '../../../app/services/PendingNotificationsDB';
import { getAllAccounts } from '../../../app/services/AccountsDB';
import { getAllCategories } from '../../../app/services/CategoriesDB';
import { resolveAtmTargetAccount } from '../../../app/services/notifications/processBankNotifications';

jest.mock('../../../app/services/PendingNotificationsDB', () => ({
  getPendingNotifications: jest.fn(),
}));
jest.mock('../../../app/services/AccountsDB', () => ({
  getAllAccounts: jest.fn(),
}));
jest.mock('../../../app/services/CategoriesDB', () => ({
  getAllCategories: jest.fn(),
}));
jest.mock('../../../app/services/notifications/processBankNotifications', () => ({
  resolveAtmTargetAccount: jest.fn(),
}));

const pending = (overrides = {}) => ({
  id: 'p1',
  kind: 'PURCHASE',
  type: 'expense',
  amount: '1299.00',
  currency: 'AMD',
  cardMask: '4083***7027',
  merchant: 'SAS SUPERMARKET',
  date: '2026-07-20',
  accountId: 5,
  categoryId: 'cat-groceries',
  packageName: 'com.banqr.ameriabank',
  ...overrides,
});

describe('pendingAlertItems.collectPendingAlertDetails', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getAllAccounts.mockResolvedValue([{ id: 5, name: 'Main card', currency: 'AMD' }]);
    getAllCategories.mockResolvedValue([
      { id: 'cat-groceries', name: 'Groceries', nameKey: null },
      { id: 'cat-food', name: null, nameKey: 'category_food' },
    ]);
    resolveAtmTargetAccount.mockResolvedValue(null);
  });

  it('describes what was recognized for a queued item', async () => {
    getPendingNotifications.mockResolvedValue([pending()]);

    const [detail] = await collectPendingAlertDetails(1);

    expect(detail).toMatchObject({
      amount: '1299.00',
      currency: 'AMD',
      merchant: 'SAS SUPERMARKET',
      cardMask: '4083***7027',
      date: '2026-07-20',
      accountName: 'Main card',
      categoryName: 'Groceries',
      missing: null, // fully resolved — only awaiting confirmation
    });
  });

  it('carries a built-in category through as a translation key', async () => {
    getPendingNotifications.mockResolvedValue([pending({ categoryId: 'cat-food' })]);

    const [detail] = await collectPendingAlertDetails(1);

    expect(detail.categoryNameKey).toBe('category_food');
    expect(detail.categoryName).toBeNull();
  });

  it('reports the missing account, category, or both', async () => {
    getPendingNotifications.mockResolvedValue([
      pending({ id: 'a', accountId: null }),
      pending({ id: 'b', categoryId: null }),
      pending({ id: 'c', accountId: null, categoryId: null }),
    ]);

    const details = await collectPendingAlertDetails(3);

    expect(details.map((d) => d.missing)).toEqual(['account', 'category', 'account_category']);
  });

  it('reports the unbound cash account for a queued ATM transfer', async () => {
    getPendingNotifications.mockResolvedValue([
      pending({ type: 'transfer', kind: 'CASH', categoryId: null }),
    ]);

    const [detail] = await collectPendingAlertDetails(1);

    expect(detail.missing).toBe('target');
    // A transfer has no category — the target account takes its place.
    expect(detail.categoryName).toBeNull();
  });

  it('reports both sides when an ATM transfer resolved neither account', async () => {
    getPendingNotifications.mockResolvedValue([
      pending({ type: 'transfer', kind: 'CASH', accountId: null, categoryId: null }),
    ]);

    expect((await collectPendingAlertDetails(1))[0].missing).toBe('account_target');
  });

  it('treats a bound cash account as resolved for an ATM transfer', async () => {
    resolveAtmTargetAccount.mockResolvedValue({ id: 9, name: 'Cash', currency: 'AMD' });
    getPendingNotifications.mockResolvedValue([
      pending({ type: 'transfer', kind: 'CASH', categoryId: null }),
    ]);

    expect((await collectPendingAlertDetails(1))[0].missing).toBeNull();
  });

  it('describes only the items this run queued (the tail of the queue)', async () => {
    getPendingNotifications.mockResolvedValue([
      pending({ id: 'old', merchant: 'OLD SHOP' }),
      pending({ id: 'new1', merchant: 'NEW ONE' }),
      pending({ id: 'new2', merchant: 'NEW TWO' }),
    ]);

    const details = await collectPendingAlertDetails(2);

    expect(details.map((d) => d.merchant)).toEqual(['NEW ONE', 'NEW TWO']);
  });

  it('caps the described items', async () => {
    getPendingNotifications.mockResolvedValue(
      Array.from({ length: 6 }, (_, i) => pending({ id: `p${i}` })),
    );

    const details = await collectPendingAlertDetails(6);

    expect(details).toHaveLength(MAX_ALERT_DETAILS);
  });

  it('falls back to the whole queue when the new count is unknown', async () => {
    getPendingNotifications.mockResolvedValue([pending({ merchant: 'ONLY' })]);

    const details = await collectPendingAlertDetails(0);

    expect(details.map((d) => d.merchant)).toEqual(['ONLY']);
  });

  it('returns an empty list for an empty queue', async () => {
    getPendingNotifications.mockResolvedValue([]);

    expect(await collectPendingAlertDetails(1)).toEqual([]);
  });

  it('returns an empty list when the queue cannot be read', async () => {
    getPendingNotifications.mockRejectedValue(new Error('db down'));

    expect(await collectPendingAlertDetails(1)).toEqual([]);
  });

  it('still describes the item when account/category lookups fail', async () => {
    getPendingNotifications.mockResolvedValue([pending()]);
    getAllAccounts.mockRejectedValue(new Error('db down'));
    getAllCategories.mockRejectedValue(new Error('db down'));

    const [detail] = await collectPendingAlertDetails(1);

    expect(detail.merchant).toBe('SAS SUPERMARKET');
    expect(detail.accountName).toBeNull();
    expect(detail.categoryName).toBeNull();
  });
});
