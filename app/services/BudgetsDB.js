import { executeQuery, queryAll, queryFirst, executeTransaction } from './db';
import * as CategoriesDB from './CategoriesDB';

/**
 * Map database field names to camelCase for application use
 * @param {Object} dbBudget - Budget object from database with snake_case fields
 * @returns {Object} Budget object with camelCase fields
 */
const mapBudgetFields = (dbBudget) => {
  if (!dbBudget) return null;

  return {
    id: dbBudget.id,
    categoryId: dbBudget.category_id,
    amount: dbBudget.amount,
    currency: dbBudget.currency,
    periodType: dbBudget.period_type,
    startDate: dbBudget.start_date,
    endDate: dbBudget.end_date,
    isRecurring: dbBudget.is_recurring === 1,
    rolloverEnabled: dbBudget.rollover_enabled === 1,
    createdAt: dbBudget.created_at,
    updatedAt: dbBudget.updated_at,
  };
};

/**
 * Validate budget data
 * @param {Object} budget - Budget object to validate
 * @returns {string|null} Error message or null if valid
 */
export const validateBudget = (budget) => {
  if (!budget.categoryId) {
    return 'Category is required';
  }

  if (!budget.amount || parseFloat(budget.amount) <= 0) {
    return 'Amount must be greater than zero';
  }

  if (!budget.currency) {
    return 'Currency is required';
  }

  if (!['weekly', 'monthly', 'yearly'].includes(budget.periodType)) {
    return 'Invalid period type';
  }

  if (!budget.startDate) {
    return 'Start date is required';
  }

  if (budget.endDate) {
    const start = new Date(budget.startDate);
    const end = new Date(budget.endDate);
    if (end <= start) {
      return 'End date must be after start date';
    }
  }

  return null;
};

/**
 * Create a new budget
 * @param {Object} budget - Budget data
 * @returns {Promise<Object>}
 */
export const createBudget = async (budget) => {
  try {
    // Validate
    const validationError = validateBudget(budget);
    if (validationError) {
      throw new Error(validationError);
    }

    const now = new Date().toISOString();
    const budgetData = {
      id: budget.id,
      category_id: budget.categoryId,
      amount: budget.amount,
      currency: budget.currency,
      period_type: budget.periodType,
      start_date: budget.startDate,
      end_date: budget.endDate || null,
      is_recurring: budget.isRecurring !== false ? 1 : 0,
      rollover_enabled: budget.rolloverEnabled === true ? 1 : 0,
      created_at: now,
      updated_at: now,
    };

    await executeQuery(
      'INSERT INTO budgets (id, category_id, amount, currency, period_type, start_date, end_date, is_recurring, rollover_enabled, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [
        budgetData.id,
        budgetData.category_id,
        budgetData.amount,
        budgetData.currency,
        budgetData.period_type,
        budgetData.start_date,
        budgetData.end_date,
        budgetData.is_recurring,
        budgetData.rollover_enabled,
        budgetData.created_at,
        budgetData.updated_at,
      ],
    );

    return mapBudgetFields(budgetData);
  } catch (error) {
    console.error('Failed to create budget:', error);
    throw error;
  }
};

/**
 * Get budget by ID
 * @param {string} id
 * @returns {Promise<Object|null>}
 */
export const getBudgetById = async (id) => {
  try {
    const budget = await queryFirst(
      'SELECT * FROM budgets WHERE id = ?',
      [id],
    );
    return mapBudgetFields(budget);
  } catch (error) {
    console.error('Failed to get budget:', error);
    throw error;
  }
};

/**
 * Get all budgets
 * @returns {Promise<Array>}
 */
export const getAllBudgets = async () => {
  try {
    const budgets = await queryAll(
      'SELECT * FROM budgets ORDER BY created_at DESC',
    );
    return (budgets || []).map(mapBudgetFields);
  } catch (error) {
    console.error('Failed to get budgets:', error);
    throw error;
  }
};

/**
 * Get budgets for a specific category
 * @param {string} categoryId - Category ID
 * @returns {Promise<Array>}
 */
export const getBudgetsByCategory = async (categoryId) => {
  try {
    const budgets = await queryAll(
      'SELECT * FROM budgets WHERE category_id = ? ORDER BY created_at DESC',
      [categoryId],
    );
    return (budgets || []).map(mapBudgetFields);
  } catch (error) {
    console.error('Failed to get budgets by category:', error);
    throw error;
  }
};

