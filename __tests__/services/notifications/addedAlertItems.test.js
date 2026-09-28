/**
 * Tests for the auto-added alert detail collector: which booked operations are
 * described, how account/category names are resolved for the batch, and the
 * best-effort degradation when a lookup fails.
 */

import {
  collectAddedAlertDetails,
  MAX_ADDED_ALERT_DETAILS,
} from '../../../app/services/notifications/addedAlertItems';
import { getAllAccounts } from '../../../app/services/AccountsDB';
import { getAllCategories } from '../../../app/services/CategoriesDB';
import { isHideBalancesEnabled } from '../../../app/services/PreferencesDB';

jest.mock('../../../app/services/AccountsDB', () => ({
  getAllAccounts: jest.fn(),
}));
jest.mock('../../../app/services/CategoriesDB', () => ({
  getAllCategories: jest.fn(),
}));
jest.mock('../../../app/services/PreferencesDB', () => ({
  isHideBalancesEnabled: jest.fn(),
}));

const created = (overrides = {}) => ({
  type: 'expense',
  amount: '1299.00',
  currency: 'AMD',
  merchant: 'Sas',
  accountId: 5,
  categoryId: 'cat-groceries',
  date: '2026-07-20',
  ...overrides,
});

describe('addedAlertItems.collectAddedAlertDetails', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getAllAccounts.mockResolvedValue([
      { id: 5, name: 'Main card', currency: 'AMD', balance: '48800.00' },
      { id: 9, name: 'Cash', currency: 'AMD', balance: '20000.00' },
    ]);
    isHideBalancesEnabled.mockResolvedValue(false);
    getAllCategories.mockResolvedValue([
      { id: 'cat-groceries', name: 'Groceries', nameKey: null },
      { id: 'cat-food', name: null, nameKey: 'category_food' },
    ]);
  });

  it('describes what was booked for an auto-created operation', async () => {
    const [detail] = await collectAddedAlertDetails([created()]);

    expect(detail).toMatchObject({
      type: 'expense',
      amount: '1299.00',
      currency: 'AMD',
      merchant: 'Sas',
      date: '2026-07-20',
      accountName: 'Main card',
      accountBalance: '48800.00',
      accountCurrency: 'AMD',
      categoryName: 'Groceries',
      targetAccountName: null,
    });
  });

  it('withholds the balance when the user hides balances', async () => {
    isHideBalancesEnabled.mockResolvedValue(true);

    const [detail] = await collectAddedAlertDetails([created()]);

    expect(detail.accountBalance).toBeNull();
    // The account itself is still named — only the figure is private.
    expect(detail.accountName).toBe('Main card');
  });

  it('withholds the balance if the hide-balances check itself throws', async () => {
    isHideBalancesEnabled.mockRejectedValue(new Error('unexpected'));

    const [detail] = await collectAddedAlertDetails([created()]);

    expect(detail.accountBalance).toBeNull();
    expect(detail.accountName).toBe('Main card');
  });

  it('carries the balance of the account the transfer left, not the one it reached', async () => {
    const [detail] = await collectAddedAlertDetails([
      created({ type: 'transfer', categoryId: null, toAccountId: 9 }),
    ]);

    expect(detail.accountBalance).toBe('48800.00');
  });

  it('carries a built-in category through as a translation key', async () => {
    const [detail] = await collectAddedAlertDetails([created({ categoryId: 'cat-food' })]);

    expect(detail.categoryNameKey).toBe('category_food');
    expect(detail.categoryName).toBeNull();
  });

  it('names the cash account a transfer landed in instead of a category', async () => {
    const [detail] = await collectAddedAlertDetails([
      created({ type: 'transfer', categoryId: null, toAccountId: 9, merchant: 'Atm 401' }),
    ]);

    expect(detail).toMatchObject({
      type: 'transfer',
      accountName: 'Main card',
      targetAccountName: 'Cash',
      categoryName: null,
    });
  });

  it('does not load categories when every item is a transfer', async () => {
    await collectAddedAlertDetails([created({ type: 'transfer', categoryId: null, toAccountId: 9 })]);

    expect(getAllCategories).not.toHaveBeenCalled();
  });

  it('describes at most MAX_ADDED_ALERT_DETAILS items', async () => {
    const items = Array.from({ length: MAX_ADDED_ALERT_DETAILS + 2 }, () => created());

    const details = await collectAddedAlertDetails(items);

    expect(details).toHaveLength(MAX_ADDED_ALERT_DETAILS);
  });

  it('honours an explicit limit', async () => {
    const details = await collectAddedAlertDetails([created(), created()], 1);

    expect(details).toHaveLength(1);
  });

  it('returns [] for an empty / missing list without touching the DB', async () => {
    await expect(collectAddedAlertDetails([])).resolves.toEqual([]);
    await expect(collectAddedAlertDetails(undefined)).resolves.toEqual([]);
    expect(getAllAccounts).not.toHaveBeenCalled();
  });

  it('still describes the operation when the account lookup fails', async () => {
    getAllAccounts.mockRejectedValue(new Error('db down'));

    const [detail] = await collectAddedAlertDetails([created()]);

    // The amount and payee — the part that matters — survive an unnamed account.
    expect(detail).toMatchObject({
      amount: '1299.00',
      merchant: 'Sas',
      accountName: null,
      accountBalance: null,
    });
  });

  it('never throws: an unexpected failure degrades to []', async () => {
    getAllAccounts.mockImplementation(() => {
      throw new Error('sync boom');
    });

    await expect(collectAddedAlertDetails([created()])).resolves.toEqual([]);
  });
});
