import uuid from 'react-native-uuid';
import { executeQuery, queryAll, queryFirst } from './db';
import { sanitizeLabel } from '../utils/labelUtils';

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
    labelOverride: row.label_override ?? null,
    lastMatchedAt: row.last_matched_at ?? null,
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
 * Resolve the user-chosen display label for a merchant, or null.
 *
 * When set, operations created from this merchant's notifications use this
 * label instead of the raw shop name (e.g. "ECOSENSE BYUZAND" -> "Ecosense").
 *
 * @param {string} merchant
 * @param {string|null} packageName
 * @returns {Promise<string|null>}
 */
export const getLabelForMerchant = async (merchant, packageName = null) => {
  const rule = await getMerchantRule(merchant, packageName);
  return rule && rule.labelOverride ? rule.labelOverride : null;
};

/**
 * Find-or-create the (merchant, packageName) rule row and set the given columns.
 *
 * Shared by the category- and label-learning upserts so the NULL-matching
 * lookup and the INSERT column list live in exactly one place. Columns not named
 * in `columns` are left untouched on an existing row and default to NULL on a new
 * one — so learning a label never disturbs a learned category and vice versa.
 *
 * @param {string} key - already-normalized merchant key (non-empty)
 * @param {string|null} packageName
 * @param {Object} columns - DB column -> value to set (e.g. { category_id } or { label_override })
 * @returns {Promise<Object>} the stored rule
 */
const upsertRuleRow = async (key, packageName, columns) => {
  const now = new Date().toISOString();
  let existing = await queryFirst(
    packageName
      ? 'SELECT * FROM notification_merchant_rules WHERE merchant = ? AND package_name = ?'
      : 'SELECT * FROM notification_merchant_rules WHERE merchant = ? AND package_name IS NULL',
    packageName ? [key, packageName] : [key],
  );

  // When scoping by package but no scoped row exists, fall back to an unscoped
  // row for the same merchant. getMerchantRule reads the same way (scoped wins,
  // unscoped fallback), so updating that row keeps the learned value visible
  // instead of inserting a scoped row that would shadow the unscoped one and
  // hide whatever it had already learned (e.g. a category).
  if (!existing && packageName) {
    existing = await queryFirst(
      'SELECT * FROM notification_merchant_rules WHERE merchant = ? AND package_name IS NULL',
      [key],
    );
  }

  if (existing) {
    const names = Object.keys(columns);
    const assignments = names.map((c) => `${c} = ?`).join(', ');
    await executeQuery(
      `UPDATE notification_merchant_rules SET ${assignments}, updated_at = ? WHERE id = ?`,
      [...names.map((c) => columns[c]), now, existing.id],
    );
    return mapRuleFields({ ...existing, ...columns, updated_at: now });
  }

  const row = {
    id: uuid.v4(),
    merchant: key,
    package_name: packageName || null,
    category_id: null,
    label_override: null,
    ...columns,
    created_at: now,
    updated_at: now,
  };
  await executeQuery(
    'INSERT INTO notification_merchant_rules (id, merchant, package_name, category_id, label_override, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [row.id, row.merchant, row.package_name, row.category_id, row.label_override, row.created_at, row.updated_at],
  );
  return mapRuleFields(row);
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
    return await upsertRuleRow(key, packageName, { category_id: categoryId });
  } catch (error) {
    console.error('Failed to upsert merchant rule:', error);
    throw error;
  }
};

/**
 * Set (or clear) the display-label override for a merchant.
 *
 * Upserts on the (merchant, packageName) pair, touching only the label column so
 * a learned category on the same row is preserved. A label override can exist
 * without any category — unlike category learning, a user may name a shop before
 * (or without ever) categorizing it. An empty/blank label clears the override.
 *
 * @param {string} merchant
 * @param {string} labelOverride
 * @param {string|null} packageName
 * @returns {Promise<Object|null>} the stored rule, or null if merchant is empty
 */
