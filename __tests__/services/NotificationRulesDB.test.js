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

  describe('getLabelForMerchant', () => {
    it('returns the label override of the matched rule', async () => {
      mockDb.queryAll.mockResolvedValue([
        {
          id: 'r1', merchant: 'ECOSENSE BYUZAND', package_name: null,
          category_id: 'cat-health', label_override: 'Ecosense',
        },
      ]);
      expect(await NotificationRulesDB.getLabelForMerchant('Ecosense Byuzand')).toBe('Ecosense');
    });
    it('returns null when the rule has no override', async () => {
      mockDb.queryAll.mockResolvedValue([
        { id: 'r1', merchant: 'SHOP', package_name: null, category_id: 'cat', label_override: null },
      ]);
      expect(await NotificationRulesDB.getLabelForMerchant('shop')).toBeNull();
    });
    it('returns null when no rule exists', async () => {
      mockDb.queryAll.mockResolvedValue([]);
      expect(await NotificationRulesDB.getLabelForMerchant('nobody')).toBeNull();
    });
  });

  describe('upsertMerchantLabel', () => {
    it('returns null for an empty merchant key', async () => {
      const result = await NotificationRulesDB.upsertMerchantLabel('', 'Ecosense');
      expect(result).toBeNull();
      expect(mockDb.executeQuery).not.toHaveBeenCalled();
    });

    it('inserts a new label-only rule when none exists', async () => {
      mockDb.queryFirst.mockResolvedValue(null);
      const rule = await NotificationRulesDB.upsertMerchantLabel('Ecosense Byuzand', 'Ecosense', 'am.bank');
      expect(mockDb.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO notification_merchant_rules'),
        expect.arrayContaining(['ECOSENSE BYUZAND', 'am.bank', null, 'Ecosense']),
      );
      expect(rule.merchant).toBe('ECOSENSE BYUZAND');
      expect(rule.labelOverride).toBe('Ecosense');
      expect(rule.categoryId).toBeNull();
    });

    it('updates only the label on an existing rule, preserving its category', async () => {
      mockDb.queryFirst.mockResolvedValue({
        id: 'r1', merchant: 'ECOSENSE BYUZAND', package_name: null, category_id: 'cat-health',
      });
      const rule = await NotificationRulesDB.upsertMerchantLabel('ecosense byuzand', 'Ecosense');
      expect(mockDb.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE notification_merchant_rules SET label_override = ?'),
        ['Ecosense', expect.any(String), 'r1'],
      );
      expect(rule.labelOverride).toBe('Ecosense');
      expect(rule.categoryId).toBe('cat-health');
    });

    it('clears the override when given a blank label', async () => {
      mockDb.queryFirst.mockResolvedValue({
        id: 'r1', merchant: 'SHOP', package_name: null, category_id: 'cat', label_override: 'Old',
      });
      const rule = await NotificationRulesDB.upsertMerchantLabel('shop', '   ');
      expect(mockDb.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE notification_merchant_rules SET label_override = ?'),
        [null, expect.any(String), 'r1'],
      );
      expect(rule.labelOverride).toBeNull();
    });

    it('updates an existing unscoped row instead of inserting a shadowing scoped row', async () => {
      // No package-scoped row, but an unscoped rule already holds a learned
      // category. Learning a scoped label must reuse that row (the same way
      // getMerchantRule reads it) rather than create a second row that hides it.
      mockDb.queryFirst
        .mockResolvedValueOnce(null) // scoped lookup misses
        .mockResolvedValueOnce({ id: 'r1', merchant: 'SHOP', package_name: null, category_id: 'cat-x' });
      const rule = await NotificationRulesDB.upsertMerchantLabel('shop', 'Ecosense', 'am.bank');
      expect(mockDb.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE notification_merchant_rules SET label_override = ?'),
        ['Ecosense', expect.any(String), 'r1'],
      );
      // The learned category on the reused row is preserved.
      expect(rule.categoryId).toBe('cat-x');
      expect(rule.labelOverride).toBe('Ecosense');
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

  describe('clearMerchantRuleCategory', () => {
    it('does nothing when the rule is not found', async () => {
      mockDb.queryFirst.mockResolvedValue(null);
      await NotificationRulesDB.clearMerchantRuleCategory('missing');
      expect(mockDb.executeQuery).not.toHaveBeenCalled();
    });

    it('deletes the whole row when it has no label to keep', async () => {
      mockDb.queryFirst.mockResolvedValue({ id: 'r1', category_id: 'cat-1', label_override: null });
      await NotificationRulesDB.clearMerchantRuleCategory('r1');
      expect(mockDb.executeQuery).toHaveBeenCalledWith(
        'DELETE FROM notification_merchant_rules WHERE id = ?',
        ['r1'],
      );
    });

    it('nulls only the category when a label override remains', async () => {
      mockDb.queryFirst.mockResolvedValue({ id: 'r1', category_id: 'cat-1', label_override: 'Ecosense' });
      await NotificationRulesDB.clearMerchantRuleCategory('r1');
      const [sql, params] = mockDb.executeQuery.mock.calls[0];
      expect(sql).toContain('SET category_id = NULL');
      expect(params[params.length - 1]).toBe('r1');
      expect(mockDb.executeQuery).not.toHaveBeenCalledWith(
        'DELETE FROM notification_merchant_rules WHERE id = ?',
        ['r1'],
      );
    });
  });

  describe('clearMerchantRuleLabel', () => {
    it('does nothing when the rule is not found', async () => {
      mockDb.queryFirst.mockResolvedValue(null);
      await NotificationRulesDB.clearMerchantRuleLabel('missing');
      expect(mockDb.executeQuery).not.toHaveBeenCalled();
    });

    it('deletes the whole row when it has no category to keep', async () => {
      mockDb.queryFirst.mockResolvedValue({ id: 'r1', category_id: null, label_override: 'Ecosense' });
      await NotificationRulesDB.clearMerchantRuleLabel('r1');
      expect(mockDb.executeQuery).toHaveBeenCalledWith(
        'DELETE FROM notification_merchant_rules WHERE id = ?',
        ['r1'],
      );
    });

    it('nulls only the label when a learned category remains', async () => {
      mockDb.queryFirst.mockResolvedValue({ id: 'r1', category_id: 'cat-1', label_override: 'Ecosense' });
      await NotificationRulesDB.clearMerchantRuleLabel('r1');
      const [sql, params] = mockDb.executeQuery.mock.calls[0];
      expect(sql).toContain('SET label_override = NULL');
      expect(params[params.length - 1]).toBe('r1');
      expect(mockDb.executeQuery).not.toHaveBeenCalledWith(
        'DELETE FROM notification_merchant_rules WHERE id = ?',
        ['r1'],
      );
    });
  });
});
