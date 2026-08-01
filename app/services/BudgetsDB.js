import { executeQuery, queryAll, queryFirst, executeTransaction } from './db';
import * as CategoriesDB from './CategoriesDB';
import * as Currency from './currency';
import { formatDate as formatLocalDate } from './BalanceHistoryDB';
import { fetchRatesToTarget, convertWithRateMap } from './OperationsDB';

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

    // Prevent duplicate budgets (same category + currency + period_type)
    const duplicate = await findDuplicateBudget(budget.categoryId, budget.currency, budget.periodType);
    if (duplicate) {
      throw new Error('A budget for this category, currency, and period already exists');
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
    // Local date string — operation/budget dates are stored as local YYYY-MM-DD,
    // so a UTC string (toISOString) would shift the boundary in non-UTC timezones.
    const dateStr = formatLocalDate(date);

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
    const dateStr = formatLocalDate(date);

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
 * Fallback lookup table for locales where Intl.Locale.weekInfo is unavailable.
 * Values follow the weekInfo.firstDay convention: 1 = Monday, 7 = Sunday.
 * All locales supported by the app are listed. Sources: CLDR / ISO 8601.
 * en-US and a few others start on Sunday; the rest on Monday.
 */
const LOCALE_WEEK_START = {
  // Sunday-start (7)
  'en-US': 7,
  'en-CA': 7, // Canada uses Sunday in many regions
  'zh-TW': 7,
  'ko-KR': 7,
  'ja-JP': 7,
  // Monday-start (1) — ISO 8601 default, covers most of the app's locales
  'en':    1,
  'en-GB': 1,
  'it':    1,
  'ru':    1,
  'es':    1,
  'fr':    1,
  'zh':    1,
  'de':    1,
  'hy':    1,
  'ja':    1,
  'ko':    1,
  'pt':    1,
};

/**
 * Return the first day of the week for a given BCP-47 locale tag.
 * Uses Intl.Locale.weekInfo when available (Android/Hermes may not support it),
 * falls back to LOCALE_WEEK_START lookup, then defaults to Monday (1, ISO 8601).
 *
 * @param {string|null} locale - BCP-47 language tag (e.g. 'en-US', 'ru', 'fr')
 * @returns {number} First day of week: 1 = Monday … 7 = Sunday
 */
export const getWeekStartDay = (locale) => {
  if (locale) {
    // Attempt Intl.Locale weekInfo (supported in V8 ≥ 9.9, Hermes experimental)
    try {
      const localeObj = new Intl.Locale(locale);
      if (localeObj.weekInfo && typeof localeObj.weekInfo.firstDay === 'number') {
        return localeObj.weekInfo.firstDay; // 1–7, Monday–Sunday
      }
    } catch (_e) {
      // Intl.Locale constructor threw (invalid tag) — fall through
    }

    // Exact match first, then language-only prefix match
    if (LOCALE_WEEK_START[locale] !== undefined) {
      return LOCALE_WEEK_START[locale];
    }
    const lang = locale.split('-')[0];
    if (LOCALE_WEEK_START[lang] !== undefined) {
      return LOCALE_WEEK_START[lang];
    }
  }

  // ISO 8601 default: Monday
  return 1;
};

/**
 * Calculate current period dates for a given period type
 * @param {string} periodType - 'weekly' | 'monthly' | 'yearly'
 * @param {Date} referenceDate - Reference date (default: today)
 * @param {string|null} locale - BCP-47 locale tag used to determine week start day (default: null → Monday)
 * @returns {Object} { start: Date, end: Date }
 */
export const getCurrentPeriodDates = (periodType, referenceDate = new Date(), locale = null) => {
  const start = new Date(referenceDate);
  const end = new Date(referenceDate);

  switch (periodType) {
  case 'weekly': {
    // Determine the locale's first day of the week.
    // weekInfo.firstDay: 1 = Monday … 7 = Sunday.
    // JS getDay():        0 = Sunday … 6 = Saturday.
    // Convert firstDay (1-7) → JS day index (0-6): Monday=1→0, …, Sunday=7→0 mod 7.
    const firstDayRaw = getWeekStartDay(locale); // 1–7
    const firstDayJS = firstDayRaw % 7; // Monday=1→1? No: 1%7=1, 7%7=0 ✓ Sunday→0

    // Days since the week start (always 0–6)
    const dayOfWeek = start.getDay(); // 0=Sun … 6=Sat
    const diff = (dayOfWeek - firstDayJS + 7) % 7;
    start.setDate(start.getDate() - diff);
    // Derive the end from the adjusted start, not from the reference date:
    // when the week starts in the previous month, applying start's day-of-month
    // to end (still holding the reference month) lands a month ahead.
    end.setTime(start.getTime());
    end.setDate(end.getDate() + 6);
    break;
  }

  case 'monthly': {
    // Month starts on 1st and ends on last day
    start.setDate(1);
    // Pin the day before shifting the month: setMonth on a day-of-month that
    // doesn't exist in the target month (e.g. Jan 31 → "Feb 31") rolls over an
    // extra month, making the period end in the month after next.
    end.setDate(1);
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
 * Expand a set of category IDs into the full set to sum over, optionally pulling
 * in descendants, with duplicates removed.
 *
 * De-duplication is not cosmetic: a plan line may track a parent AND one of its
 * own children (migration 0021 lets it track several categories at once), and
 * with `includeChildren` on, the child would then appear twice in the IN list —
 * SQLite's `IN` ignores the repeat, but the roll-up walk is O(duplicates) and any
 * future GROUP BY over this list would double-count. Keeping the set clean here
 * means every caller is safe by construction.
 * @param {Array<string>} categoryIds - Explicitly tracked category IDs
 * @param {boolean} includeChildren - Also count spending in descendant categories
 * @returns {Promise<Array<string>>} Unique category IDs to sum over
 */
export const expandCategoryIds = async (categoryIds, includeChildren) => {
  const seen = new Set();
  const out = [];
  const push = (id) => {
    if (id === null || id === undefined || id === '' || seen.has(id)) return;
    seen.add(id);
    out.push(id);
  };

  for (const id of categoryIds || []) push(id);

  if (includeChildren) {
    // Snapshot first: `out` grows as descendants are appended, and re-walking a
    // category that is itself a descendant of another is pure waste.
    for (const id of [...out]) {
      const descendants = await CategoriesDB.getAllDescendants(id);
      for (const cat of descendants || []) push(cat.id);
    }
  }

  return out;
};

/**
 * De-duplicated list of set account IDs, order preserved. Mirrors the category
 * side's cleanup in {@link expandCategoryIds} — accounts have no hierarchy to
 * expand, so de-duplication is all there is to do.
 * @param {Array<string|number>} accountIds
 * @returns {Array<string|number>}
 */
const normalizeAccountIds = (accountIds) => {
  const seen = new Set();
  const out = [];
  for (const id of accountIds || []) {
    if (id === null || id === undefined || id === '') continue;
    const key = String(id);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(id);
  }
  return out;
};

/**
 * Calculate expense spending matching a set of filters in a date range. The
 * general form behind {@link calculateSpendingForCategories}, used by plan lines
 * that narrow spending by the SOURCE ACCOUNT the money left as well as by
 * category (migration 0024).
 *
 * The two filters are INDEPENDENT and combined with logical AND:
 *   - categories only → those categories, from any account (the pre-0024 form),
 *   - accounts only   → any expense paid from those accounts,
 *   - both            → the intersection,
 *   - neither         → '0'. A filterless sum would be "every expense you have
 *     ever made", which is never what a caller with an empty filter set means —
 *     it means the line tracks nothing (its targets were deleted).
 *
 * @param {Object} filters
 * @param {Array<string>} [filters.categoryIds] - Category IDs to sum over
 * @param {Array<string|number>} [filters.accountIds] - Source accounts to count from
 * @param {string} filters.currency - Currency code
 * @param {string} filters.startDate - Period start (YYYY-MM-DD)
 * @param {string} filters.endDate - Period end (YYYY-MM-DD)
 * @param {boolean} [filters.includeChildren=true] - Include descendant category spending
 * @param {boolean} [filters.convertAll=false] - When true, spending from accounts in ANY
 *   currency counts toward the budget, converted into the budget's currency at
 *   the current rate (offline table first, live fallback) — the same
 *   conversion path Graphs uses, so the two surfaces agree. Currencies with no
 *   available rate are dropped from the sum, mirroring mergeConvertedByCategory.
 * @returns {Promise<string>} Total spending amount (decimal string)
 */
export const calculateSpendingForFilters = async ({
  categoryIds = [],
  accountIds = [],
  currency,
  startDate,
  endDate,
  includeChildren = true,
  convertAll = false,
}) => {
  try {
    const expandedIds = await expandCategoryIds(categoryIds, includeChildren);
    const filterAccountIds = normalizeAccountIds(accountIds);

    // Nothing to filter on: a line whose every category AND account was deleted.
    // Summing without a filter would report the user's entire spend as this one
    // line's actual, so the empty set means zero, not everything.
    if (expandedIds.length === 0 && filterAccountIds.length === 0) return '0';

    // Each clause is added only when its set is non-empty — an empty `IN ()` is a
    // SQL syntax error, and an absent clause is exactly the "any" semantics.
    const conditions = [];
    const filterParams = [];
    if (expandedIds.length > 0) {
      conditions.push(`o.category_id IN (${expandedIds.map(() => '?').join(',')})`);
      filterParams.push(...expandedIds);
    }
    if (filterAccountIds.length > 0) {
      conditions.push(`o.account_id IN (${filterAccountIds.map(() => '?').join(',')})`);
      filterParams.push(...filterAccountIds);
    }
    const filterClause = conditions.join(' AND ');

    if (convertAll) {
      const rows = await queryAll(
        `SELECT a.currency as currency, SUM(CAST(o.amount AS REAL)) as total
         FROM operations o
         JOIN accounts a ON o.account_id = a.id
         WHERE ${filterClause}
           AND o.type = 'expense'
           AND o.date >= ?
           AND o.date <= ?
         GROUP BY a.currency`,
        [...filterParams, startDate, endDate],
      );

      const rowList = rows || [];
      const rateByCurrency = await fetchRatesToTarget(rowList.map(r => r.currency), currency);
      let total = '0';
      for (const row of rowList) {
        const converted = convertWithRateMap(String(row.total ?? '0'), row.currency, currency, rateByCurrency);
        if (converted === null) continue;
        total = Currency.add(total, converted);
      }
      return total;
    }

    // Query operations in date range for these filters and currency
    const query = `
      SELECT SUM(CAST(o.amount AS REAL)) as total
      FROM operations o
      JOIN accounts a ON o.account_id = a.id
      WHERE ${filterClause}
        AND o.type = 'expense'
        AND a.currency = ?
        AND o.date >= ?
        AND o.date <= ?
    `;

    const params = [...filterParams, currency, startDate, endDate];
    const result = await queryFirst(query, params);

    return result && result.total != null ? String(result.total) : '0';
  } catch (error) {
    console.error('Failed to calculate spending:', error);
    throw error;
  }
};

/**
 * Calculate spending across a SET of categories in a date range. The
 * multi-category form of {@link calculateSpendingForBudget} (migration 0021),
 * used by plan lines that track several categories at once. Delegates to
 * {@link calculateSpendingForFilters} with no account filter, i.e. "these
 * categories, from any account".
 * @param {Array<string>} categoryIds - Category IDs to sum over
 * @param {string} currency - Currency code
 * @param {string} startDate - Period start (YYYY-MM-DD)
 * @param {string} endDate - Period end (YYYY-MM-DD)
 * @param {boolean} includeChildren - Include descendant category spending (default: true)
 * @param {boolean} convertAll - See {@link calculateSpendingForFilters}
 * @returns {Promise<string>} Total spending amount (decimal string)
 */
export const calculateSpendingForCategories = async (
  categoryIds,
  currency,
  startDate,
  endDate,
  includeChildren = true,
  convertAll = false,
) => calculateSpendingForFilters({
  categoryIds,
  currency,
  startDate,
  endDate,
  includeChildren,
  convertAll,
});

/**
 * Calculate spending for a single category in a date range — the single-category
 * form kept for v1 budgets (one category by schema) and for callers that only
 * ever have one. Delegates to {@link calculateSpendingForCategories}.
 * @param {string} categoryId - Category ID
 * @param {string} currency - Currency code
 * @param {string} startDate - Period start (YYYY-MM-DD)
 * @param {string} endDate - Period end (YYYY-MM-DD)
 * @param {boolean} includeChildren - Include child category spending (default: true)
 * @param {boolean} convertAll - See {@link calculateSpendingForCategories}
 * @returns {Promise<string>} Total spending amount (decimal string)
 */
export const calculateSpendingForBudget = async (
  categoryId,
  currency,
  startDate,
  endDate,
  includeChildren = true,
  convertAll = false,
) => calculateSpendingForCategories(
  [categoryId],
  currency,
  startDate,
  endDate,
  includeChildren,
  convertAll,
);

/**
 * Derive the spent-vs-amount progress metrics shared by budgets (v1) and
 * monthly-plan lines (Budgets v2): exceeded flag, rounded percentage, and the
 * safe (<70) / warning (>=70) / danger (>=90) / exceeded (>100) status band.
 * @param {string} spent - Amount spent (decimal string)
 * @param {string} amount - Budgeted amount (decimal string)
 * @returns {{ isExceeded: boolean, percentage: number, status: string }}
 */
export const deriveSpendingStatus = (spent, amount) => {
  const isExceeded = Currency.compare(spent, amount) > 0;
  const amountNum = parseFloat(amount);
  const percentage = amountNum > 0 ? (parseFloat(spent) / amountNum) * 100 : 0;

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
    isExceeded,
    percentage: Math.round(percentage * 100) / 100, // Round to 2 decimals
    status,
  };
};

/**
 * Calculate budget status for a budget
 * @param {string} budgetId - Budget ID
 * @param {Date} referenceDate - Date to calculate status for (default: today)
 * @param {boolean} convertAll - Count spending from accounts in any currency,
 *   converted into the budget's currency (see calculateSpendingForBudget)
 * @returns {Promise<Object>} Budget status object
 */
export const calculateBudgetStatus = async (budgetId, referenceDate = new Date(), convertAll = false) => {
  try {
    const budget = await getBudgetById(budgetId);
    if (!budget) {
      throw new Error(`Budget ${budgetId} not found`);
    }

    // Calculate current period dates
    const { start, end } = getCurrentPeriodDates(budget.periodType, referenceDate);
    // Format with the local calendar date: start/end are local-midnight Dates, and
    // operation dates are local YYYY-MM-DD strings. toISOString (UTC) would move
    // the period boundary by a day for any non-UTC timezone.
    const startDateStr = formatLocalDate(start);
    const endDateStr = formatLocalDate(end);

    // Calculate spending
    const spent = await calculateSpendingForBudget(
      budget.categoryId,
      budget.currency,
      startDateStr,
      endDateStr,
      true, // Include children
      convertAll,
    );

    // Calculate metrics
    const remaining = Currency.subtract(budget.amount, spent);
    const { isExceeded, percentage, status } = deriveSpendingStatus(spent, budget.amount);

    return {
      budgetId: budget.id,
      amount: budget.amount,
      currency: budget.currency,
      spent,
      remaining,
      percentage,
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
 * @param {boolean} convertAll - Count spending from accounts in any currency,
 *   converted into each budget's currency (see calculateSpendingForBudget)
 * @returns {Promise<Map<string, Object>>} Map of budgetId → status
 */
export const calculateAllBudgetStatuses = async (referenceDate = new Date(), convertAll = false) => {
  try {
    const activeBudgets = await getActiveBudgets(referenceDate);
    const statusMap = new Map();

    for (const budget of activeBudgets) {
      try {
        const status = await calculateBudgetStatus(budget.id, referenceDate, convertAll);
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
