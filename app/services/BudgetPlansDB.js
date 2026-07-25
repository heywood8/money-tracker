/**
 * BudgetPlansDB — data access for Budgets v2 (envelope-style monthly income
 * allocation). One plan per month with an expected income, split into lines that
 * each link to EXACTLY ONE tracking target (an expense category or a destination
 * account). See app/db/schema.js (budget_plans, budget_plan_lines).
 *
 * Mirrors the style of BudgetsDB.js: snake_case → camelCase mapping, validation
 * in the service, and precise decimal math via app/services/currency.js (no floats).
 */

import uuid from 'react-native-uuid';
import { executeQuery, queryAll, queryFirst, executeTransaction } from './db';
import * as Currency from './currency';
import * as CategoriesDB from './CategoriesDB';
import { calculateSpendingForBudget, deriveSpendingStatus } from './BudgetsDB';
import { formatDate as formatLocalDate } from './BalanceHistoryDB';
import {
  fetchRatesToTarget,
  convertWithRateMap,
  getTransferTotals,
  getUnconvertibleCurrencies,
} from './OperationsDB';

// YYYY-MM with a real 01–12 month.
const MONTH_REGEX = /^\d{4}-(0[1-9]|1[0-2])$/;

/**
 * Map a budget_plans row (snake_case) to the camelCase shape the app uses.
 * @param {Object|null} row
 * @returns {Object|null}
 */
