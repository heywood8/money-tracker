import { executeQuery, queryAll, queryFirst, executeTransaction } from './db';

/**
 * Get all accounts
 * @returns {Promise<Array>}
 */
export const getAllAccounts = async () => {
  try {
    const accounts = await queryAll(
      'SELECT * FROM accounts ORDER BY created_at DESC'
    );
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
    const account = await queryFirst(
      'SELECT * FROM accounts WHERE id = ?',
      [id]
    );
    return account;
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

    await executeQuery(
      'INSERT INTO accounts (id, name, balance, currency, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
      [
        accountData.id,
        accountData.name,
        accountData.balance,
        accountData.currency,
        accountData.created_at,
        accountData.updated_at,
      ]
    );

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
    const updatedAt = new Date().toISOString();
    const fields = [];
    const values = [];

    // Build dynamic UPDATE query based on provided fields
    if (updates.name !== undefined) {
      fields.push('name = ?');
      values.push(updates.name);
    }
    if (updates.balance !== undefined) {
      fields.push('balance = ?');
      values.push(updates.balance);
    }
    if (updates.currency !== undefined) {
      fields.push('currency = ?');
      values.push(updates.currency);
    }

    if (fields.length === 0) {
      return; // Nothing to update
    }

    fields.push('updated_at = ?');
    values.push(updatedAt);
    values.push(id); // Add ID at the end for WHERE clause

    const sql = `UPDATE accounts SET ${fields.join(', ')} WHERE id = ?`;
    await executeQuery(sql, values);
  } catch (error) {
    console.error('Failed to update account:', error);
    throw error;
  }
};

/**
 * Delete an account
 * @param {string} id
 * @returns {Promise<void>}
 */
export const deleteAccount = async (id) => {
  try {
    // Foreign key constraints will handle cascade deletion of related operations
    await executeQuery('DELETE FROM accounts WHERE id = ?', [id]);
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
    await executeTransaction(async (db) => {
      // Get current balance
      const account = await db.getFirstAsync(
        'SELECT balance FROM accounts WHERE id = ?',
        [id]
      );

      if (!account) {
        throw new Error(`Account ${id} not found`);
      }

      const currentBalance = parseFloat(account.balance) || 0;
      const newBalance = currentBalance + delta;

      // Update balance
      await db.runAsync(
        'UPDATE accounts SET balance = ?, updated_at = ? WHERE id = ?',
        [newBalance.toString(), new Date().toISOString(), id]
      );
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
    await executeTransaction(async (db) => {
      const now = new Date().toISOString();

      for (const [accountId, delta] of balanceChanges.entries()) {
        if (delta === 0) continue;

        // Get current balance
        const account = await db.getFirstAsync(
          'SELECT balance FROM accounts WHERE id = ?',
          [accountId]
        );

        if (!account) {
          console.warn(`Account ${accountId} not found, skipping balance update`);
          continue;
        }

        const currentBalance = parseFloat(account.balance) || 0;
        const newBalance = currentBalance + delta;

        // Update balance
        await db.runAsync(
          'UPDATE accounts SET balance = ?, updated_at = ? WHERE id = ?',
          [newBalance.toString(), now, accountId]
        );
      }
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
    const account = await queryFirst(
      'SELECT balance FROM accounts WHERE id = ?',
      [id]
    );
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
    const result = await queryFirst(
      'SELECT 1 FROM accounts WHERE id = ? LIMIT 1',
      [id]
    );
    return !!result;
  } catch (error) {
    console.error('Failed to check account existence:', error);
    throw error;
  }
};
