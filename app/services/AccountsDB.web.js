import { idb } from './db.web';
import * as Currency from './currency';

const STORE_NAME = 'accounts';

/**
 * Get all accounts
 * @returns {Promise<Array>}
 */
export const getAllAccounts = async () => {
  try {
    const accounts = await idb.getAll(STORE_NAME);
    // Sort by created_at DESC
    accounts.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    return accounts || [];
  } catch (error) {
    console.error('Failed to get accounts:', error);
    throw error;
  }
};

/**
 * Get account by ID
 * @param {string} id
 * @returns {Promise<Object|null>}
 */
export const getAccountById = async (id) => {
  try {
    const account = await idb.get(STORE_NAME, id);
    return account || null;
  } catch (error) {
    console.error('Failed to get account:', error);
    throw error;
  }
};

/**
 * Create a new account
 * @param {Object} account - Account data
 * @returns {Promise<Object>}
 */
export const createAccount = async (account) => {
  try {
    const now = new Date().toISOString();
    const accountData = {
      id: account.id,
      name: account.name,
      balance: account.balance || '0',
      currency: account.currency || 'USD',
      created_at: now,
      updated_at: now,
    };

    await idb.put(STORE_NAME, accountData);
    return accountData;
  } catch (error) {
    console.error('Failed to create account:', error);
    throw error;
  }
};

/**
 * Update an existing account
 * @param {string} id
 * @param {Object} updates
 * @returns {Promise<void>}
 */
export const updateAccount = async (id, updates) => {
  try {
    const existing = await idb.get(STORE_NAME, id);
    if (!existing) {
      throw new Error(`Account ${id} not found`);
    }

    const updatedAt = new Date().toISOString();
    const updatedAccount = {
      ...existing,
      ...updates,
      updated_at: updatedAt,
    };

    await idb.put(STORE_NAME, updatedAccount);
  } catch (error) {
    console.error('Failed to update account:', error);
    throw error;
  }
};

/**
 * Delete an account
 * @param {string} id
 * @returns {Promise<void>}
 * @throws {Error} If account has associated operations
 */
export const deleteAccount = async (id) => {
  try {
    // Check if account has any operations (expense, income, or transfers)
    const operations = await idb.getAll('operations');
    const linkedOperations = operations.filter(
      op => op.account_id === id || op.to_account_id === id
    );

    if (linkedOperations.length > 0) {
      throw new Error(
        `Cannot delete account: ${linkedOperations.length} transaction(s) are associated with this account. Please delete or reassign the transactions first.`
      );
    }

    // Safe to delete - no operations are linked to this account
    await idb.delete(STORE_NAME, id);
  } catch (error) {
    console.error('Failed to delete account:', error);
    throw error;
  }
};

/**
 * Update account balance (atomic operation)
 * @param {string} id
 * @param {number} delta - Amount to add (can be negative)
 * @returns {Promise<void>}
 */
export const updateAccountBalance = async (id, delta) => {
  try {
    const account = await idb.get(STORE_NAME, id);
    if (!account) {
      throw new Error(`Account ${id} not found`);
    }

    // Use Currency utilities for precise arithmetic
    const newBalance = Currency.add(account.balance, delta);

    await updateAccount(id, {
      balance: newBalance,
    });
  } catch (error) {
    console.error('Failed to update account balance:', error);
    throw error;
  }
};

/**
 * Batch update account balances (atomic operation)
 * @param {Map<string, number>} balanceChanges - Map of account ID to delta
 * @returns {Promise<void>}
 */
export const batchUpdateBalances = async (balanceChanges) => {
  if (balanceChanges.size === 0) {
    return;
  }

  try {
    const now = new Date().toISOString();

    // Use a single transaction for all balance updates to ensure atomicity
    await idb.transaction(STORE_NAME, async (store) => {
      const updates = [];

      // Collect all get requests
      for (const [accountId, delta] of balanceChanges.entries()) {
        if (delta === 0) continue;

        updates.push(
          new Promise((resolve, reject) => {
            const getRequest = store.get(accountId);
            getRequest.onsuccess = () => {
              const account = getRequest.result;
              if (!account) {
                console.warn(`Account ${accountId} not found, skipping balance update`);
                resolve();
                return;
              }

              // Use Currency utilities for precise arithmetic
              const newBalance = Currency.add(account.balance, delta);

              const putRequest = store.put({
                ...account,
                balance: newBalance,
                updated_at: now,
              });

              putRequest.onsuccess = () => resolve();
              putRequest.onerror = () => reject(putRequest.error);
            };
            getRequest.onerror = () => reject(getRequest.error);
          })
        );
      }

      // Wait for all operations to complete
      await Promise.all(updates);
    });
  } catch (error) {
    console.error('Failed to batch update balances:', error);
    throw error;
  }
};

/**
 * Get account balance
 * @param {string} id
 * @returns {Promise<string>}
 */
export const getAccountBalance = async (id) => {
  try {
    const account = await idb.get(STORE_NAME, id);
    return account ? account.balance : '0';
  } catch (error) {
    console.error('Failed to get account balance:', error);
    throw error;
  }
};

/**
 * Check if account exists
 * @param {string} id
 * @returns {Promise<boolean>}
 */
export const accountExists = async (id) => {
  try {
    const account = await idb.get(STORE_NAME, id);
    return !!account;
  } catch (error) {
    console.error('Failed to check account existence:', error);
    throw error;
  }
};