export const mapPlanFields = (row) => {
  if (!row) return null;
  return {
    id: row.id,
    month: row.month,
    currency: row.currency,
    expectedIncome: row.expected_income,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
};

/**
 * Map a budget_plan_lines row to camelCase. Adds a computed `isBroken` flag: a
 * line is broken when neither target is set (its category/account FK was nulled by
 * an ON DELETE SET NULL). The UI (later parts) prompts to re-link such lines.
 *
 * `isRecurring` / `currency` were added in migration 0019 (Budgets v3 phase 2): a
 * recurring line is a global template (`planId` NULL) that applies to every
 * month automatically and carries its own `currency` (it has no plan to inherit
 * one from); a one-off line keeps the original Budgets v2 shape (`currency` null,
 * inherits the parent plan's currency).
 * @param {Object|null} row
 * @returns {Object|null}
 */
export const mapLineFields = (row) => {
  if (!row) return null;
  const categoryId = row.category_id ?? null;
  const toAccountId = row.to_account_id ?? null;
  return {
    id: row.id,
    planId: row.plan_id ?? null,
    label: row.label ?? null,
    amount: row.amount,
    comment: row.comment ?? null,
    categoryId,
    toAccountId,
    sortOrder: row.sort_order ?? 0,
    isBroken: categoryId === null && toAccountId === null,
    isRecurring: row.is_recurring === 1,
    currency: row.currency ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
};

// True when a target reference is meaningfully set (not null/undefined/'').
const isSet = (value) => value !== null && value !== undefined && value !== '';

/**
 * Validate a plan.
 * @param {Object} plan
 * @returns {string|null} Error message or null if valid.
 */
export const validatePlan = (plan) => {
  if (!plan || !plan.month || !MONTH_REGEX.test(plan.month)) {
    return 'A valid month (YYYY-MM) is required';
  }
  if (!plan.currency) {
    return 'Currency is required';
  }
  // expectedIncome is optional (defaults to '0'); when present it must be a
  // valid, non-negative number.
  if (isSet(plan.expectedIncome)) {
    if (!Currency.isValid(plan.expectedIncome) || Currency.isNegative(plan.expectedIncome)) {
      return 'Expected income must be a non-negative number';
    }
  }
  return null;
};

/**
 * Validate a plan line, including the "exactly one target" invariant.
 * @param {Object} line
 * @returns {string|null} Error message or null if valid.
 */
export const validatePlanLine = (line) => {
  if (!line || !Currency.isValid(line.amount) || Currency.compare(line.amount, '0') <= 0) {
    return 'Amount must be greater than zero';
  }
  const hasCategory = isSet(line.categoryId);
  const hasAccount = isSet(line.toAccountId);
  if (hasCategory && hasAccount) {
    return 'A line must link to either a category or an account, not both';
  }
  if (!hasCategory && !hasAccount) {
    return 'A line must link to a category or an account';
  }
  return null;
};

/* -------------------------------------------------------------------------- */
/* Plans                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Create a plan. Requires a unique month.
 * @param {Object} plan - { id, month, currency, expectedIncome? }
 * @returns {Promise<Object>} The created plan (camelCase).
 */
export const createPlan = async (plan) => {
  try {
    const validationError = validatePlan(plan);
    if (validationError) {
      throw new Error(validationError);
    }

    const existing = await getPlanByMonth(plan.month);
    if (existing) {
      throw new Error('A plan for this month already exists');
    }

    const now = new Date().toISOString();
    const row = {
      id: plan.id || uuid.v4(),
      month: plan.month,
      currency: plan.currency,
      expected_income: isSet(plan.expectedIncome) ? String(plan.expectedIncome) : '0',
      created_at: now,
      updated_at: now,
    };

    try {
      await executeQuery(
        'INSERT INTO budget_plans (id, month, currency, expected_income, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
        [row.id, row.month, row.currency, row.expected_income, row.created_at, row.updated_at],
      );
    } catch (insertError) {
      // A double-tap Save that lazily creates a plan (e.g. MonthlyPlanSection's
      // ensurePlan) can fire two createPlan calls for the same month before
      // either commits — both pass the getPlanByMonth check above, then race at
      // the UNIQUE(budget_plans.month) constraint here. Rather than surface a
      // raw constraint-violation error when the first tap already succeeded,
      // treat this specific failure as "the plan now exists" and hand back the
      // one that won the race, so the losing caller still gets a usable plan.
      const isUniqueMonthViolation = /UNIQUE constraint failed/i.test(insertError?.message || '')
        && /budget_plans\.month/i.test(insertError?.message || '');
      if (isUniqueMonthViolation) {
        const raced = await getPlanByMonth(plan.month);
        if (raced) return raced;
      }
      throw insertError;
    }

    return mapPlanFields(row);
  } catch (error) {
    console.error('Failed to create budget plan:', error);
    throw error;
  }
};

/**
 * Get a plan by month (YYYY-MM).
 * @param {string} month
 * @returns {Promise<Object|null>}
 */
export const getPlanByMonth = async (month) => {
  try {
    const row = await queryFirst('SELECT * FROM budget_plans WHERE month = ?', [month]);
    return mapPlanFields(row);
  } catch (error) {
    console.error('Failed to get budget plan by month:', error);
    throw error;
  }
};

/**
 * Get a plan by ID.
 * @param {string} id
 * @returns {Promise<Object|null>}
 */
export const getPlanById = async (id) => {
  try {
    const row = await queryFirst('SELECT * FROM budget_plans WHERE id = ?', [id]);
    return mapPlanFields(row);
  } catch (error) {
    console.error('Failed to get budget plan by id:', error);
    throw error;
  }
};

/**
 * Get all plans, newest month first.
 * @returns {Promise<Array>}
 */
export const getAllPlans = async () => {
  try {
    const rows = await queryAll('SELECT * FROM budget_plans ORDER BY month DESC');
    return (rows || []).map(mapPlanFields);
  } catch (error) {
    console.error('Failed to get budget plans:', error);
    throw error;
  }
};

/**
 * Update a plan.
 * @param {string} id
 * @param {Object} updates - Partial { month, currency, expectedIncome }
 * @returns {Promise<void>}
 */
export const updatePlan = async (id, updates) => {
  try {
    const fields = [];
    const values = [];

    if (updates.month !== undefined) {
      if (!MONTH_REGEX.test(updates.month)) {
        throw new Error('A valid month (YYYY-MM) is required');
      }
      fields.push('month = ?');
      values.push(updates.month);
    }
    if (updates.currency !== undefined) {
      fields.push('currency = ?');
      values.push(updates.currency);
    }
    if (updates.expectedIncome !== undefined) {
      if (!Currency.isValid(updates.expectedIncome) || Currency.isNegative(updates.expectedIncome)) {
        throw new Error('Expected income must be a non-negative number');
      }
      fields.push('expected_income = ?');
      values.push(String(updates.expectedIncome));
    }

    if (fields.length === 0) {
      return; // Nothing to update
    }

    fields.push('updated_at = ?');
    values.push(new Date().toISOString());
    values.push(id);

    await executeQuery(`UPDATE budget_plans SET ${fields.join(', ')} WHERE id = ?`, values);
  } catch (error) {
    console.error('Failed to update budget plan:', error);
    throw error;
  }
};

/**
 * Delete a plan. Its lines are removed by ON DELETE CASCADE.
 * @param {string} id
 * @returns {Promise<void>}
 */
export const deletePlan = async (id) => {
  try {
    await executeQuery('DELETE FROM budget_plans WHERE id = ?', [id]);
  } catch (error) {
    console.error('Failed to delete budget plan:', error);
    throw error;
  }
};

/* -------------------------------------------------------------------------- */
/* Lines                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Get the lines of a plan, ordered by sort order.
 * @param {string} planId
 * @returns {Promise<Array>}
 */
export const getPlanLines = async (planId) => {
  try {
    const rows = await queryAll(
      'SELECT * FROM budget_plan_lines WHERE plan_id = ? ORDER BY sort_order ASC, created_at ASC',
      [planId],
    );
    return (rows || []).map(mapLineFields);
  } catch (error) {
    console.error('Failed to get budget plan lines:', error);
    throw error;
  }
};

/**
 * Get the "broken" lines of a plan — those whose category/account link was nulled
 * by a deletion and now track nothing. Exposed so the UI can prompt to re-link.
 * @param {string} planId
 * @returns {Promise<Array>}
 */
export const getBrokenLines = async (planId) => {
  try {
    const rows = await queryAll(
      'SELECT * FROM budget_plan_lines WHERE plan_id = ? AND category_id IS NULL AND to_account_id IS NULL ORDER BY sort_order ASC',
      [planId],
    );
    return (rows || []).map(mapLineFields);
  } catch (error) {
    console.error('Failed to get broken budget plan lines:', error);
    throw error;
  }
};

/**
 * Shared insert path for both a one-off line (`planId` set, inherits the
 * plan's currency) and a recurring/global-template line (`planId === null`,
 * carries its own `currency`) — the two used to be near-identical copy-pasted
 * functions; merging them means a future change to the insert shape (columns,
 * validation, defaults) can't silently drift between the two copies.
 * @param {string|null} planId - Plan to scope a one-off line to, or `null` for recurring.
 * @param {Object} line - { label?, amount, currency?, comment?, categoryId?, toAccountId?, sortOrder? }
 * @returns {Promise<Object>} The created line (camelCase).
 */
const insertPlanLine = async (planId, line) => {
  const isRecurring = planId === null;
  try {
    const validationError = validatePlanLine(line);
    if (validationError) {
      throw new Error(validationError);
    }
    if (isRecurring && !line.currency) {
      throw new Error('Currency is required for a recurring allocation');
    }

    const now = new Date().toISOString();
    const row = {
      id: line.id || uuid.v4(),
      plan_id: planId,
      label: line.label ?? null,
      amount: String(line.amount),
      comment: line.comment ?? null,
      category_id: isSet(line.categoryId) ? line.categoryId : null,
      to_account_id: isSet(line.toAccountId) ? line.toAccountId : null,
      sort_order: Number.isInteger(line.sortOrder) ? line.sortOrder : 0,
      is_recurring: isRecurring ? 1 : 0,
      currency: isRecurring ? line.currency : null,
      created_at: now,
      updated_at: now,
    };

    await executeQuery(
      'INSERT INTO budget_plan_lines (id, plan_id, label, amount, comment, category_id, to_account_id, sort_order, is_recurring, currency, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [
        row.id, row.plan_id, row.label, row.amount, row.comment, row.category_id,
        row.to_account_id, row.sort_order, row.is_recurring, row.currency, row.created_at, row.updated_at,
      ],
    );

    return mapLineFields(row);
  } catch (error) {
    console.error(`Failed to add ${isRecurring ? 'recurring ' : ''}budget plan line:`, error);
    throw error;
  }
};

/**
 * Add a one-off line to a plan (scoped to that plan's month; inherits its
 * currency). For a recurring (global, every-month) line see {@link addRecurringLine}.
 * @param {string} planId
 * @param {Object} line - { label?, amount, comment?, categoryId?, toAccountId?, sortOrder? }
 * @returns {Promise<Object>} The created line (camelCase).
 */
export const addLine = async (planId, line) => insertPlanLine(planId, line);

/**
 * Add a recurring (global template) line: not tied to any single month's plan
 * (`plan_id` NULL) — it applies to every calendar month automatically, mirroring
 * how the legacy per-category `budgets` (v1) behaved. Since it has no plan to
 * inherit a currency from, `line.currency` is required.
 * @param {Object} line - { label?, amount, currency, comment?, categoryId?, toAccountId?, sortOrder? }
 * @returns {Promise<Object>} The created line (camelCase).
 */
export const addRecurringLine = async (line) => insertPlanLine(null, line);

/**
 * Get all recurring lines (global templates, not tied to any one month's plan).
 * These apply to every calendar month automatically.
 * @returns {Promise<Array>}
 */
export const getRecurringLines = async () => {
  try {
    const rows = await queryAll(
      'SELECT * FROM budget_plan_lines WHERE is_recurring = 1 ORDER BY sort_order ASC, created_at ASC',
    );
    return (rows || []).map(mapLineFields);
  } catch (error) {
    console.error('Failed to get recurring budget plan lines:', error);
    throw error;
  }
};

/**
 * Get every line that applies to a given month: recurring (global) lines UNION
 * the one-off lines of that month's plan, if one exists. This is what the merged
 * Budgets screen renders — recurring lines show even for a month with no plan
 * created yet.
 * @param {string} month - YYYY-MM
 * @returns {Promise<Array>}
 */
export const getLinesForMonth = async (month) => {
  try {
    const [recurringLines, plan] = await Promise.all([
      getRecurringLines(),
      getPlanByMonth(month),
    ]);
    const oneOffLines = plan ? await getPlanLines(plan.id) : [];
    return [...recurringLines, ...oneOffLines];
  } catch (error) {
    console.error('Failed to get lines for month:', error);
    throw error;
  }
};

/**
 * Update a line. Partial updates. The "exactly one target" invariant is preserved
 * even for partial updates: (re)assigning one target to a real value implicitly
 * clears the other, so a line can never end up linked to both — a partial update
 * cannot silently pair a new account onto a line that still holds a category.
 *
 * Recurring <-> one-off scope changes: pass `isRecurring` to move the line
 * between the two scopes (see app/db/schema.js doc comment on budgetPlanLines).
 * Turning recurring ON requires `currency` (the line has no plan to inherit one
 * from); turning it OFF requires `planId` (the month it becomes scoped to). A
 * plain edit of an already-recurring line's currency (no scope change) is done by
 * passing `currency` alone, without `isRecurring`.
 * @param {string} id
 * @param {Object} updates - Partial { label, amount, comment, categoryId, toAccountId,
 *   sortOrder, isRecurring, currency, planId }
 * @returns {Promise<void>}
 */
export const updateLine = async (id, updates) => {
  try {
    // Reject setting both targets in a single update outright.
    if (isSet(updates.categoryId) && isSet(updates.toAccountId)) {
      throw new Error('A line must link to either a category or an account, not both');
    }
    if (updates.amount !== undefined
      && (!Currency.isValid(updates.amount) || Currency.compare(updates.amount, '0') <= 0)) {
      throw new Error('Amount must be greater than zero');
    }

    // Derive the target writes. Assigning one real target clears the opposite one,
    // even when the caller didn't mention it — that's what keeps a partial update
    // from leaving both set (the row may already hold the other target).
    let categoryId = updates.categoryId;
    let toAccountId = updates.toAccountId;
    if (isSet(updates.categoryId)) {
      toAccountId = null;
    } else if (isSet(updates.toAccountId)) {
      categoryId = null;
    }

    const fields = [];
    const values = [];

    if (updates.label !== undefined) {
      fields.push('label = ?');
      values.push(updates.label ?? null);
    }
    if (updates.amount !== undefined) {
      fields.push('amount = ?');
      values.push(String(updates.amount));
    }
    if (updates.comment !== undefined) {
      fields.push('comment = ?');
      values.push(updates.comment ?? null);
    }
    if (categoryId !== undefined) {
      fields.push('category_id = ?');
      values.push(isSet(categoryId) ? categoryId : null);
    }
    if (toAccountId !== undefined) {
      fields.push('to_account_id = ?');
      values.push(isSet(toAccountId) ? toAccountId : null);
    }
    if (updates.sortOrder !== undefined) {
      fields.push('sort_order = ?');
      values.push(Number.isInteger(updates.sortOrder) ? updates.sortOrder : 0);
    }

    if (updates.isRecurring !== undefined) {
      if (updates.isRecurring) {
        if (!updates.currency) {
          throw new Error('Currency is required for a recurring allocation');
        }
        fields.push('is_recurring = ?', 'plan_id = ?', 'currency = ?');
        values.push(1, null, updates.currency);
      } else {
        if (!updates.planId) {
          throw new Error('A target plan is required to make an allocation one-time');
        }
        fields.push('is_recurring = ?', 'plan_id = ?', 'currency = ?');
        values.push(0, updates.planId, null);
      }
    } else if (updates.currency !== undefined) {
      // Direct currency edit on an already-recurring line — no scope change.
      fields.push('currency = ?');
      values.push(updates.currency ?? null);
    }

    if (fields.length === 0) {
      return; // Nothing to update
    }

    fields.push('updated_at = ?');
    values.push(new Date().toISOString());
    values.push(id);

    await executeQuery(`UPDATE budget_plan_lines SET ${fields.join(', ')} WHERE id = ?`, values);
  } catch (error) {
    console.error('Failed to update budget plan line:', error);
    throw error;
  }
};

/**
 * Delete a line.
 * @param {string} id
 * @returns {Promise<void>}
 */
export const deleteLine = async (id) => {
  try {
    await executeQuery('DELETE FROM budget_plan_lines WHERE id = ?', [id]);
  } catch (error) {
    console.error('Failed to delete budget plan line:', error);
    throw error;
  }
};

/**
 * Shared reorder path for both a plan's one-off lines (`planId` set — the WHERE
 * clause is scoped to `plan_id = ?`) and the recurring/global-template lines
 * (`planId === null` — scoped to `is_recurring = 1` instead, since those rows
 * have no plan). Merged for the same reason as {@link insertPlanLine}: the two
 * were copy-pasted and could otherwise drift apart on the next change.
 * @param {string|null} planId - Plan to scope the reorder to, or `null` for recurring.
 * @param {Array<string>} orderedIds - Full list of line IDs in the desired order.
 * @returns {Promise<void>}
 */
const reorderPlanLines = async (planId, orderedIds) => {
  const isRecurring = planId === null;
  try {
    const seen = new Set();
    for (const id of orderedIds) {
      if (!id) {
        throw new Error('Invalid line data: missing id');
      }
      if (seen.has(id)) {
        throw new Error(`Duplicate line ID in reorder: ${id}`);
      }
      seen.add(id);
    }

    const now = new Date().toISOString();
    const whereClause = isRecurring ? 'id = ? AND is_recurring = 1' : 'id = ? AND plan_id = ?';
    await executeTransaction(async (db) => {
      for (let i = 0; i < orderedIds.length; i++) {
        const params = isRecurring ? [i, now, orderedIds[i]] : [i, now, orderedIds[i], planId];
        await db.runAsync(
          `UPDATE budget_plan_lines SET sort_order = ?, updated_at = ? WHERE ${whereClause}`,
          params,
        );
      }
    });
  } catch (error) {
    console.error(`Failed to reorder ${isRecurring ? 'recurring ' : ''}budget plan lines:`, error);
    throw error;
  }
};

/**
 * Persist a new line order for a plan. `orderedIds` is the full list of line IDs
 * in the desired order; each line's sort_order is set to its index.
 * @param {string} planId
 * @param {Array<string>} orderedIds
 * @returns {Promise<void>}
 */
export const reorderLines = async (planId, orderedIds) => reorderPlanLines(planId, orderedIds);

/**
 * Persist a new line order for the recurring (global template) lines.
 * `orderedIds` is the full list of recurring line IDs in the desired order.
 * @param {Array<string>} orderedIds
 * @returns {Promise<void>}
 */
export const reorderRecurringLines = async (orderedIds) => reorderPlanLines(null, orderedIds);

/* -------------------------------------------------------------------------- */
/* Derived                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Compute a plan's totals. The remainder is COMPUTED, never stored, and may be
 * negative when the plan is over-allocated.
 * @param {string} planId
 * @returns {Promise<{ expectedIncome: string, allocated: string, remainder: string }>}
 */
export const getPlanTotals = async (planId) => {
  try {
    const plan = await getPlanById(planId);
    if (!plan) {
      throw new Error(`Budget plan ${planId} not found`);
    }
    const currency = plan.currency;
    const lines = await getPlanLines(planId);

    let allocated = Currency.add('0', '0', currency);
    for (const line of lines) {
      allocated = Currency.add(allocated, line.amount, currency);
    }

    const expectedIncome = Currency.add(plan.expectedIncome, '0', currency);
    const remainder = Currency.subtract(expectedIncome, allocated, currency);

    return { expectedIncome, allocated, remainder };
  } catch (error) {
    console.error('Failed to compute budget plan totals:', error);
    throw error;
  }
};

/**
 * Clone a plan (and all its lines) from one month into a new month. Used by the
 * editor's "start from last month". Fails if the source month has no plan or the
 * target month already has one.
 * @param {string} fromMonth - YYYY-MM to copy from
 * @param {string} toMonth - YYYY-MM to copy into
 * @returns {Promise<Object>} The newly created plan (camelCase).
 */
export const copyPlan = async (fromMonth, toMonth) => {
  try {
    if (!MONTH_REGEX.test(toMonth)) {
      throw new Error('A valid month (YYYY-MM) is required');
    }

    const source = await getPlanByMonth(fromMonth);
    if (!source) {
      throw new Error(`No budget plan found for ${fromMonth}`);
    }

    const existing = await getPlanByMonth(toMonth);
    if (existing) {
      throw new Error('A plan for this month already exists');
    }

    const sourceLines = await getPlanLines(source.id);
    const now = new Date().toISOString();
    const newPlanId = uuid.v4();

    await executeTransaction(async (db) => {
      await db.runAsync(
        'INSERT INTO budget_plans (id, month, currency, expected_income, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
        [newPlanId, toMonth, source.currency, source.expectedIncome, now, now],
      );

      for (let i = 0; i < sourceLines.length; i++) {
        const line = sourceLines[i];
        await db.runAsync(
          'INSERT INTO budget_plan_lines (id, plan_id, label, amount, comment, category_id, to_account_id, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [
            uuid.v4(), newPlanId, line.label, line.amount, line.comment,
            line.categoryId, line.toAccountId, line.sortOrder ?? i, now, now,
          ],
        );
      }
    });

    return mapPlanFields({
      id: newPlanId,
      month: toMonth,
      currency: source.currency,
      expected_income: source.expectedIncome,
      created_at: now,
      updated_at: now,
    });
  } catch (error) {
    console.error('Failed to copy budget plan:', error);
    throw error;
  }
};

