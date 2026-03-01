import { executeQuery, queryAll, queryFirst, executeTransaction } from './db';

/**
 * Map database field names to camelCase for application use
 */
const mapPlannedOperationFields = (dbRow) => {
  if (!dbRow) return null;

  return {
    id: dbRow.id,
    name: dbRow.name,
    type: dbRow.type,
    amount: dbRow.amount,
    accountId: dbRow.account_id,
    categoryId: dbRow.category_id,
    toAccountId: dbRow.to_account_id,
    description: dbRow.description,
    isRecurring: dbRow.is_recurring === 1,
    lastExecutedMonth: dbRow.last_executed_month,
    displayOrder: dbRow.display_order,
    createdAt: dbRow.created_at,
    updatedAt: dbRow.updated_at,
  };
};

/**
 * Validate planned operation data
 * @param {Object} op - Planned operation to validate
 * @returns {string|null} Error message or null if valid
 */
export const validatePlannedOperation = (op) => {
  if (!op.name || !op.name.trim()) {
    return 'planned_name_required';
  }

  if (!op.type || !['expense', 'income', 'transfer'].includes(op.type)) {
    return 'operation_type_required';
  }

  if (!op.amount || parseFloat(op.amount) <= 0) {
    return 'valid_amount_required';
  }

  if (!op.accountId) {
    return 'account_required';
  }

  if (op.type === 'transfer') {
    if (!op.toAccountId) {
      return 'destination_account_required';
    }
    if (op.accountId === op.toAccountId) {
      return 'accounts_must_be_different';
    }
  } else {
    if (!op.categoryId) {
      return 'category_required';
    }
  }

  return null;
};

/**
 * Create a new planned operation
 */
export const createPlannedOperation = async (op) => {
  try {
    const validationError = validatePlannedOperation(op);
    if (validationError) {
      throw new Error(validationError);
    }

    const now = new Date().toISOString();
    const data = {
      id: op.id,
      name: op.name.trim(),
      type: op.type,
      amount: op.amount,
      account_id: op.accountId,
      category_id: op.categoryId || null,
      to_account_id: op.toAccountId || null,
      description: op.description || null,
      is_recurring: op.isRecurring !== false ? 1 : 0,
      last_executed_month: null,
      display_order: op.displayOrder || null,
      created_at: now,
      updated_at: now,
    };

    await executeQuery(
      `INSERT INTO planned_operations (id, name, type, amount, account_id, category_id, to_account_id, description, is_recurring, last_executed_month, display_order, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        data.id, data.name, data.type, data.amount,
        data.account_id, data.category_id, data.to_account_id,
        data.description, data.is_recurring, data.last_executed_month,
        data.display_order, data.created_at, data.updated_at,
      ],
    );

    return mapPlannedOperationFields(data);
  } catch (error) {
    console.error('Failed to create planned operation:', error);
    throw error;
  }
};

/**
 * Get planned operation by ID
 */
export const getPlannedOperationById = async (id) => {
  try {
    const row = await queryFirst(
      'SELECT * FROM planned_operations WHERE id = ?',
      [id],
    );
    return mapPlannedOperationFields(row);
  } catch (error) {
    console.error('Failed to get planned operation:', error);
    throw error;
  }
};

/**
 * Get all planned operations ordered by display_order then created_at
 */
export const getAllPlannedOperations = async () => {
  try {
    const rows = await queryAll(
      'SELECT * FROM planned_operations ORDER BY display_order ASC, created_at ASC',
    );
    return (rows || []).map(mapPlannedOperationFields);
  } catch (error) {
    console.error('Failed to get planned operations:', error);
    throw error;
  }
};

/**
 * Get recurring planned operations
 */
export const getRecurringPlannedOperations = async () => {
  try {
    const rows = await queryAll(
      'SELECT * FROM planned_operations WHERE is_recurring = 1 ORDER BY display_order ASC, created_at ASC',
    );
    return (rows || []).map(mapPlannedOperationFields);
  } catch (error) {
    console.error('Failed to get recurring planned operations:', error);
    throw error;
  }
};

/**
 * Get one-time planned operations
 */
export const getOneTimePlannedOperations = async () => {
  try {
    const rows = await queryAll(
      'SELECT * FROM planned_operations WHERE is_recurring = 0 ORDER BY display_order ASC, created_at ASC',
    );
    return (rows || []).map(mapPlannedOperationFields);
  } catch (error) {
    console.error('Failed to get one-time planned operations:', error);
    throw error;
  }
};

/**
 * Update a planned operation
 */
export const updatePlannedOperation = async (id, updates) => {
  try {
    const updatedAt = new Date().toISOString();
    const fields = [];
    const values = [];

    if (updates.name !== undefined) {
      fields.push('name = ?');
      values.push(updates.name.trim());
    }
    if (updates.type !== undefined) {
      fields.push('type = ?');
      values.push(updates.type);
    }
    if (updates.amount !== undefined) {
      fields.push('amount = ?');
      values.push(updates.amount);
    }
    if (updates.accountId !== undefined) {
      fields.push('account_id = ?');
      values.push(updates.accountId);
    }
    if (updates.categoryId !== undefined) {
      fields.push('category_id = ?');
      values.push(updates.categoryId || null);
    }
    if (updates.toAccountId !== undefined) {
      fields.push('to_account_id = ?');
      values.push(updates.toAccountId || null);
    }
    if (updates.description !== undefined) {
      fields.push('description = ?');
      values.push(updates.description || null);
    }
    if (updates.isRecurring !== undefined) {
      fields.push('is_recurring = ?');
      values.push(updates.isRecurring ? 1 : 0);
    }
    if (updates.lastExecutedMonth !== undefined) {
      fields.push('last_executed_month = ?');
      values.push(updates.lastExecutedMonth);
    }
    if (updates.displayOrder !== undefined) {
      fields.push('display_order = ?');
      values.push(updates.displayOrder);
    }

    if (fields.length === 0) return;

    fields.push('updated_at = ?');
    values.push(updatedAt);
    values.push(id);

    const sql = `UPDATE planned_operations SET ${fields.join(', ')} WHERE id = ?`;
    await executeQuery(sql, values);
  } catch (error) {
    console.error('Failed to update planned operation:', error);
    throw error;
  }
};

/**
 * Delete a planned operation
 */
export const deletePlannedOperation = async (id) => {
  try {
    await executeQuery('DELETE FROM planned_operations WHERE id = ?', [id]);
  } catch (error) {
    console.error('Failed to delete planned operation:', error);
    throw error;
  }
};

/**
 * Mark a planned operation as executed for a given month
 * @param {string} id - Planned operation ID
 * @param {string} monthStr - 'YYYY-MM' format
 */
export const markExecuted = async (id, monthStr) => {
  try {
    await executeQuery(
      'UPDATE planned_operations SET last_executed_month = ?, updated_at = ? WHERE id = ?',
      [monthStr, new Date().toISOString(), id],
    );
  } catch (error) {
    console.error('Failed to mark planned operation as executed:', error);
    throw error;
  }
};
