/**
 * Tests for NotificationRulesDB.js — learned merchant -> category rules.
 */

import * as NotificationRulesDB from '../../app/services/NotificationRulesDB';
import * as db from '../../app/services/db';

jest.mock('../../app/services/db');

describe('NotificationRulesDB', () => {
  let mockDb;

  beforeEach(() => {
    jest.clearAllMocks();
    mockDb = {
      queryAll: jest.fn(),
      queryFirst: jest.fn(),
      executeQuery: jest.fn(),
    };
    jest.spyOn(db, 'queryAll').mockImplementation(mockDb.queryAll);
    jest.spyOn(db, 'queryFirst').mockImplementation(mockDb.queryFirst);
    jest.spyOn(db, 'executeQuery').mockImplementation(mockDb.executeQuery);
  });

  describe('normalizeMerchant', () => {
    it('uppercases, trims, and collapses whitespace', () => {
      expect(NotificationRulesDB.normalizeMerchant('  narek   mehrabyan ')).toBe('NAREK MEHRABYAN');
    });
    it('returns empty string for falsy input', () => {
      expect(NotificationRulesDB.normalizeMerchant(null)).toBe('');
      expect(NotificationRulesDB.normalizeMerchant('')).toBe('');
    });
  });

  describe('getMerchantRule', () => {
    it('returns null when merchant key is empty', async () => {
      expect(await NotificationRulesDB.getMerchantRule('')).toBeNull();
      expect(mockDb.queryAll).not.toHaveBeenCalled();
    });

    it('queries by normalized merchant key', async () => {
      mockDb.queryAll.mockResolvedValue([]);
      await NotificationRulesDB.getMerchantRule('Narek Mehrabyan');
      expect(mockDb.queryAll).toHaveBeenCalledWith(
        expect.stringContaining('WHERE merchant = ?'),
        ['NAREK MEHRABYAN'],
      );
    });

    it('prefers a package-scoped rule over an unscoped one', async () => {
      mockDb.queryAll.mockResolvedValue([
        { id: 'r1', merchant: 'SHOP', package_name: null, category_id: 'cat-unscoped' },
        { id: 'r2', merchant: 'SHOP', package_name: 'am.bank', category_id: 'cat-scoped' },
      ]);
      const rule = await NotificationRulesDB.getMerchantRule('shop', 'am.bank');
      expect(rule.categoryId).toBe('cat-scoped');
    });

    it('falls back to the unscoped rule when no package match', async () => {
      mockDb.queryAll.mockResolvedValue([
        { id: 'r1', merchant: 'SHOP', package_name: null, category_id: 'cat-unscoped' },
      ]);
      const rule = await NotificationRulesDB.getMerchantRule('shop', 'other.bank');
      expect(rule.categoryId).toBe('cat-unscoped');
    });

    it('returns null when no rows match', async () => {
      mockDb.queryAll.mockResolvedValue([]);
      expect(await NotificationRulesDB.getMerchantRule('unknown')).toBeNull();
    });
  });

  describe('getCategoryForMerchant', () => {
    it('returns the category id of the matched rule', async () => {
      mockDb.queryAll.mockResolvedValue([
        { id: 'r1', merchant: 'NAREK MEHRABYAN', package_name: null, category_id: 'cat-food' },
      ]);
      expect(await NotificationRulesDB.getCategoryForMerchant('Narek Mehrabyan')).toBe('cat-food');
    });
    it('returns null when no rule exists', async () => {
      mockDb.queryAll.mockResolvedValue([]);
      expect(await NotificationRulesDB.getCategoryForMerchant('nobody')).toBeNull();
    });
  });

  describe('upsertMerchantRule', () => {
    it('does nothing without a category id', async () => {
      const result = await NotificationRulesDB.upsertMerchantRule('SHOP', null);
      expect(result).toBeNull();
      expect(mockDb.executeQuery).not.toHaveBeenCalled();
    });

    it('inserts a new rule when none exists', async () => {
      mockDb.queryFirst.mockResolvedValue(null);
      const rule = await NotificationRulesDB.upsertMerchantRule('Narek Mehrabyan', 'cat-food', 'am.bank');
      expect(mockDb.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO notification_merchant_rules'),
        expect.arrayContaining(['NAREK MEHRABYAN', 'am.bank', 'cat-food']),
      );
      expect(rule.merchant).toBe('NAREK MEHRABYAN');
      expect(rule.categoryId).toBe('cat-food');
    });

    it('updates the existing rule when one exists', async () => {
      mockDb.queryFirst.mockResolvedValue({
        id: 'r1', merchant: 'SHOP', package_name: null, category_id: 'cat-old',
      });
      const rule = await NotificationRulesDB.upsertMerchantRule('shop', 'cat-new');
      expect(mockDb.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE notification_merchant_rules SET category_id = ?'),
        expect.arrayContaining(['cat-new', 'r1']),
      );
      expect(rule.categoryId).toBe('cat-new');
    });
  });

  describe('deleteMerchantRule', () => {
    it('deletes by id', async () => {
      await NotificationRulesDB.deleteMerchantRule('r1');
      expect(mockDb.executeQuery).toHaveBeenCalledWith(
        'DELETE FROM notification_merchant_rules WHERE id = ?',
        ['r1'],
      );
    });
  });
});