/* -------------------------------------------------------------------------- */
/* Plan vs actual                                                              */
/* -------------------------------------------------------------------------- */

/**
 * First/last local calendar day of a YYYY-MM month as YYYY-MM-DD strings.
 * Operation dates are stored as local YYYY-MM-DD, so the boundaries use local
 * date math (mirroring formatLocalDate usage in BudgetsDB) — a UTC conversion
 * would shift the month edge in non-UTC timezones.
 * @param {string} month - YYYY-MM
 * @returns {{ startDate: string, endDate: string }}
 */
export const getMonthDateRange = (month) => {
  if (!MONTH_REGEX.test(month)) {
    throw new Error('A valid month (YYYY-MM) is required');
  }
  const [year, monthNum] = month.split('-').map(Number);
  const start = new Date(year, monthNum - 1, 1);
  const end = new Date(year, monthNum, 0); // day 0 of next month = last day
  return { startDate: formatLocalDate(start), endDate: formatLocalDate(end) };
};

/**
 * Compute the actual amount tracked by one plan line for a month.
 *
 * - Category-linked line: expense spending of the category including descendants,
 *   via the shared convert-all engine ({@link calculateSpendingForBudget}). With
 *   `convertAll` off, only operations in accounts of `displayCurrency` count.
 * - Account-linked line (transfer target): incoming transfers into the account
 *   ({@link getTransferTotals}; values are in the destination account's currency),
 *   converted into `displayCurrency` regardless of the toggle — a transfer target
 *   in another currency is still part of the plan.
 * - Broken line (target deleted, FK nulled): `{ broken: true }`.
 *
 * @param {Object} line - Plan line (camelCase, see mapLineFields)
 * @param {string} month - YYYY-MM
 * @param {string} displayCurrency - Currency to express the actual in
 * @param {boolean} convertAll - Count category spending from accounts in any currency
 * @returns {Promise<{ broken: boolean, actual: string, sourceCurrency?: string }>}
 *   `sourceCurrency` is set for account-linked lines (the destination account's
 *   currency); an unconvertible source yields actual '0' and the caller can flag
 *   the currency via {@link getUnconvertibleCurrencies}.
 */
