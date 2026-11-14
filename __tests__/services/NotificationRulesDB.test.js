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

    describe('labelIfNew (name for a source bound for the first time)', () => {
      it('stores the label on a newly inserted rule, in the same write', async () => {
        mockDb.queryFirst.mockResolvedValue(null);
        const rule = await NotificationRulesDB.upsertMerchantRule(
          'GURMAN', 'cat-food', 'am.bank', { labelIfNew: 'Gurman' },
        );
        expect(mockDb.executeQuery).toHaveBeenCalledTimes(1);
        const [sql, params] = mockDb.executeQuery.mock.calls[0];
        expect(sql).toContain('INSERT INTO notification_merchant_rules');
        // (id, merchant, package_name, category_id, label_override, ...)
        expect(params.slice(1, 5)).toEqual(['GURMAN', 'am.bank', 'cat-food', 'Gurman']);
        expect(rule.labelOverride).toBe('Gurman');
      });

      it('leaves an existing rule\'s label alone, set or not', async () => {
        // A category-only rule may be one whose name the user removed; a named
        // one may have just been typed on a sibling card. Neither is overwritten.
        mockDb.queryFirst.mockResolvedValue({
          id: 'r1', merchant: 'GURMAN', package_name: 'am.bank', category_id: 'cat-old', label_override: null,
        });
        const rule = await NotificationRulesDB.upsertMerchantRule(
          'GURMAN', 'cat-food', 'am.bank', { labelIfNew: 'Gurman' },
        );
        const [sql, params] = mockDb.executeQuery.mock.calls[0];
        expect(sql).toMatch(/^UPDATE notification_merchant_rules SET category_id = \?, updated_at = \? WHERE id = \?$/);
        expect(params).not.toContain('Gurman');
        expect(rule.labelOverride).toBeNull();
      });

      it('treats the unscoped fallback row as existing', async () => {
        // No row for this package, but an unscoped one for the merchant: the
        // category lands on that row (as reads resolve it), so it is not new.
        mockDb.queryFirst
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce({
            id: 'r0', merchant: 'GURMAN', package_name: null, category_id: 'cat-old', label_override: 'Gurman Cafe',
          });
        await NotificationRulesDB.upsertMerchantRule('GURMAN', 'cat-food', 'am.bank', { labelIfNew: 'Gurman' });
        const [sql, params] = mockDb.executeQuery.mock.calls[0];
        expect(sql).toContain('UPDATE notification_merchant_rules SET category_id = ?');
        expect(params).toEqual(['cat-food', expect.any(String), 'r0']);
      });

      it('sanitizes the label and stores none when it is blank', async () => {
        mockDb.queryFirst.mockResolvedValue(null);
        await NotificationRulesDB.upsertMerchantRule('A B', 'cat-1', null, { labelIfNew: '  A | B  ' });
        expect(mockDb.executeQuery.mock.calls[0][1][4]).toBe('A B');

        mockDb.executeQuery.mockClear();
        await NotificationRulesDB.upsertMerchantRule('SHOP', 'cat-1', null, { labelIfNew: '   ' });
        expect(mockDb.executeQuery.mock.calls[0][1][4]).toBeNull();
      });

      it('stores no label without the option', async () => {
        mockDb.queryFirst.mockResolvedValue(null);
        await NotificationRulesDB.upsertMerchantRule('SHOP', 'cat-1');
        expect(mockDb.executeQuery.mock.calls[0][1][4]).toBeNull();
      });
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

  describe('getAllMerchantRules', () => {
    it('orders by last-matched (falling back to updated_at) so recent hits float up', async () => {
      mockDb.queryAll.mockResolvedValue([]);
      await NotificationRulesDB.getAllMerchantRules();
      const [sql] = mockDb.queryAll.mock.calls[0];
      expect(sql).toContain('ORDER BY COALESCE(last_matched_at, updated_at) DESC');
    });

    it('maps last_matched_at onto the returned rule (null when absent)', async () => {
      mockDb.queryAll.mockResolvedValue([
        { id: 'r1', merchant: 'SHOP', category_id: 'c1', last_matched_at: '2026-07-17T10:00:00.000Z' },
        { id: 'r2', merchant: 'OTHER', category_id: 'c2' },
      ]);
      const rules = await NotificationRulesDB.getAllMerchantRules();
      expect(rules[0].lastMatchedAt).toBe('2026-07-17T10:00:00.000Z');
      expect(rules[1].lastMatchedAt).toBeNull();
    });
  });

  describe('touchMerchantRuleMatch', () => {
    it('does nothing when the merchant key is empty', async () => {
      await NotificationRulesDB.touchMerchantRuleMatch('');
      expect(mockDb.queryAll).not.toHaveBeenCalled();
      expect(mockDb.executeQuery).not.toHaveBeenCalled();
    });

    it('is a no-op when no rule exists for the merchant', async () => {
      mockDb.queryAll.mockResolvedValue([]);
      await NotificationRulesDB.touchMerchantRuleMatch('SHOP', 'am.bank');
      expect(mockDb.executeQuery).not.toHaveBeenCalled();
    });

    it('stamps last_matched_at on the resolved rule row', async () => {
      mockDb.queryAll.mockResolvedValue([
        { id: 'r1', merchant: 'SHOP', package_name: null, category_id: 'c1' },
      ]);
      await NotificationRulesDB.touchMerchantRuleMatch('shop');
      const [sql, params] = mockDb.executeQuery.mock.calls[0];
      expect(sql).toContain('SET last_matched_at = ?');
      expect(params[params.length - 1]).toBe('r1');
    });

    it('stamps the package-scoped row when one matches', async () => {
      mockDb.queryAll.mockResolvedValue([
        { id: 'r1', merchant: 'SHOP', package_name: null, category_id: 'c1' },
        { id: 'r2', merchant: 'SHOP', package_name: 'am.bank', category_id: 'c2' },
      ]);
      await NotificationRulesDB.touchMerchantRuleMatch('shop', 'am.bank');
      const [, params] = mockDb.executeQuery.mock.calls[0];
      expect(params[params.length - 1]).toBe('r2');
    });
  });

  describe('"don’t bind to category" flag', () => {
    const DELETE_SQL = 'DELETE FROM notification_merchant_rules WHERE id = ?';

    it('maps skip_category onto skipCategory (false for rows that predate it)', async () => {
      mockDb.queryAll.mockResolvedValue([
        { id: 'r1', merchant: 'A', skip_category: 1 },
        { id: 'r2', merchant: 'B', skip_category: 0 },
        { id: 'r3', merchant: 'C' },
        { id: 'r4', merchant: 'D', skip_category: '1' },
      ]);
      const rules = await NotificationRulesDB.getAllMerchantRules();
      expect(rules.map((r) => r.skipCategory)).toEqual([true, false, false, true]);
    });

    it('writes skip_category = 0 on every newly inserted rule', async () => {
      mockDb.queryFirst.mockResolvedValue(null);
      await NotificationRulesDB.upsertMerchantRule('SHOP', 'cat-1');
      const [sql, params] = mockDb.executeQuery.mock.calls[0];
      expect(sql).toContain('skip_category');
      // (id, merchant, package_name, category_id, label_override, skip_category, ...)
      expect(params[5]).toBe(0);
    });

    describe('upsertMerchantSkipCategory', () => {
      it('returns null for an empty merchant key', async () => {
        expect(await NotificationRulesDB.upsertMerchantSkipCategory('')).toBeNull();
        expect(mockDb.executeQuery).not.toHaveBeenCalled();
      });

      it('inserts a flagged rule with no category, learning the name when new', async () => {
        mockDb.queryFirst.mockResolvedValue(null);
        const rule = await NotificationRulesDB.upsertMerchantSkipCategory(
          'Ameriabank Api Gate', 'am.bank', { labelIfNew: 'Ameriabank Api Gate' },
        );
        const [sql, params] = mockDb.executeQuery.mock.calls[0];
        expect(sql).toContain('INSERT INTO notification_merchant_rules');
        expect(params.slice(1, 6)).toEqual(['AMERIABANK API GATE', 'am.bank', null, 'Ameriabank Api Gate', 1]);
        expect(rule.skipCategory).toBe(true);
        expect(rule.categoryId).toBeNull();
      });

      it('drops a learned category and sets the flag on an existing rule, keeping its label', async () => {
        mockDb.queryFirst.mockResolvedValue({
          id: 'r1', merchant: 'SHOP', package_name: null, category_id: 'cat-1', label_override: 'Shop', skip_category: 0,
        });
        const rule = await NotificationRulesDB.upsertMerchantSkipCategory('SHOP', null, { labelIfNew: 'Other' });
        const [sql, params] = mockDb.executeQuery.mock.calls[0];
        expect(sql).toMatch(/^UPDATE notification_merchant_rules SET skip_category = \?, category_id = \?, updated_at = \? WHERE id = \?$/);
        expect(params).toEqual([1, null, expect.any(String), 'r1']);
        expect(rule.labelOverride).toBe('Shop');
        expect(rule.skipCategory).toBe(true);
      });

      it('writes nothing when the rule is already flagged', async () => {
        mockDb.queryFirst.mockResolvedValue({
          id: 'r1', merchant: 'SHOP', package_name: null, category_id: null, skip_category: 1,
        });
        const rule = await NotificationRulesDB.upsertMerchantSkipCategory('SHOP');
        expect(mockDb.executeQuery).not.toHaveBeenCalled();
        expect(rule.skipCategory).toBe(true);
      });
    });

    describe('upsertMerchantRule on a flagged merchant', () => {
      const FLAGGED = {
        id: 'r1', merchant: 'SHOP', package_name: null, category_id: null, label_override: null, skip_category: 1,
      };

      it('leaves the flagged rule untouched when learning from a review', async () => {
        mockDb.queryFirst.mockResolvedValue(FLAGGED);
        const rule = await NotificationRulesDB.upsertMerchantRule('SHOP', 'cat-food');
        expect(mockDb.executeQuery).not.toHaveBeenCalled();
        expect(rule.skipCategory).toBe(true);
        expect(rule.categoryId).toBeNull();
      });

      it('replaces the flag with the category on an explicit edit (overrideSkip)', async () => {
        mockDb.queryFirst.mockResolvedValue(FLAGGED);
        const rule = await NotificationRulesDB.upsertMerchantRule('SHOP', 'cat-food', null, { overrideSkip: true });
        const [sql, params] = mockDb.executeQuery.mock.calls[0];
        expect(sql).toMatch(/^UPDATE notification_merchant_rules SET category_id = \?, skip_category = \?, updated_at = \? WHERE id = \?$/);
        expect(params).toEqual(['cat-food', 0, expect.any(String), 'r1']);
        expect(rule.skipCategory).toBe(false);
        expect(rule.categoryId).toBe('cat-food');
      });
    });

    describe('clearMerchantRuleSkipCategory', () => {
      it('does nothing when the rule is not found', async () => {
        mockDb.queryFirst.mockResolvedValue(null);
        await NotificationRulesDB.clearMerchantRuleSkipCategory('missing');
        expect(mockDb.executeQuery).not.toHaveBeenCalled();
      });

      it('deletes the whole row when nothing else is bound on it', async () => {
        mockDb.queryFirst.mockResolvedValue({ id: 'r1', category_id: null, label_override: null, skip_category: 1 });
        await NotificationRulesDB.clearMerchantRuleSkipCategory('r1');
        expect(mockDb.executeQuery).toHaveBeenCalledWith(DELETE_SQL, ['r1']);
      });

      it('lifts only the flag when a name binding remains', async () => {
        mockDb.queryFirst.mockResolvedValue({ id: 'r1', category_id: null, label_override: 'Gate', skip_category: 1 });
        await NotificationRulesDB.clearMerchantRuleSkipCategory('r1');
        const [sql, params] = mockDb.executeQuery.mock.calls[0];
        expect(sql).toContain('SET skip_category = 0');
        expect(params[params.length - 1]).toBe('r1');
        expect(mockDb.executeQuery).not.toHaveBeenCalledWith(DELETE_SQL, ['r1']);
      });
    });

    it('keeps a flagged row alive when its name binding is removed', async () => {
      mockDb.queryFirst.mockResolvedValue({ id: 'r1', category_id: null, label_override: 'Gate', skip_category: 1 });
      await NotificationRulesDB.clearMerchantRuleLabel('r1');
      expect(mockDb.executeQuery).not.toHaveBeenCalledWith(DELETE_SQL, ['r1']);
      expect(mockDb.executeQuery.mock.calls[0][0]).toContain('SET label_override = NULL');
    });
  });
});