export const upsertMerchantLabel = async (merchant, labelOverride, packageName = null) => {
  const key = normalizeMerchant(merchant);
  if (!key) return null;
  // sanitizeLabel strips the label delimiter and clamps the length; '' -> null
  // so a blank entry clears any previous override rather than storing junk.
  const value = sanitizeLabel(labelOverride) || null;
  try {
    return await upsertRuleRow(key, packageName, { label_override: value });
  } catch (error) {
    console.error('Failed to upsert merchant label:', error);
    throw error;
  }
};

/**
 * All merchant rules, most-recently-matched first (for the rules-management UI).
 *
 * Orders by COALESCE(last_matched_at, updated_at) DESC so a rule whose merchant
 * was just seen again (auto-created or approved) floats above older ones even
 * though its category/label were unchanged. Rules never matched since the 0016
 * migration have a NULL last_matched_at and fall back to their updated_at.
 *
 * @returns {Promise<Array>}
 */
export const getAllMerchantRules = async () => {
  try {
    const rows = await queryAll(
      'SELECT * FROM notification_merchant_rules ORDER BY COALESCE(last_matched_at, updated_at) DESC',
    );
    return (rows || []).map(mapRuleFields);
  } catch (error) {
    console.error('Failed to get merchant rules:', error);
    throw error;
  }
};

/**
 * Stamp a merchant rule as matched right now (bumps last_matched_at), so the
 * bindings UI floats it to the top of its list. Resolves the same way reads do —
 * a package-scoped rule wins, with an unscoped rule as the fallback — so the row
 * that actually resolved the notification is the one stamped. A no-op when no
 * rule exists for the merchant (nothing learned yet). Best-effort: booking a
 * notification must never fail because this bookkeeping update did, so callers
 * swallow errors.
 *
 * @param {string} merchant
 * @param {string|null} packageName
 * @returns {Promise<void>}
 */
export const touchMerchantRuleMatch = async (merchant, packageName = null) => {
  const key = normalizeMerchant(merchant);
  if (!key) return;
  try {
    const rule = await getMerchantRule(merchant, packageName);
    if (!rule) return;
    await executeQuery(
      'UPDATE notification_merchant_rules SET last_matched_at = ? WHERE id = ?',
      [new Date().toISOString(), rule.id],
    );
  } catch (error) {
    console.error('Failed to touch merchant rule match:', error);
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

/**
 * Remove the learned category from a rule by id, leaving its label override
 * intact. When the rule would then hold neither a category nor a label the whole
 * row is deleted, so a "category binding" the user removes doesn't linger as an
 * empty rule. Used by the bindings-management UI.
 *
 * @param {string} id
 * @returns {Promise<void>}
 */
export const clearMerchantRuleCategory = async (id) => {
  try {
    const row = await queryFirst(
      'SELECT * FROM notification_merchant_rules WHERE id = ?',
      [id],
    );
    if (!row) return;
    // No label left to keep the row alive — drop it entirely.
    if (!row.label_override) {
      await deleteMerchantRule(id);
      return;
    }
    await executeQuery(
      'UPDATE notification_merchant_rules SET category_id = NULL, updated_at = ? WHERE id = ?',
      [new Date().toISOString(), id],
    );
  } catch (error) {
    console.error('Failed to clear merchant rule category:', error);
    throw error;
  }
};

/**
 * Remove the display-label override from a rule by id, leaving its learned
 * category intact. When the rule would then hold neither a label nor a category
 * the whole row is deleted. Used by the bindings-management UI.
 *
 * @param {string} id
 * @returns {Promise<void>}
 */
export const clearMerchantRuleLabel = async (id) => {
  try {
    const row = await queryFirst(
      'SELECT * FROM notification_merchant_rules WHERE id = ?',
      [id],
    );
    if (!row) return;
    // No category left to keep the row alive — drop it entirely.
    if (row.category_id == null) {
      await deleteMerchantRule(id);
      return;
    }
    await executeQuery(
      'UPDATE notification_merchant_rules SET label_override = NULL, updated_at = ? WHERE id = ?',
      [new Date().toISOString(), id],
    );
  } catch (error) {
    console.error('Failed to clear merchant rule label:', error);
    throw error;
  }
};