export const calculateLineActual = async (line, month, displayCurrency, convertAll) => {
  try {
    const { startDate, endDate } = getMonthDateRange(month);

    if (isSet(line.categoryId)) {
      const actual = await calculateSpendingForBudget(
        line.categoryId,
        displayCurrency,
        startDate,
        endDate,
        true, // include descendant categories
        convertAll,
      );
      return { broken: false, actual: String(actual) };
    }

    if (isSet(line.toAccountId)) {
      const account = await queryFirst('SELECT currency FROM accounts WHERE id = ?', [line.toAccountId]);
      if (!account) {
        return { broken: true, actual: '0' };
      }
      const { incoming } = await getTransferTotals(line.toAccountId, startDate, endDate);
      const sourceCurrency = account.currency;
      if (sourceCurrency === displayCurrency) {
        return { broken: false, actual: incoming, sourceCurrency };
      }
      const rateByCurrency = await fetchRatesToTarget([sourceCurrency], displayCurrency);
      const converted = convertWithRateMap(incoming, sourceCurrency, displayCurrency, rateByCurrency);
      // No rate: the amount cannot be expressed in the display currency, so it is
      // dropped (mirroring mergeConvertedByCategory) and the source currency is
      // reported for the warning UI.
      return { broken: false, actual: converted === null ? '0' : converted, sourceCurrency };
    }

    return { broken: true, actual: '0' };
  } catch (error) {
    console.error('Failed to calculate plan line actual:', error);
    throw error;
  }
};

