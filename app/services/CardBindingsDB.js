import { getDrizzle } from './db';
import { eq, desc } from 'drizzle-orm';
import { cardBindings } from '../db/schema';

/**
 * Get all card bindings
 * @returns {Promise<Array>}
 */
export const getAll = async () => {
  try {
    const db = await getDrizzle();
    const results = await db.select()
      .from(cardBindings)
      .orderBy(desc(cardBindings.lastUsed));
    return results || [];
  } catch (error) {
    console.error('Failed to get card bindings:', error);
    throw error;
  }
};

/**
 * Get card binding by card mask
 * @param {string} cardMask - Masked card number (e.g., "4083***7027")
 * @returns {Promise<Object|null>}
 */
export const getByCardMask = async (cardMask) => {
  try {
    const db = await getDrizzle();
    const results = await db.select()
      .from(cardBindings)
      .where(eq(cardBindings.cardMask, cardMask))
      .limit(1);
    return results[0] || null;
  } catch (error) {
    console.error('Failed to get card binding by card mask:', error);
    throw error;
  }
};

/**
 * Create a new card binding
 * @param {string} cardMask - Masked card number
 * @param {number} accountId - Account ID to bind to
 * @param {string|null} bankName - Optional bank name
 * @returns {Promise<Object>}
 */
export const create = async (cardMask, accountId, bankName = null) => {
  try {
    const db = await getDrizzle();
    const now = new Date().toISOString();

    const bindingData = {
      cardMask,
      accountId,
      bankName,
      lastUsed: now,
      createdAt: now,
    };

    const result = await db.insert(cardBindings).values(bindingData).returning();
    return result[0];
  } catch (error) {
    console.error('Failed to create card binding:', error);
    throw error;
  }
};

/**
 * Update an existing card binding
 * @param {number} id - Binding ID
 * @param {number} accountId - New account ID
 * @returns {Promise<void>}
 */
export const update = async (id, accountId) => {
  try {
    const db = await getDrizzle();
    const now = new Date().toISOString();

    await db.update(cardBindings)
      .set({
        accountId,
        lastUsed: now,
      })
      .where(eq(cardBindings.id, id));
  } catch (error) {
    console.error('Failed to update card binding:', error);
    throw error;
  }
};

/**
 * Delete a card binding
 * @param {number} id - Binding ID
 * @returns {Promise<void>}
 */
export const deleteBinding = async (id) => {
  try {
    const db = await getDrizzle();
    await db.delete(cardBindings).where(eq(cardBindings.id, id));
  } catch (error) {
    console.error('Failed to delete card binding:', error);
    throw error;
  }
};

/**
 * Update last used timestamp for a card binding
 * @param {number} id - Binding ID
 * @returns {Promise<void>}
 */
export const updateLastUsed = async (id) => {
  try {
    const db = await getDrizzle();
    const now = new Date().toISOString();

    await db.update(cardBindings)
      .set({ lastUsed: now })
      .where(eq(cardBindings.id, id));
  } catch (error) {
    console.error('Failed to update card binding last used:', error);
    throw error;
  }
};
