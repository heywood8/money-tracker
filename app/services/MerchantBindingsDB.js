import { getDrizzle } from './db';
import { eq, desc } from 'drizzle-orm';
import { merchantBindings } from '../db/schema';

/**
 * Get all merchant bindings
 * @returns {Promise<Array>}
 */
export const getAll = async () => {
  try {
    const db = await getDrizzle();
    const results = await db.select()
      .from(merchantBindings)
      .orderBy(desc(merchantBindings.lastUsed));
    return results || [];
  } catch (error) {
    console.error('Failed to get merchant bindings:', error);
    throw error;
  }
};

/**
 * Get merchant binding by merchant name
 * @param {string} merchantName - Merchant/purchase source name (e.g., "YANDEX.GO, AM")
 * @returns {Promise<Object|null>}
 */
export const getByMerchantName = async (merchantName) => {
  try {
    const db = await getDrizzle();
    const results = await db.select()
      .from(merchantBindings)
      .where(eq(merchantBindings.merchantName, merchantName))
      .limit(1);
    return results[0] || null;
  } catch (error) {
    console.error('Failed to get merchant binding by merchant name:', error);
    throw error;
  }
};

/**
 * Create a new merchant binding
 * @param {string} merchantName - Merchant/purchase source name
 * @param {string} categoryId - Category ID to bind to
 * @returns {Promise<Object>}
 */
export const create = async (merchantName, categoryId) => {
  try {
    const db = await getDrizzle();
    const now = new Date().toISOString();

    const bindingData = {
      merchantName,
      categoryId,
      lastUsed: now,
      createdAt: now,
    };

    const result = await db.insert(merchantBindings).values(bindingData).returning();
    return result[0];
  } catch (error) {
    console.error('Failed to create merchant binding:', error);
    throw error;
  }
};

/**
 * Update an existing merchant binding
 * @param {number} id - Binding ID
 * @param {string} categoryId - New category ID
 * @returns {Promise<void>}
 */
export const update = async (id, categoryId) => {
  try {
    const db = await getDrizzle();
    const now = new Date().toISOString();

    await db.update(merchantBindings)
      .set({
        categoryId,
        lastUsed: now,
      })
      .where(eq(merchantBindings.id, id));
  } catch (error) {
    console.error('Failed to update merchant binding:', error);
    throw error;
  }
};

/**
 * Delete a merchant binding
 * @param {number} id - Binding ID
 * @returns {Promise<void>}
 */
export const deleteBinding = async (id) => {
  try {
    const db = await getDrizzle();
    await db.delete(merchantBindings).where(eq(merchantBindings.id, id));
  } catch (error) {
    console.error('Failed to delete merchant binding:', error);
    throw error;
  }
};

/**
 * Update last used timestamp for a merchant binding
 * @param {number} id - Binding ID
 * @returns {Promise<void>}
 */
export const updateLastUsed = async (id) => {
  try {
    const db = await getDrizzle();
    const now = new Date().toISOString();

    await db.update(merchantBindings)
      .set({ lastUsed: now })
      .where(eq(merchantBindings.id, id));
  } catch (error) {
    console.error('Failed to update merchant binding last used:', error);
    throw error;
  }
};