/**
 * Total actual income for a month, expressed in `displayCurrency`. With
 * `convertAll` on, income from accounts in any currency is converted at the
 * current rate (offline table first, live fallback — the same path Graphs uses);
 * currencies with no available rate are dropped. With it off, only income into
 * accounts of `displayCurrency` counts.
 * @param {string} month - YYYY-MM
 * @param {string} displayCurrency
 * @param {boolean} convertAll
 * @returns {Promise<string>} Total income (decimal string)
 */
export const calculateActualIncome = async (month, displayCurrency, convertAll) => {
  try {
    const { startDate, endDate } = getMonthDateRange(month);

    if (convertAll) {
      const rows = await queryAll(
        `SELECT a.currency as currency, SUM(CAST(o.amount AS REAL)) as total
         FROM operations o
         JOIN accounts a ON o.account_id = a.id
         WHERE o.type = 'income'
           AND o.date >= ?
           AND o.date <= ?
         GROUP BY a.currency`,
        [startDate, endDate],
      );

      const rowList = rows || [];
      const rateByCurrency = await fetchRatesToTarget(rowList.map(r => r.currency), displayCurrency);
      let total = '0';
      for (const row of rowList) {
        const converted = convertWithRateMap(String(row.total ?? '0'), row.currency, displayCurrency, rateByCurrency);
        if (converted === null) continue;
        total = Currency.add(total, converted);
      }
      return total;
    }

    const result = await queryFirst(
      `SELECT SUM(CAST(o.amount AS REAL)) as total
       FROM operations o
       JOIN accounts a ON o.account_id = a.id
       WHERE o.type = 'income'
         AND a.currency = ?
         AND o.date >= ?
         AND o.date <= ?`,
      [displayCurrency, startDate, endDate],
    );
    return result && result.total != null ? String(result.total) : '0';
  } catch (error) {
    console.error('Failed to calculate actual income:', error);
    throw error;
  }
};

