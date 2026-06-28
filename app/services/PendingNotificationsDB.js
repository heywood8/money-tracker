import uuid from 'react-native-uuid';
import { executeQuery, queryAll, queryFirst } from './db';

/**
 * Queue of parsed bank notifications awaiting user review.
 *
 * Only notifications that could not be fully matched (unknown card or unknown
 * merchant) are stored here. Each row carries the parsed descriptor plus any
 * best-effort resolved account/category suggestions for the review UI.
 */

const mapPendingFields = (row) => {
  if (!row) return null;
  return {
    id: row.id,
    kind: row.kind,
    type: row.type,
    amount: row.amount,
    currency: row.currency,
    cardMask: row.card_mask,
    merchant: row.merchant,
    country: row.country,
    date: row.date,
    time: row.time,
    accountId: row.account_id,
    categoryId: row.category_id,
    packageName: row.package_name,
    raw: row.raw,
    createdAt: row.created_at,
  };
};

/**
 * Insert a pending notification from a parsed descriptor + suggestions.
 * @param {Object} item - { kind, type, amount, currency, cardMask, merchant,
 *   country, date, time, accountId, categoryId, packageName, raw }
 * @returns {Promise<Object>} the stored pending item
 */
export const addPendingNotification = async (item) => {
  try {
    const id = uuid.v4();
    const now = new Date().toISOString();
    const row = {
      id,
      kind: item.kind,
      type: item.type,
      amount: item.amount,
      currency: item.currency,
      card_mask: item.cardMask || null,
      merchant: item.merchant || null,
      country: item.country || null,
      date: item.date || null,
      time: item.time || null,
      account_id: item.accountId ?? null,
      category_id: item.categoryId || null,
      package_name: item.packageName || null,
      raw: item.raw || null,
      created_at: now,
    };
    await executeQuery(
      `INSERT INTO pending_notifications
        (id, kind, type, amount, currency, card_mask, merchant, country, date, time, account_id, category_id, package_name, raw, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        row.id, row.kind, row.type, row.amount, row.currency, row.card_mask,
        row.merchant, row.country, row.date, row.time, row.account_id,
        row.category_id, row.package_name, row.raw, row.created_at,
      ],
    );
    return mapPendingFields(row);
  } catch (error) {
    console.error('Failed to add pending notification:', error);
    throw error;
  }
};

/**
 * All pending notifications, oldest first (review them in arrival order).
 * @returns {Promise<Array>}
 */
export const getPendingNotifications = async () => {
  try {
    const rows = await queryAll(
      'SELECT * FROM pending_notifications ORDER BY created_at ASC',
    );
    return (rows || []).map(mapPendingFields);
  } catch (error) {
    console.error('Failed to get pending notifications:', error);
    throw error;
  }
};

/**
 * Count of pending notifications (for a badge).
 * @returns {Promise<number>}
 */
export const getPendingCount = async () => {
  try {
    const result = await queryFirst('SELECT COUNT(*) as count FROM pending_notifications');
    return result ? result.count : 0;
  } catch (error) {
    console.error('Failed to count pending notifications:', error);
    return 0;
  }
};

/**
 * Get a single pending notification by id.
 * @param {string} id
 * @returns {Promise<Object|null>}
 */
export const getPendingNotificationById = async (id) => {
  try {
    const row = await queryFirst('SELECT * FROM pending_notifications WHERE id = ?', [id]);
    return mapPendingFields(row);
  } catch (error) {
    console.error('Failed to get pending notification:', error);
    throw error;
  }
};

/**
 * Remove a pending notification (after it is resolved or dismissed).
 * @param {string} id
 * @returns {Promise<void>}
 */
export const deletePendingNotification = async (id) => {
  try {
    await executeQuery('DELETE FROM pending_notifications WHERE id = ?', [id]);
  } catch (error) {
    console.error('Failed to delete pending notification:', error);
    throw error;
  }
};