/**
 * Get budgets by currency
 * @param {string} currency - ISO currency code
 * @returns {Promise<Array>}
 */
export const getBudgetsByCurrency = async (currency) => {
  try {
    const budgets = await queryAll(
      'SELECT * FROM budgets WHERE currency = ? ORDER BY created_at DESC',
      [currency],
    );
    return (budgets || []).map(mapBudgetFields);
  } catch (error) {
    console.error('Failed to get budgets by currency:', error);
    throw error;
  }
};

/**
 * Get budgets by period type
 * @param {string} periodType - 'weekly' | 'monthly' | 'yearly'
 * @returns {Promise<Array>}
 */
export const getBudgetsByPeriodType = async (periodType) => {
  try {
    const budgets = await queryAll(
      'SELECT * FROM budgets WHERE period_type = ? ORDER BY created_at DESC',
      [periodType],
    );
    return (budgets || []).map(mapBudgetFields);
  } catch (error) {
    console.error('Failed to get budgets by period type:', error);
    throw error;
  }
};

/**
 * Update budget
 * @param {string} id - Budget ID
 * @param {Object} updates - Partial budget data to update
 * @returns {Promise<void>}
 */
export const updateBudget = async (id, updates) => {
  try {
    const updatedAt = new Date().toISOString();
    const fields = [];
    const values = [];

    // Build dynamic UPDATE query based on provided fields
    if (updates.categoryId !== undefined) {
      fields.push('category_id = ?');
      values.push(updates.categoryId);
    }
    if (updates.amount !== undefined) {
      fields.push('amount = ?');
      values.push(updates.amount);
    }
    if (updates.currency !== undefined) {
      fields.push('currency = ?');
      values.push(updates.currency);
    }
    if (updates.periodType !== undefined) {
      fields.push('period_type = ?');
      values.push(updates.periodType);
    }
    if (updates.startDate !== undefined) {
      fields.push('start_date = ?');
      values.push(updates.startDate);
    }
    if (updates.endDate !== undefined) {
      fields.push('end_date = ?');
      values.push(updates.endDate || null);
    }
    if (updates.isRecurring !== undefined) {
      fields.push('is_recurring = ?');
      values.push(updates.isRecurring ? 1 : 0);
    }
    if (updates.rolloverEnabled !== undefined) {
      fields.push('rollover_enabled = ?');
      values.push(updates.rolloverEnabled ? 1 : 0);
    }

    if (fields.length === 0) {
      return; // Nothing to update
    }

    fields.push('updated_at = ?');
    values.push(updatedAt);
    values.push(id); // Add ID at the end for WHERE clause

    const sql = `UPDATE budgets SET ${fields.join(', ')} WHERE id = ?`;
    await executeQuery(sql, values);
  } catch (error) {
    console.error('Failed to update budget:', error);
    throw error;
  }
};

/**
 * Delete budget
 * @param {string} id - Budget ID
 * @returns {Promise<void>}
 */
export const deleteBudget = async (id) => {
  try {
    await executeQuery('DELETE FROM budgets WHERE id = ?', [id]);
  } catch (error) {
    console.error('Failed to delete budget:', error);
    throw error;
  }
};

/**
 * Get active budgets for a given date
 * @param {Date} date - Reference date
 * @returns {Promise<Array>}
 */
export const getActiveBudgets = async (date = new Date()) => {
  try {
    const dateStr = date.toISOString().split('T')[0];

    const budgets = await queryAll(
      `SELECT * FROM budgets
       WHERE start_date <= ?
         AND (end_date IS NULL OR end_date >= ?)
       ORDER BY created_at ASC`,
      [dateStr, dateStr],
    );

    return (budgets || []).map(mapBudgetFields);
  } catch (error) {
    console.error('Failed to get active budgets:', error);
    throw error;
  }
};

/**
 * Check if category has active budget
 * @param {string} categoryId - Category ID
 * @param {Date} date - Reference date
 * @returns {Promise<boolean>}
 */
export const hasActiveBudget = async (categoryId, date = new Date()) => {
  try {
    const dateStr = date.toISOString().split('T')[0];

    const result = await queryFirst(
      `SELECT 1 FROM budgets
       WHERE category_id = ?
         AND start_date <= ?
         AND (end_date IS NULL OR end_date >= ?)
       LIMIT 1`,
      [categoryId, dateStr, dateStr],
    );

    return !!result;
  } catch (error) {
    console.error('Failed to check active budget:', error);
    throw error;
  }
};