/**
 * Source currencies whose amounts feed a plan's converted actuals: expense
 * currencies of the linked categories (incl. descendants) and income currencies
 * when `convertAll` is on, plus the destination currencies of transfer lines
 * (those convert regardless of the toggle). Used to compute the
 * unconvertible-currency warning without changing how the sums drop them.
 */
const collectPlanSourceCurrencies = async (lines, startDate, endDate, convertAll, transferCurrencies) => {
  const currencies = new Set(transferCurrencies);

  if (convertAll) {
    const categoryIds = [];
    for (const line of lines) {
      if (!isSet(line.categoryId)) continue;
      categoryIds.push(line.categoryId);
      const descendants = await CategoriesDB.getAllDescendants(line.categoryId);
      categoryIds.push(...descendants.map(cat => cat.id));
    }

    if (categoryIds.length > 0) {
      const placeholders = categoryIds.map(() => '?').join(',');
      const rows = await queryAll(
        `SELECT DISTINCT a.currency as currency
         FROM operations o
         JOIN accounts a ON o.account_id = a.id
         WHERE o.category_id IN (${placeholders})
           AND o.type = 'expense'
           AND o.date >= ?
           AND o.date <= ?`,
        [...categoryIds, startDate, endDate],
      );
      for (const row of rows || []) currencies.add(row.currency);
    }

    const incomeRows = await queryAll(
      `SELECT DISTINCT a.currency as currency
       FROM operations o
       JOIN accounts a ON o.account_id = a.id
       WHERE o.type = 'income'
         AND o.date >= ?
         AND o.date <= ?`,
      [startDate, endDate],
    );
    for (const row of incomeRows || []) currencies.add(row.currency);
  }

  return currencies;
};

