/**
 * Tests for skipCategoryChoice — the "don't bind to category" side of a review
 * card's choice, shared by the operations-page deck and the Settings review
 * queue.
 */

import {
  readMerchantRules,
  seedSkipCategory,
  followSkipCategory,
} from '../../../app/services/notifications/skipCategoryChoice';
import * as NotificationRulesDB from '../../../app/services/NotificationRulesDB';

jest.mock('../../../app/services/NotificationRulesDB', () => ({
  getMerchantRule: jest.fn(),
}));

const ITEM = { id: 'p1', merchant: 'SHOP', packageName: 'am.bank', categoryId: 'c1' };

describe('skipCategoryChoice', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('readMerchantRules', () => {
    it('returns each item its rule, aligned with the input', async () => {
      NotificationRulesDB.getMerchantRule.mockImplementation(async (merchant) => (
        merchant === 'SHOP' ? { id: 'r1', skipCategory: true } : null
      ));
      const rules = await readMerchantRules([ITEM, { ...ITEM, id: 'p2', merchant: 'OTHER' }]);
      expect(rules).toEqual([{ id: 'r1', skipCategory: true }, null]);
    });

    it('looks up each (merchant, source app) pair once', async () => {
      NotificationRulesDB.getMerchantRule.mockResolvedValue({ id: 'r1' });
      await readMerchantRules([
        ITEM,
        { ...ITEM, id: 'p2' },
        { ...ITEM, id: 'p3', packageName: 'ru.bank' },
      ]);
      expect(NotificationRulesDB.getMerchantRule).toHaveBeenCalledTimes(2);
      expect(NotificationRulesDB.getMerchantRule).toHaveBeenCalledWith('SHOP', 'am.bank');
      expect(NotificationRulesDB.getMerchantRule).toHaveBeenCalledWith('SHOP', 'ru.bank');
    });

    it('skips the lookup for an item with no merchant', async () => {
      const rules = await readMerchantRules([{ ...ITEM, merchant: null }]);
      expect(rules).toEqual([null]);
      expect(NotificationRulesDB.getMerchantRule).not.toHaveBeenCalled();
    });

    it('reports a failed lookup as undefined instead of rejecting', async () => {
      NotificationRulesDB.getMerchantRule.mockRejectedValue(new Error('db busy'));
      await expect(readMerchantRules([ITEM])).resolves.toEqual([undefined]);
    });
  });

  describe('seedSkipCategory', () => {
    it('starts an unflagged merchant unticked and unlocked, leaving the category alone', () => {
      expect(seedSkipCategory(false)).toEqual({ skipCategoryBinding: false, skipCategoryLocked: false });
    });

    it('starts a flagged merchant ticked, locked and with no category', () => {
      expect(seedSkipCategory(true)).toEqual({
        skipCategoryBinding: true, skipCategoryLocked: true, categoryId: null,
      });
    });
  });

  describe('followSkipCategory', () => {
    it('returns the same choice when the flag did not change', () => {
      const choice = { categoryId: 'c1', skipCategoryBinding: true, skipCategoryLocked: false };
      expect(followSkipCategory(choice, ITEM, false)).toBe(choice);
    });

    it('locks and ticks, dropping the pre-filled category', () => {
      const choice = { categoryId: 'c1', skipCategoryBinding: false, skipCategoryLocked: false };
      expect(followSkipCategory(choice, ITEM, true)).toEqual({
        categoryId: null, skipCategoryBinding: true, skipCategoryLocked: true,
      });
    });

    it('keeps a category the user picked when it locks', () => {
      const choice = { categoryId: 'c9', skipCategoryBinding: false, skipCategoryLocked: false };
      expect(followSkipCategory(choice, ITEM, true).categoryId).toBe('c9');
    });

    it('unlocks and unticks when the flag is lifted', () => {
      const choice = { categoryId: null, skipCategoryBinding: true, skipCategoryLocked: true };
      expect(followSkipCategory(choice, ITEM, false)).toEqual({
        categoryId: null, skipCategoryBinding: false, skipCategoryLocked: false,
      });
    });
  });
});