/**
 * Get all active recurring budgets
 * @returns {Promise<Array>}
 */
export const getRecurringBudgets = async () => {
  try {
    const budgets = await queryAll(
      'SELECT * FROM budgets WHERE is_recurring = 1 ORDER BY created_at ASC',
    );
    return (budgets || []).map(mapBudgetFields);
  } catch (error) {
    console.error('Failed to get recurring budgets:', error);
    throw error;
  }
};

/**
 * Check for duplicate budget
 * Prevents multiple active budgets for same category + currency + period_type
 * @param {string} categoryId - Category ID
 * @param {string} currency - Currency code
 * @param {string} periodType - Period type
 * @param {string|null} excludeId - Budget ID to exclude from check (for updates)
 * @returns {Promise<Object|null>} Existing budget if duplicate found
 */
export const findDuplicateBudget = async (categoryId, currency, periodType, excludeId = null) => {
  try {
    let query = `
      SELECT * FROM budgets
      WHERE category_id = ?
        AND currency = ?
        AND period_type = ?
    `;
    const params = [categoryId, currency, periodType];

    if (excludeId) {
      query += ' AND id != ?';
      params.push(excludeId);
    }

    query += ' LIMIT 1';

    const budget = await queryFirst(query, params);
    return mapBudgetFields(budget);
  } catch (error) {
    console.error('Failed to find duplicate budget:', error);
    throw error;
  }
};

/**
 * Calculate current period dates for a given period type
 * @param {string} periodType - 'weekly' | 'monthly' | 'yearly'
 * @param {Date} referenceDate - Reference date (default: today)
 * @returns {Object} { start: Date, end: Date }
 */
export const getCurrentPeriodDates = (periodType, referenceDate = new Date()) => {
  const start = new Date(referenceDate);
  const end = new Date(referenceDate);

  switch (periodType) {
  case 'weekly': {
    // Week starts on Sunday (0) and ends on Saturday (6)
    const dayOfWeek = start.getDay();
    start.setDate(start.getDate() - dayOfWeek);
    end.setDate(start.getDate() + 6);
    break;
  }

  case 'monthly': {
    // Month starts on 1st and ends on last day
    start.setDate(1);
    end.setMonth(end.getMonth() + 1);
    end.setDate(0); // Last day of month
    break;
  }

  case 'yearly': {
    // Year starts on Jan 1 and ends on Dec 31
    start.setMonth(0);
    start.setDate(1);
    end.setMonth(11);
    end.setDate(31);
    break;
  }

  default:
    throw new Error(`Invalid period type: ${periodType}`);
  }

  // Set time to start/end of day
  start.setHours(0, 0, 0, 0);
  end.setHours(23, 59, 59, 999);

  return { start, end };
};

/**
 * Calculate next period dates
 * @param {string} periodType - Period type
 * @param {Date} currentStart - Current period start date
 * @returns {Object} { start: Date, end: Date }
 */
export const getNextPeriodDates = (periodType, currentStart) => {
  const nextStart = new Date(currentStart);

  switch (periodType) {
  case 'weekly':
    nextStart.setDate(nextStart.getDate() + 7);
    break;
  case 'monthly':
    nextStart.setMonth(nextStart.getMonth() + 1);
    break;
  case 'yearly':
    nextStart.setFullYear(nextStart.getFullYear() + 1);
    break;
  }

  return getCurrentPeriodDates(periodType, nextStart);
};

/**
 * Calculate previous period dates
 * @param {string} periodType - Period type
 * @param {Date} currentStart - Current period start date
 * @returns {Object} { start: Date, end: Date }
 */
export const getPreviousPeriodDates = (periodType, currentStart) => {
  const prevStart = new Date(currentStart);

  switch (periodType) {
  case 'weekly':
    prevStart.setDate(prevStart.getDate() - 7);
    break;
  case 'monthly':
    prevStart.setMonth(prevStart.getMonth() - 1);
    break;
  case 'yearly':
    prevStart.setFullYear(prevStart.getFullYear() - 1);
    break;
  }

  return getCurrentPeriodDates(periodType, prevStart);
};