/**
 * Compute a plan's full plan-vs-actual status: per-line actuals with the shared
 * budget status bands, income vs expected, and totals — all expressed in
 * `displayCurrency` (defaults to the plan's own currency). Lines include BOTH the
 * plan's one-off lines and every recurring (global) line — see
 * {@link getLinesForMonth}. A recurring line's own `currency` (when it differs
 * from the display currency) is converted the same way an account-linked line's
 * destination currency is: always, regardless of `convertAll` — the target
 * amount itself needs a consistent currency to be comparable, unlike the actual
 * spending sum which is gated by the toggle.
 * @param {string} planId
 * @param {string} [displayCurrency] - Currency to express actuals in (default: plan currency)
 * @param {boolean} [convertAll=false] - Count operations in any currency, converted
 * @returns {Promise<Object>} {
 *   planId, month, currency, convertAll,
 *   lines: Array<{ lineId, broken, amount, actual, remaining, percentage, isExceeded, status }>,
 *   totals: { expectedIncome, actualIncome, allocated, totalActual, plannedRemainder, actualRemainder },
 *   unconvertible: string[],
 * }
 */
export const calculatePlanStatus = async (planId, displayCurrency = null, convertAll = false) => {
  try {
    const plan = await getPlanById(planId);
    if (!plan) {
      throw new Error(`Budget plan ${planId} not found`);
    }
    const target = displayCurrency || plan.currency;
    const [oneOffLines, recurringLines] = await Promise.all([getPlanLines(planId), getRecurringLines()]);
    const lines = [...recurringLines, ...oneOffLines];
    const { startDate, endDate } = getMonthDateRange(plan.month);

    const lineStatuses = [];
    const transferCurrencies = new Set();
    let allocated = '0';
    let totalActual = '0';

    // Batch the rate lookup for every line's currency up front (one call, same
    // pattern as calculateActualIncome below) instead of a per-line fetch inside
    // the loop — with N recurring lines in foreign currencies, that used to mean
    // N sequential network/offline-table round trips instead of one.
    const distinctLineCurrencies = [...new Set(
      lines.map(line => line.currency || target).filter(c => c !== target),
    )];
    const lineRateByCurrency = distinctLineCurrencies.length > 0
      ? await fetchRatesToTarget(distinctLineCurrencies, target)
      : new Map();

    for (const line of lines) {
      // One-off lines have no currency of their own (null) — they inherit the
      // plan's currency, matching pre-recurring behavior exactly.
      const lineCurrency = line.currency || target;
      let amount = line.amount;
      if (lineCurrency !== target) {
        const converted = convertWithRateMap(amount, lineCurrency, target, lineRateByCurrency);
        if (converted === null) {
          // No rate to express this recurring line's target in the display
          // currency — flag it (reusing the unconvertible-currency plumbing)
          // rather than silently comparing mismatched currencies.
          transferCurrencies.add(lineCurrency);
          lineStatuses.push({
            lineId: line.id,
            broken: false,
            amount: line.amount,
            actual: '0',
            remaining: line.amount,
            percentage: 0,
            isExceeded: false,
            status: 'unconvertible',
          });
          continue;
        }
        amount = converted;
      }

      allocated = Currency.add(allocated, amount, target);
      const { broken, actual, sourceCurrency } = await calculateLineActual(line, plan.month, target, convertAll);

      if (broken) {
        lineStatuses.push({
          lineId: line.id,
          broken: true,
          amount,
          actual: '0',
          remaining: amount,
          percentage: 0,
          isExceeded: false,
          status: 'broken',
        });
        continue;
      }

      if (sourceCurrency) {
        transferCurrencies.add(sourceCurrency);
      }
      totalActual = Currency.add(totalActual, actual, target);
      const remaining = Currency.subtract(amount, actual, target);
      const { isExceeded, percentage, status } = deriveSpendingStatus(actual, amount);
      lineStatuses.push({
        lineId: line.id,
        broken: false,
        amount,
        actual,
        remaining,
        percentage,
        isExceeded,
        status,
      });
    }

    const actualIncome = await calculateActualIncome(plan.month, target, convertAll);
    const expectedIncome = Currency.add(plan.expectedIncome ?? '0', '0', target);
    const plannedRemainder = Currency.subtract(expectedIncome, allocated, target);
    const actualRemainder = Currency.subtract(actualIncome, totalActual, target);

    const sourceCurrencies = await collectPlanSourceCurrencies(
      lines, startDate, endDate, convertAll, transferCurrencies,
    );
    const unconvertible = sourceCurrencies.size > 0
      ? await getUnconvertibleCurrencies(sourceCurrencies, target)
      : [];

    return {
      planId: plan.id,
      month: plan.month,
      currency: target,
      convertAll,
      lines: lineStatuses,
      totals: { expectedIncome, actualIncome, allocated, totalActual, plannedRemainder, actualRemainder },
      unconvertible,
    };
  } catch (error) {
    console.error('Failed to calculate plan status:', error);
    throw error;
  }
};

