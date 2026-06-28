import uuid from 'react-native-uuid';
import { executeQuery, queryAll, queryFirst } from './db';

/**
 * Merchant -> category rules for bank-notification processing.
 *
 * A rule remembers which category a given merchant's transactions belong to, so
 * once the user categorizes a merchant once it is applied automatically to
 * future notifications. Merchant keys are normalized (trimmed + uppercased) so
 * matching is case/whitespace insensitive.
 */

/**
 * Normalize a merchant string into a stable lookup key.
 * @param {string} merchant
 * @returns {string} normalized key (may be empty)
 */
export const normalizeMerchant = (merchant) =>
  (merchant || '').trim().replace(/\s+/g, ' ').toUpperCase();

const mapRuleFields = (row) => {
  if (!row) return null;
  return {
    id: row.id,
    merchant: row.merchant,
    packageName: row.package_name,
    categoryId: row.category_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
};

/**
 * Find the best matching rule for a merchant.
 *
 * When a packageName is supplied, a rule scoped to that package wins over an
 * unscoped (null-package) rule for the same merchant; an unscoped rule is used
 * as the fallback. Returns null when nothing matches.
 *
 * @param {string} merchant
 * @param {string|null} packageName
 * @returns {Promise<Object|null>}
 */
export const getMerchantRule = async (merchant, packageName = null) => {
  const key = normalizeMerchant(merchant);
  if (!key) return null;
  try {
    const rows = await queryAll(
      'SELECT * FROM notification_merchant_rules WHERE merchant = ?',
      [key],
    );
    if (!rows || rows.length === 0) return null;

    if (packageName) {
      const scoped = rows.find((r) => r.package_name === packageName);
      if (scoped) return mapRuleFields(scoped);
    }
    const unscoped = rows.find((r) => r.package_name == null);
    return mapRuleFields(unscoped || rows[0]);
  } catch (error) {
    console.error('Failed to get merchant rule:', error);
    throw error;
  }
};

/**
 * Resolve the learned category id for a merchant, or null.
 * @param {string} merchant
 * @param {string|null} packageName
 * @returns {Promise<string|null>}
 */
export const getCategoryForMerchant = async (merchant, packageName = null) => {
  const rule = await getMerchantRule(merchant, packageName);
  return rule ? rule.categoryId : null;
};

/**
 * Create or update the merchant -> category rule (learn-on-categorize).
 *
 * Upserts on the (merchant, packageName) pair. A null/empty categoryId is
 * ignored — there is nothing to learn without a category.
 *
 * @param {string} merchant
 * @param {string} categoryId
 * @param {string|null} packageName
 * @returns {Promise<Object|null>} the stored rule, or null if nothing was learned
 */
export const upsertMerchantRule = async (merchant, categoryId, packageName = null) => {
  const key = normalizeMerchant(merchant);
  if (!key || !categoryId) return null;
  try {
    const now = new Date().toISOString();
    const existing = await queryFirst(
      packageName
        ? 'SELECT * FROM notification_merchant_rules WHERE merchant = ? AND package_name = ?'
        : 'SELECT * FROM notification_merchant_rules WHERE merchant = ? AND package_name IS NULL',
      packageName ? [key, packageName] : [key],
    );

    if (existing) {
      await executeQuery(
        'UPDATE notification_merchant_rules SET category_id = ?, updated_at = ? WHERE id = ?',
        [categoryId, now, existing.id],
      );
      return mapRuleFields({ ...existing, category_id: categoryId, updated_at: now });
    }

    const id = uuid.v4();
    await executeQuery(
      'INSERT INTO notification_merchant_rules (id, merchant, package_name, category_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
      [id, key, packageName || null, categoryId, now, now],
    );
    return mapRuleFields({
      id,
      merchant: key,
      package_name: packageName || null,
      category_id: categoryId,
      created_at: now,
      updated_at: now,
    });
  } catch (error) {
    console.error('Failed to upsert merchant rule:', error);
    throw error;
  }
};

/**
 * All merchant rules, newest first (for the rules-management UI).
 * @returns {Promise<Array>}
 */
export const getAllMerchantRules = async () => {
  try {
    const rows = await queryAll(
      'SELECT * FROM notification_merchant_rules ORDER BY updated_at DESC',
    );
    return (rows || []).map(mapRuleFields);
  } catch (error) {
    console.error('Failed to get merchant rules:', error);
    throw error;
  }
};

/**
 * Delete a merchant rule by id.
 * @param {string} id
 * @returns {Promise<void>}
 */
export const deleteMerchantRule = async (id) => {
  try {
    await executeQuery('DELETE FROM notification_merchant_rules WHERE id = ?', [id]);
  } catch (error) {
    console.error('Failed to delete merchant rule:', error);
    throw error;
  }
};