/**
 * Calculate spending for a budget in current period
 * @param {string} categoryId - Category ID
 * @param {string} currency - Currency code
 * @param {string} startDate - Period start (YYYY-MM-DD)
 * @param {string} endDate - Period end (YYYY-MM-DD)
 * @param {boolean} includeChildren - Include child category spending (default: true)
 * @returns {Promise<number>} Total spending amount
 */
export const calculateSpendingForBudget = async (
  categoryId,
  currency,
  startDate,
  endDate,
  includeChildren = true,
) => {
  try {
    let categoryIds = [categoryId];

    // If including children, get all descendant category IDs
    if (includeChildren) {
      const descendants = await CategoriesDB.getAllDescendants(categoryId);
      categoryIds = [...categoryIds, ...descendants.map(cat => cat.id)];
    }

    // Query operations in date range for these categories and currency
    const placeholders = categoryIds.map(() => '?').join(',');
    const query = `
      SELECT SUM(CAST(o.amount AS REAL)) as total
      FROM operations o
      JOIN accounts a ON o.account_id = a.id
      WHERE o.category_id IN (${placeholders})
        AND o.type = 'expense'
        AND a.currency = ?
        AND o.date >= ?
        AND o.date <= ?
    `;

    const params = [...categoryIds, currency, startDate, endDate];
    const result = await queryFirst(query, params);

    return result && result.total ? parseFloat(result.total) : 0;
  } catch (error) {
    console.error('Failed to calculate spending:', error);
    throw error;
  }
};

/**
 * Calculate budget status for a budget
 * @param {string} budgetId - Budget ID
 * @param {Date} referenceDate - Date to calculate status for (default: today)
 * @returns {Promise<Object>} Budget status object
 */
export const calculateBudgetStatus = async (budgetId, referenceDate = new Date()) => {
  try {
    const budget = await getBudgetById(budgetId);
    if (!budget) {
      throw new Error(`Budget ${budgetId} not found`);
    }

    // Calculate current period dates
    const { start, end } = getCurrentPeriodDates(budget.periodType, referenceDate);
    const startDateStr = start.toISOString().split('T')[0];
    const endDateStr = end.toISOString().split('T')[0];

    // Calculate spending
    const spent = await calculateSpendingForBudget(
      budget.categoryId,
      budget.currency,
      startDateStr,
      endDateStr,
      true, // Include children
    );

    // Calculate metrics
    const budgetAmount = parseFloat(budget.amount);
    const remaining = budgetAmount - spent;
    const percentage = budgetAmount > 0 ? (spent / budgetAmount) * 100 : 0;
    const isExceeded = spent > budgetAmount;

    // Determine status
    let status;
    if (isExceeded) {
      status = 'exceeded';
    } else if (percentage >= 90) {
      status = 'danger';
    } else if (percentage >= 70) {
      status = 'warning';
    } else {
      status = 'safe';
    }

    return {
      budgetId: budget.id,
      amount: budget.amount,
      spent,
      remaining,
      percentage: Math.round(percentage * 100) / 100, // Round to 2 decimals
      isExceeded,
      periodStart: startDateStr,
      periodEnd: endDateStr,
      status,
    };
  } catch (error) {
    console.error('Failed to calculate budget status:', error);
    throw error;
  }
};

/**
 * Calculate status for all active budgets
 * @param {Date} referenceDate - Reference date
 * @returns {Promise<Map<string, Object>>} Map of budgetId → status
 */
export const calculateAllBudgetStatuses = async (referenceDate = new Date()) => {
  try {
    const activeBudgets = await getActiveBudgets(referenceDate);
    const statusMap = new Map();

    for (const budget of activeBudgets) {
      try {
        const status = await calculateBudgetStatus(budget.id, referenceDate);
        statusMap.set(budget.id, status);
      } catch (error) {
        console.error(`Failed to calculate status for budget ${budget.id}:`, error);
        // Continue with other budgets
      }
    }

    return statusMap;
  } catch (error) {
    console.error('Failed to calculate all budget statuses:', error);
    throw error;
  }
};

/**
 * Check if budget exists
 * @param {string} id - Budget ID
 * @returns {Promise<boolean>}
 */
export const budgetExists = async (id) => {
  try {
    const result = await queryFirst(
      'SELECT 1 FROM budgets WHERE id = ? LIMIT 1',
      [id],
    );
    return !!result;
  } catch (error) {
    console.error('Failed to check budget existence:', error);
    throw error;
  }
};