/**
 * Compute plan-vs-actual statuses for all plans, keyed by plan ID. Each plan's
 * status is expressed in its own currency. A single failing plan is logged and
 * skipped so the rest still refresh (same contract as calculateAllBudgetStatuses).
 * @param {boolean} [convertAll=false]
 * @returns {Promise<Map<string, Object>>}
 */
export const calculateAllPlanStatuses = async (convertAll = false) => {
  try {
    const plans = await getAllPlans();
    const statusMap = new Map();
    for (const plan of plans) {
      try {
        const status = await calculatePlanStatus(plan.id, plan.currency, convertAll);
        statusMap.set(plan.id, status);
      } catch (error) {
        console.error(`Failed to calculate status for plan ${plan.id}:`, error);
      }
    }
    return statusMap;
  } catch (error) {
    console.error('Failed to calculate all plan statuses:', error);
    throw error;
  }
};

/* -------------------------------------------------------------------------- */
/* Legacy budgets (v1) -> recurring plan lines bridge (Budgets v3 phase 2)     */
/* -------------------------------------------------------------------------- */

// Same completion flag migration 0019's postMigration handler writes (see
// drizzle/0019_recurring_plan_lines.js and app/services/db.js's post-migration
// retry logic, which expects the key `post_migration_${handlerKey}_completed`).
// Reused here so BackupRestore.js's restore-time bridge and the live migration
// share one idempotency check — a backup taken after this migration shipped
// already carries this flag in its app_metadata, so restoring it does not
// re-derive (and double) the recurring lines.
export const BUDGETS_MIGRATION_FLAG_KEY = 'post_migration_m0019_completed';

/**
 * Convert a legacy `budgets` (v1) amount into an equivalent MONTHLY amount, per
 * the product owner's decision:
 *   - weekly → amount × (365 / 12 / 7) ≈ ×4.345, computed as ×365÷84 (365/84 ==
 *     365/12/7 exactly) so the division stays exact decimal math, not a
 *     hardcoded floating-point multiplier.
 *   - yearly → amount ÷ 12
 *   - monthly → unchanged (just re-formatted)
 * @param {string|number} amount
 * @param {'weekly'|'monthly'|'yearly'} periodType
 * @param {string} currency
 * @returns {string} Monthly-equivalent amount (decimal string)
 */
export const convertBudgetAmountToMonthly = (amount, periodType, currency) => {
  switch (periodType) {
  case 'weekly':
    return Currency.divide(Currency.multiply(amount, 365, currency), 84, currency);
  case 'yearly':
    return Currency.divide(amount, 12, currency);
  case 'monthly':
  default:
    return Currency.add(amount, '0', currency);
  }
};

/**
 * Bridge every legacy per-category `budgets` (v1) row into a recurring
 * `budget_plan_lines` row (global template, applies to every month), so the
 * merged Budgets screen has a single source of truth. Idempotent — a no-op once
 * {@link BUDGETS_MIGRATION_FLAG_KEY} is set in `app_metadata`.
 *
 * Weekly/yearly budgets are converted to their monthly equivalent (see
 * {@link convertBudgetAmountToMonthly}). The `budgets` table itself is left
 * untouched (append-only) — it simply stops being read by the app once its rows
 * have been mirrored here.
 *
 * Takes a raw db-like object (`getAllAsync`/`getFirstAsync`/`runAsync`) rather
 * than going through the `./db` service singleton, so the SAME function works
 * both as migration 0019's postMigration handler (raw SQLite instance) and as a
 * restore-time bridge inside BackupRestore.js's `executeTransaction` callback
 * (the transaction's db handle) — see BackupRestore.js.
 * @param {Object} db - Raw SQLite database instance (or transaction handle)
 * @returns {Promise<{ migrated: number, skipped: boolean }>}
 */
export const migrateLegacyBudgetsToRecurringLines = async (db) => {
  const flagRow = await db.getFirstAsync(
    'SELECT value FROM app_metadata WHERE key = ?',
    [BUDGETS_MIGRATION_FLAG_KEY],
  ).catch(() => null);
  if (flagRow) {
    return { migrated: 0, skipped: true };
  }

  const budgetRows = await db.getAllAsync('SELECT * FROM budgets').catch(() => []);
  const now = new Date().toISOString();
  let migrated = 0;

  for (const budget of budgetRows || []) {
    const monthlyAmount = convertBudgetAmountToMonthly(budget.amount, budget.period_type, budget.currency);
    await db.runAsync(
      'INSERT INTO budget_plan_lines (id, plan_id, label, amount, comment, category_id, to_account_id, sort_order, is_recurring, currency, created_at, updated_at) VALUES (?, NULL, NULL, ?, NULL, ?, NULL, 0, 1, ?, ?, ?)',
      [uuid.v4(), monthlyAmount, budget.category_id, budget.currency, now, now],
    );
    migrated++;
  }

  await db.runAsync(
    "INSERT OR REPLACE INTO app_metadata (key, value, updated_at) VALUES (?, 'true', ?)",
    [BUDGETS_MIGRATION_FLAG_KEY, now],
  );

  return { migrated, skipped: false };
};
