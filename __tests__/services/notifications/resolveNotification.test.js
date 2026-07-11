/**
 * Tests for resolveNotification — maps a parsed descriptor to account/category.
 */

import * as resolver from '../../../app/services/notifications/resolveNotification';
import * as AccountsDB from '../../../app/services/AccountsDB';
import * as NotificationRulesDB from '../../../app/services/NotificationRulesDB';
import { resolveAccountBinding } from '../../../app/services/notifications/accountBindings';

jest.mock('../../../app/services/AccountsDB');
jest.mock('../../../app/services/NotificationRulesDB');
jest.mock('../../../app/services/notifications/accountBindings', () => ({
  resolveAccountBinding: jest.fn(),
}));

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
    resolveAccountBinding.mockResolvedValue(null);
    // resolveNotification (and the resolveCategoryId/resolveLabelOverride
    // helpers) now read the merchant rule once via getMerchantRule and derive
    // category + label override from it.
    NotificationRulesDB.getMerchantRule.mockResolvedValue(null);
  });

  // A card-less descriptor (no mask) — e.g. a T-Bank SBP payment ("счет RUB").
  const cardless = {
    type: 'expense',
    amount: '2118',
    currency: 'RUB',
    cardMask: null,
    merchant: 'РЖД',
    packageName: 'com.idamob.tinkoff.android',
  };

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

    it('resolves a card-less notification via the (app+currency) binding', async () => {
      resolveAccountBinding.mockResolvedValue({ id: 5, currency: 'RUB' });
      expect(await resolver.resolveAccountId(cardless)).toBe(5);
      expect(resolveAccountBinding).toHaveBeenCalledWith('com.idamob.tinkoff.android', 'RUB');
      // The binding wins outright — the currency heuristic is never consulted.
      expect(AccountsDB.getAllAccounts).not.toHaveBeenCalled();
    });

    it('the binding wins over an ambiguous currency fallback', async () => {
      resolveAccountBinding.mockResolvedValue({ id: 5, currency: 'RUB' });
      AccountsDB.getAllAccounts.mockResolvedValue([
        { id: 5, currency: 'RUB', hidden: 0 },
        { id: 6, currency: 'RUB', hidden: 0 },
      ]);
      expect(await resolver.resolveAccountId(cardless)).toBe(5);
    });

    it('falls through to the currency heuristic when no binding exists', async () => {
      resolveAccountBinding.mockResolvedValue(null);
      AccountsDB.getAllAccounts.mockResolvedValue([{ id: 8, currency: 'RUB', hidden: 0 }]);
      expect(await resolver.resolveAccountId(cardless)).toBe(8);
    });

    it('is card-less-only: a card notification never consults the binding', async () => {
      resolveAccountBinding.mockResolvedValue({ id: 5 });
      // descriptor carries a cardMask; getAccountByCardMask returns null (unbound)
      // so it should fall to the currency heuristic, NOT the account binding.
      AccountsDB.getAllAccounts.mockResolvedValue([
        { id: 1, currency: 'AMD', hidden: 0 },
        { id: 2, currency: 'AMD', hidden: 0 },
      ]);
      expect(await resolver.resolveAccountId(descriptor)).toBeNull();
      expect(resolveAccountBinding).not.toHaveBeenCalled();
    });
  });

  describe('resolveCategoryId', () => {
    it('uses the learned merchant rule', async () => {
      NotificationRulesDB.getMerchantRule.mockResolvedValue({ categoryId: 'cat-food' });
      expect(await resolver.resolveCategoryId(descriptor)).toBe('cat-food');
      expect(NotificationRulesDB.getMerchantRule).toHaveBeenCalledWith('NAREK MEHRABYAN', 'am.bank');
    });

    it('returns null without a merchant', async () => {
      expect(await resolver.resolveCategoryId({ ...descriptor, merchant: null })).toBeNull();
    });

    it('never auto-resolves a category for requiresCategory kinds (C2C)', async () => {
      NotificationRulesDB.getMerchantRule.mockResolvedValue({ categoryId: 'cat-food' });
      const c2c = { ...descriptor, requiresCategory: true };
      expect(await resolver.resolveCategoryId(c2c)).toBeNull();
      expect(NotificationRulesDB.getMerchantRule).not.toHaveBeenCalled();
    });
  });

  describe('resolveLabelOverride', () => {
    it('returns the learned label override for the merchant', async () => {
      NotificationRulesDB.getMerchantRule.mockResolvedValue({ labelOverride: 'Ecosense' });
      expect(await resolver.resolveLabelOverride(descriptor)).toBe('Ecosense');
      expect(NotificationRulesDB.getMerchantRule).toHaveBeenCalledWith('NAREK MEHRABYAN', 'am.bank');
    });

    it('returns null without a merchant', async () => {
      expect(await resolver.resolveLabelOverride({ ...descriptor, merchant: null })).toBeNull();
      expect(NotificationRulesDB.getMerchantRule).not.toHaveBeenCalled();
    });

    it('resolves an override even for requiresCategory (C2C) kinds', async () => {
      NotificationRulesDB.getMerchantRule.mockResolvedValue({ labelOverride: 'Mom' });
      expect(await resolver.resolveLabelOverride({ ...descriptor, requiresCategory: true })).toBe('Mom');
    });
  });

  describe('resolveNotification', () => {
    it('surfaces the learned label override', async () => {
      AccountsDB.getAccountByCardMask.mockResolvedValue({ id: 7, currency: 'AMD' });
      NotificationRulesDB.getMerchantRule.mockResolvedValue({ labelOverride: 'Ecosense' });
      const r = await resolver.resolveNotification(descriptor);
      expect(r.labelOverride).toBe('Ecosense');
    });

    it('reads the merchant rule only once for category and label', async () => {
      AccountsDB.getAccountByCardMask.mockResolvedValue({ id: 7, currency: 'AMD' });
      NotificationRulesDB.getMerchantRule.mockResolvedValue({ categoryId: 'cat-food', labelOverride: 'Ecosense' });
      const r = await resolver.resolveNotification(descriptor);
      expect(r.categoryId).toBe('cat-food');
      expect(r.labelOverride).toBe('Ecosense');
      expect(NotificationRulesDB.getMerchantRule).toHaveBeenCalledTimes(1);
    });

    it('reports fullyMatched when both resolve and currencies agree', async () => {
      AccountsDB.getAccountByCardMask.mockResolvedValue({ id: 7, currency: 'AMD' });
      NotificationRulesDB.getMerchantRule.mockResolvedValue({ categoryId: 'cat-food' });
      const r = await resolver.resolveNotification(descriptor);
      expect(r).toEqual({
        accountId: 7,
        accountCurrency: 'AMD',
        categoryId: 'cat-food',
        labelOverride: null,
        matchedAccount: true,
        matchedCategory: true,
        currencyMatch: true,
        fullyMatched: true,
      });
    });

    it('is NOT fullyMatched on a currency mismatch', async () => {
      AccountsDB.getAccountByCardMask.mockResolvedValue({ id: 7, currency: 'USD' });
      NotificationRulesDB.getMerchantRule.mockResolvedValue({ categoryId: 'cat-food' });
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

    it('is never fullyMatched for a C2C transfer, even with a learned rule', async () => {
      AccountsDB.getAccountByCardMask.mockResolvedValue({ id: 7, currency: 'AMD' });
      NotificationRulesDB.getMerchantRule.mockResolvedValue({ categoryId: 'cat-food' });
      const r = await resolver.resolveNotification({ ...descriptor, requiresCategory: true });
      expect(r.matchedAccount).toBe(true);
      expect(r.categoryId).toBeNull();
      expect(r.matchedCategory).toBe(false);
      expect(r.fullyMatched).toBe(false);
    });
  });
});
