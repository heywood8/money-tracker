/**
 * Tests for resolveNotification — maps a parsed descriptor to account/category.
 */

import * as resolver from '../../../app/services/notifications/resolveNotification';
import * as AccountsDB from '../../../app/services/AccountsDB';
import * as NotificationRulesDB from '../../../app/services/NotificationRulesDB';

jest.mock('../../../app/services/AccountsDB');
jest.mock('../../../app/services/NotificationRulesDB');

const descriptor = {
  type: 'expense',
  amount: '3900.00',
  currency: 'AMD',
  cardMask: '4083***7027',
  merchant: 'NAREK MEHRABYAN',
  packageName: 'am.bank',
};

describe('resolveNotification', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    AccountsDB.getAccountByCardMask.mockResolvedValue(null);
    AccountsDB.getAllAccounts.mockResolvedValue([]);
    NotificationRulesDB.getCategoryForMerchant.mockResolvedValue(null);
  });

  describe('resolveAccountId', () => {
    it('resolves via card-mask binding first', async () => {
      AccountsDB.getAccountByCardMask.mockResolvedValue({ id: 7 });
      expect(await resolver.resolveAccountId(descriptor)).toBe(7);
      expect(AccountsDB.getAllAccounts).not.toHaveBeenCalled();
    });

    it('falls back to a single currency-matching account', async () => {
      AccountsDB.getAllAccounts.mockResolvedValue([
        { id: 1, currency: 'AMD', hidden: 0 },
        { id: 2, currency: 'USD', hidden: 0 },
      ]);
      expect(await resolver.resolveAccountId(descriptor)).toBe(1);
    });

    it('does not guess when multiple accounts share the currency', async () => {
      AccountsDB.getAllAccounts.mockResolvedValue([
        { id: 1, currency: 'AMD', hidden: 0 },
        { id: 2, currency: 'AMD', hidden: 0 },
      ]);
      expect(await resolver.resolveAccountId(descriptor)).toBeNull();
    });

    it('ignores hidden accounts in the currency fallback', async () => {
      AccountsDB.getAllAccounts.mockResolvedValue([
        { id: 1, currency: 'AMD', hidden: 1 },
        { id: 2, currency: 'AMD', hidden: 0 },
      ]);
      expect(await resolver.resolveAccountId(descriptor)).toBe(2);
    });

    it('returns null when nothing matches', async () => {
      expect(await resolver.resolveAccountId(descriptor)).toBeNull();
    });
  });

  describe('resolveCategoryId', () => {
    it('uses the learned merchant rule', async () => {
      NotificationRulesDB.getCategoryForMerchant.mockResolvedValue('cat-food');
      expect(await resolver.resolveCategoryId(descriptor)).toBe('cat-food');
      expect(NotificationRulesDB.getCategoryForMerchant).toHaveBeenCalledWith('NAREK MEHRABYAN', 'am.bank');
    });

    it('returns null without a merchant', async () => {
      expect(await resolver.resolveCategoryId({ ...descriptor, merchant: null })).toBeNull();
    });
  });

  describe('resolveNotification', () => {
    it('reports fullyMatched when both resolve and currencies agree', async () => {
      AccountsDB.getAccountByCardMask.mockResolvedValue({ id: 7, currency: 'AMD' });
      NotificationRulesDB.getCategoryForMerchant.mockResolvedValue('cat-food');
      const r = await resolver.resolveNotification(descriptor);
      expect(r).toEqual({
        accountId: 7,
        accountCurrency: 'AMD',
        categoryId: 'cat-food',
        matchedAccount: true,
        matchedCategory: true,
        currencyMatch: true,
        fullyMatched: true,
      });
    });

    it('is NOT fullyMatched on a currency mismatch', async () => {
      AccountsDB.getAccountByCardMask.mockResolvedValue({ id: 7, currency: 'USD' });
      NotificationRulesDB.getCategoryForMerchant.mockResolvedValue('cat-food');
      const r = await resolver.resolveNotification(descriptor); // descriptor is AMD
      expect(r.matchedAccount).toBe(true);
      expect(r.matchedCategory).toBe(true);
      expect(r.currencyMatch).toBe(false);
      expect(r.fullyMatched).toBe(false);
    });

    it('reports partial match when only the account resolves', async () => {
      AccountsDB.getAccountByCardMask.mockResolvedValue({ id: 7, currency: 'AMD' });
      const r = await resolver.resolveNotification(descriptor);
      expect(r.matchedAccount).toBe(true);
      expect(r.matchedCategory).toBe(false);
      expect(r.fullyMatched).toBe(false);
    });
  });
});
