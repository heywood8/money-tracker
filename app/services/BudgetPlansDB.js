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
import { calculateSpendingForCategories, expandCategoryIds, deriveSpendingStatus } from './BudgetsDB';
import { formatDate as formatLocalDate } from './BalanceHistoryDB';
import { sanitizeNewLabel } from '../utils/labelUtils';
import {
  fetchRatesToTarget,
  convertWithRateMap,
  getTransferTotals,
  getUnconvertibleCurrencies,
  createOperationInTx,
} from './OperationsDB';

// YYYY-MM with a real 01–12 month.
const MONTH_REGEX = /^\d{4}-(0[1-9]|1[0-2])$/;

// The three things a line's executable template can create. A line with no
// stored `kind` (every pre-0020 row) is a pure analytic target whose effective
// kind is inferred from its tracking target — see {@link mapLineFields}.
const LINE_KINDS = ['income', 'expense', 'transfer'];

/**
 * Every line SELECT goes through this, so the category set (migration 0021's
 * budget_plan_line_categories) always travels with the row instead of costing a
 * follow-up query per line. GROUP_CONCAT joins with ',' and category IDs are
 * UUIDs, so splitting back is unambiguous.
 *
 * Deliberately a plain correlated SCALAR subquery: SQLite has no LATERAL, so a
 * derived table in FROM cannot reference `l.id` — the tidier
 * `GROUP_CONCAT(...) FROM (SELECT ... ORDER BY ...)` spelling that would pin the
 * concat order fails outright with `no such column: l.id`. The set's order is
 * not meaningful anyway (the UI sorts by name), and the line's PRIMARY category
 * comes from its own `category_id` column, not from this list's head.
 *
 * Callers append their own WHERE/ORDER BY against the `l` alias.
 */
const LINE_SELECT = `SELECT l.*, (
      SELECT GROUP_CONCAT(lc.category_id)
      FROM budget_plan_line_categories lc
      WHERE lc.line_id = l.id
    ) AS category_ids
    FROM budget_plan_lines l`;

/** Current month as YYYY-MM (local calendar) — mirrors utils/monthUtils. */
const currentMonthKey = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
};

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
 * one from); a one-off line inherits the parent plan's currency when its own is
 * null.
 *
 * `kind` / `accountId` / `lastExecutedMonth` were added in migration 0020 (phase
 * 3). `kind` is NULL on legacy rows, so the mapped value falls back to the kind
 * implied by the target (transfer target → 'transfer', otherwise 'expense') —
 * every consumer can then read `line.kind` unconditionally. `hasTemplate` is the
 * computed "this line can be executed" flag the UI keys the execute action off.
 *
 * NOTE the `isBroken` invariant only applies to expense/transfer lines: an income
 * line needs no tracking target (it declares expected income, and the income
 * section compares the month's real income against the total), so it is never
 * "broken" for lacking one.
 * @param {Object|null} row
 * @returns {Object|null}
 */
export const mapLineFields = (row) => {
  if (!row) return null;
  const categoryIds = readCategoryIds(row);
  const primary = row.category_id ?? null;
  // The junction wins: when the row's denormalized primary category has been
  // deleted (its FK nulled, or it simply is not linked any more) but other
  // categories remain, the line still tracks those — reporting `categoryId: null`
  // would render it as broken while its actual keeps counting spending.
  const categoryId = primary !== null && categoryIds.includes(primary)
    ? primary
    : (categoryIds[0] ?? null);
  const toAccountId = row.to_account_id ?? null;
  const accountId = row.account_id ?? null;
  const kind = LINE_KINDS.includes(row.kind) ? row.kind : (toAccountId !== null ? 'transfer' : 'expense');
  return {
    id: row.id,
    planId: row.plan_id ?? null,
    label: row.label ?? null,
    amount: row.amount,
    comment: row.comment ?? null,
    categoryId,
    categoryIds,
    // NOTE: `include_children` is deliberately NOT surfaced. Descendant spending
    // always rolls up now — picking a parent category means its subtree, and a
    // leaf category has no subtree, so the flag never expressed a real choice.
    // The column stays (append-only, still round-tripped by backups/Sheets) but
    // a stored 0 no longer changes how a line counts.
    toAccountId,
    sortOrder: row.sort_order ?? 0,
    isBroken: kind !== 'income' && categoryIds.length === 0 && toAccountId === null,
    isRecurring: row.is_recurring === 1,
    currency: row.currency ?? null,
    kind,
    accountId,
    lastExecutedMonth: row.last_executed_month ?? null,
    hasTemplate: accountId !== null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
};

// True when a target reference is meaningfully set (not null/undefined/'').
const isSet = (value) => value !== null && value !== undefined && value !== '';

/**
 * De-duplicated list of set category IDs, order preserved.
 * @param {Array|null|undefined} ids
 * @returns {Array<string>}
 */
const uniqueCategoryIds = (ids) => {
  const out = [];
  for (const id of ids || []) {
    if (!isSet(id) || out.includes(id)) continue;
    out.push(id);
  }
  return out;
};

/**
 * The category set a caller means, accepting either shape: the multi-category
 * `categoryIds` array (since migration 0021) or the single legacy `categoryId`.
 * `categoryIds` wins when present, so a caller that passes both cannot end up
 * writing a set that disagrees with the primary it also asked for.
 *
 * Returns `undefined` when the caller mentioned NEITHER field — which for an
 * update means "leave the links alone", as distinct from `[]` ("unlink all").
 * @param {Object} line
 * @returns {Array<string>|undefined}
 */
const resolveCategoryIds = (line) => {
  if (Array.isArray(line?.categoryIds)) return uniqueCategoryIds(line.categoryIds);
  if (line?.categoryId !== undefined) return uniqueCategoryIds([line.categoryId]);
  return undefined;
};

/**
 * Parse the `category_ids` GROUP_CONCAT column produced by {@link LINE_SELECT}.
 * A row selected without it (an insert's in-memory row, a hand-built test row, a
 * legacy `SELECT *`) falls back to the denormalized `category_id` column, so
 * every read path yields the same shape.
 * @param {Object} row - Raw budget_plan_lines row
 * @returns {Array<string>}
 */
const readCategoryIds = (row) => {
  if (Object.prototype.hasOwnProperty.call(row, 'category_ids')) {
    const raw = row.category_ids;
    if (Array.isArray(raw)) return uniqueCategoryIds(raw);
    return typeof raw === 'string' && raw.length > 0
      ? uniqueCategoryIds(raw.split(','))
      : [];
  }
  return uniqueCategoryIds([row.category_id]);
};

/**
 * Rewrite a line's category links inside an open transaction: drop what's there,
 * insert the new set. Called with the already-normalized (de-duplicated) list.
 * @param {Object} db - Transaction-scoped database handle
 * @param {string} lineId
 * @param {Array<string>} categoryIds
 * @returns {Promise<void>}
 */
const writeLineCategoriesInTx = async (db, lineId, categoryIds) => {
  await db.runAsync('DELETE FROM budget_plan_line_categories WHERE line_id = ?', [lineId]);
  for (const categoryId of categoryIds) {
    await db.runAsync(
      'INSERT OR IGNORE INTO budget_plan_line_categories (line_id, category_id) VALUES (?, ?)',
      [lineId, categoryId],
    );
  }
};

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
 *
 * An INCOME line (`kind` === 'income') is exempt from that invariant: it declares
 * part of the month's expected income, which is compared against the month's real
 * income as a whole, so it may carry an income category for context or no target
 * at all. It must not link a transfer target, though — that would silently make
 * it track incoming transfers.
 * @param {Object} line
 * @returns {string|null} Error message or null if valid.
 */
export const validatePlanLine = (line) => {
  if (!line || !Currency.isValid(line.amount) || Currency.compare(line.amount, '0') <= 0) {
    return 'Amount must be greater than zero';
  }
  if (isSet(line.kind) && !LINE_KINDS.includes(line.kind)) {
    return 'A line must be an income, expense or transfer';
  }
  const hasCategory = (resolveCategoryIds(line) || []).length > 0;
  const hasAccount = isSet(line.toAccountId);
  if (line.kind === 'income') {
    if (hasAccount) {
      return 'An income line cannot link to a transfer target';
    }
    return null;
  }
  if (hasCategory && hasAccount) {
    return 'A line must link to either a category or an account, not both';
  }
  if (!hasCategory && !hasAccount) {
    return 'A line must link to a category or an account';
  }
  if (line.kind === 'transfer' && !hasAccount) {
    return 'A transfer line must link to a destination account';
  }
  return null;
};

/* -------------------------------------------------------------------------- */
/* Plans                                                                       */
/* -------------------------------------------------------------------------- */

// Detects the specific UNIQUE(budget_plans.month) constraint failure a
// double-tap create/copy race can hit — see {@link createPlan}'s doc comment
// for the full race description. Shared so every insert path (createPlan's
// direct executeQuery insert AND copyPlan's transaction-scoped insert)
// recognizes the same race identically instead of each guessing at the error
// shape independently.
const isUniqueMonthViolation = (error) => {
  const message = error?.message || '';
  return /UNIQUE constraint failed/i.test(message) && /budget_plans\.month/i.test(message);
};

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
      if (isUniqueMonthViolation(insertError)) {
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
      `${LINE_SELECT} WHERE l.plan_id = ? ORDER BY l.sort_order ASC, l.created_at ASC`,
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
    // Income lines are excluded: they legitimately have no tracking target (see
    // validatePlanLine), so a targetless income line is not "broken".
    //
    // Since migration 0021 "no category" means the junction holds NO row for the
    // line — not that `category_id` is null. A line whose primary category was
    // deleted but which still tracks others is fine, and must not be offered up
    // for re-linking.
    const rows = await queryAll(
      `${LINE_SELECT} WHERE l.plan_id = ?
         AND NOT EXISTS (SELECT 1 FROM budget_plan_line_categories lc WHERE lc.line_id = l.id)
         AND l.to_account_id IS NULL
         AND (l.kind IS NULL OR l.kind != 'income')
       ORDER BY l.sort_order ASC`,
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
 * @param {Object} line - { label?, amount, currency?, comment?, categoryId?, toAccountId?,
 *   sortOrder?, kind?, accountId? }
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
    const categoryIds = resolveCategoryIds(line) || [];
    const row = {
      id: line.id || uuid.v4(),
      plan_id: planId,
      label: line.label ?? null,
      amount: String(line.amount),
      comment: line.comment ?? null,
      // Primary = first of the set; the full set lives in the junction below.
      category_id: categoryIds[0] ?? null,
      category_ids: categoryIds,
      to_account_id: isSet(line.toAccountId) ? line.toAccountId : null,
      sort_order: Number.isInteger(line.sortOrder) ? line.sortOrder : 0,
      is_recurring: isRecurring ? 1 : 0,
      // A one-off line may now carry its own currency too (it just falls back to
      // the plan's when null) — an executable template's amount is expressed in
      // its account's currency, which need not match the plan's.
      currency: line.currency ?? null,
      kind: LINE_KINDS.includes(line.kind) ? line.kind : null,
      account_id: isSet(line.accountId) ? line.accountId : null,
      last_executed_month: line.lastExecutedMonth ?? null,
      // Always 1: descendant spending always rolls up (see mapLineFields). The
      // column is kept written so the backup/Sheets shape stays stable.
      include_children: 1,
      created_at: now,
      updated_at: now,
    };

    // The row and its category links go in together: a line that committed
    // without its links would read as broken (empty set, no transfer target) and
    // silently stop tracking anything.
    await executeTransaction(async (db) => {
      await db.runAsync(
        'INSERT INTO budget_plan_lines (id, plan_id, label, amount, comment, category_id, to_account_id, sort_order, is_recurring, currency, kind, account_id, last_executed_month, include_children, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [
          row.id, row.plan_id, row.label, row.amount, row.comment, row.category_id,
          row.to_account_id, row.sort_order, row.is_recurring, row.currency,
          row.kind, row.account_id, row.last_executed_month, row.include_children,
          row.created_at, row.updated_at,
        ],
      );
      await writeLineCategoriesInTx(db, row.id, categoryIds);
    });

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
      `${LINE_SELECT} WHERE l.is_recurring = 1 ORDER BY l.sort_order ASC, l.created_at ASC`,
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
 * A plan's currency, by ID. Throws instead of returning undefined so a bad/
 * stale planId surfaces as a clear error rather than silently flowing into a
 * currency-conversion call as `undefined`.
 * @param {string} planId
 * @returns {Promise<string>}
 */
const getPlanCurrencyOrThrow = async (planId) => {
  const plan = await getPlanById(planId);
  if (!plan) {
    throw new Error(`Budget plan ${planId} not found`);
  }
  return plan.currency;
};

/**
 * Currency a line's amount is presently expressed in: its own `currency` column
 * when set, otherwise the currency of the plan it belongs to. Used by
 * {@link updateLine} to know what a line's amount means BEFORE applying a
 * currency-affecting update.
 * @param {Object} row - Raw budget_plan_lines row (snake_case)
 * @returns {Promise<string>}
 */
const currentLineCurrency = async (row) => (
  row.currency || getPlanCurrencyOrThrow(row.plan_id)
);

/**
 * Convert `rawAmount` from `fromCurrency` into `toCurrency` via a live rate
 * lookup. A no-op when the currencies match (or either is missing). Throws
 * instead of silently persisting an unconverted number when no rate is
 * available — the caller (only {@link updateLine}) must not write the result
 * in that case.
 * @param {string|number} rawAmount
 * @param {string} fromCurrency
 * @param {string} toCurrency
 * @returns {Promise<string>}
 */
const convertLineAmount = async (rawAmount, fromCurrency, toCurrency) => {
  if (!fromCurrency || !toCurrency || fromCurrency === toCurrency) {
    return String(rawAmount);
  }
  const rateByCurrency = await fetchRatesToTarget([fromCurrency], toCurrency);
  const converted = convertWithRateMap(String(rawAmount), fromCurrency, toCurrency, rateByCurrency);
  if (converted === null) {
    // No rate available to express the amount in the new currency — the caller
    // must not persist the raw digits under a different currency (that would
    // silently change the line's real value). Surfaced to the UI as
    // `exchange_rate_unavailable` (see MonthlyPlanSection's save handler).
    throw new Error('exchange_rate_unavailable');
  }
  return converted;
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
 *
 * SINGLE CHOKE POINT for the currency-conversion invariant: whenever this call
 * changes the line's EFFECTIVE currency — via a scope change (isRecurring) OR a
 * plain currency edit on an already-recurring line — the amount being written
 * (the caller's `updates.amount` if given, else the row's current stored
 * amount) is converted from the OLD effective currency into the NEW one before
 * it's persisted. This is what keeps "250 EUR" from silently becoming "250 USD"
 * (same digits, ~10% richer/poorer) regardless of which UI path triggered the
 * change — every caller of updateLine is covered, not just the one that
 * remembers to convert first. When no exchange rate is available the update is
 * rejected (see {@link convertLineAmount}) rather than persisting a distorted
 * number.
 * @param {string} id
 * @param {Object} updates - Partial { label, amount, comment, categoryId, toAccountId,
 *   sortOrder, isRecurring, currency, planId }
 * @returns {Promise<void>}
 */
export const updateLine = async (id, updates) => {
  try {
    // `categoryIds` (the whole set) or the legacy single `categoryId`; undefined
    // when the caller mentioned neither, which leaves the existing links alone.
    const requestedCategoryIds = resolveCategoryIds(updates);

    // Reject setting both targets in a single update outright.
    if ((requestedCategoryIds || []).length > 0 && isSet(updates.toAccountId)) {
      throw new Error('A line must link to either a category or an account, not both');
    }
    if (updates.amount !== undefined
      && (!Currency.isValid(updates.amount) || Currency.compare(updates.amount, '0') <= 0)) {
      throw new Error('Amount must be greater than zero');
    }

    // Derive the target writes. Assigning one real target clears the opposite one,
    // even when the caller didn't mention it — that's what keeps a partial update
    // from leaving both set (the row may already hold the other target).
    let categoryIds = requestedCategoryIds;
    let toAccountId = updates.toAccountId;
    if ((categoryIds || []).length > 0) {
      toAccountId = null;
    } else if (isSet(updates.toAccountId)) {
      categoryIds = [];
    }

    const fields = [];
    const values = [];

    if (updates.label !== undefined) {
      fields.push('label = ?');
      values.push(updates.label ?? null);
    }
    if (updates.comment !== undefined) {
      fields.push('comment = ?');
      values.push(updates.comment ?? null);
    }
    if (categoryIds !== undefined) {
      // Keep the denormalized primary in step with the set it heads.
      fields.push('category_id = ?');
      values.push(categoryIds[0] ?? null);
    }
    if (toAccountId !== undefined) {
      fields.push('to_account_id = ?');
      values.push(isSet(toAccountId) ? toAccountId : null);
    }
    if (updates.sortOrder !== undefined) {
      fields.push('sort_order = ?');
      values.push(Number.isInteger(updates.sortOrder) ? updates.sortOrder : 0);
    }
    // Executable-template fields (migration 0020). `accountId` set to null drops
    // the template (the line becomes a pure analytic target again).
    if (updates.kind !== undefined) {
      if (updates.kind !== null && !LINE_KINDS.includes(updates.kind)) {
        throw new Error('A line must be an income, expense or transfer');
      }
      fields.push('kind = ?');
      values.push(updates.kind ?? null);
    }
    if (updates.accountId !== undefined) {
      fields.push('account_id = ?');
      values.push(isSet(updates.accountId) ? updates.accountId : null);
    }
    if (updates.lastExecutedMonth !== undefined) {
      fields.push('last_executed_month = ?');
      values.push(updates.lastExecutedMonth ?? null);
    }

    // Amount, possibly re-derived below when the effective currency changes.
    let amount = updates.amount;
    const changesCurrency = updates.isRecurring !== undefined || updates.currency !== undefined;

    if (changesCurrency) {
      const row = await queryFirst('SELECT * FROM budget_plan_lines WHERE id = ?', [id]);
      if (!row) {
        throw new Error('Budget plan line not found');
      }
      const fromCurrency = await currentLineCurrency(row);
      const rawAmount = amount !== undefined ? amount : row.amount;

      if (updates.isRecurring !== undefined) {
        if (updates.isRecurring) {
          if (!updates.currency) {
            throw new Error('Currency is required for a recurring allocation');
          }
          amount = await convertLineAmount(rawAmount, fromCurrency, updates.currency);
          fields.push('is_recurring = ?', 'plan_id = ?', 'currency = ?');
          values.push(1, null, updates.currency);
        } else {
          if (!updates.planId) {
            throw new Error('A target plan is required to make an allocation one-time');
          }
          // A one-off line may keep a currency of its own since migration 0020 —
          // an executable template is priced in its execution account's currency,
          // and forcing it to the plan's here would convert the amount away from
          // the currency the operation is actually created in. Without one it
          // inherits the target plan's currency (the pre-0020 behaviour).
          const toCurrency = updates.currency || await getPlanCurrencyOrThrow(updates.planId);
          amount = await convertLineAmount(rawAmount, fromCurrency, toCurrency);
          fields.push('is_recurring = ?', 'plan_id = ?', 'currency = ?');
          values.push(0, updates.planId, updates.currency ?? null);
        }
      } else {
        // Direct currency edit, no scope change. Since migration 0020 a one-off
        // line may carry its own currency too (an executable template's amount is
        // expressed in its account's currency), so this is no longer
        // recurring-only: convert from whatever the amount currently means into
        // the new effective currency — clearing it back to NULL on a one-off line
        // means "inherit the plan's currency" and converts into that.
        if (row.is_recurring === 1 && !updates.currency) {
          throw new Error('Currency is required for a recurring allocation');
        }
        const toCurrency = updates.currency || await getPlanCurrencyOrThrow(row.plan_id);
        amount = await convertLineAmount(rawAmount, fromCurrency, toCurrency);
        fields.push('currency = ?');
        values.push(updates.currency ?? null);
      }
    }

    if (amount !== undefined) {
      fields.push('amount = ?');
      values.push(String(amount));
    }

    if (fields.length === 0) {
      return; // Nothing to update
    }

    fields.push('updated_at = ?');
    values.push(new Date().toISOString());
    values.push(id);

    const sql = `UPDATE budget_plan_lines SET ${fields.join(', ')} WHERE id = ?`;

    if (categoryIds === undefined) {
      await executeQuery(sql, values);
      return;
    }

    // Row and links move together, so a failure can't leave the primary column
    // pointing at a category the junction no longer holds.
    await executeTransaction(async (db) => {
      await db.runAsync(sql, values);
      await writeLineCategoriesInTx(db, id, categoryIds);
    });
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
 *
 * Since Budgets v3 phase 3 the expected income is the SUM of the plan's income
 * lines (`kind` === 'income'), not the stored `expected_income` column — that
 * column is bridged into lines by migration 0020 and only survives as a fallback
 * for a plan that has no income line at all. Income lines are, of course, not
 * part of `allocated`.
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
    let incomeTotal = Currency.add('0', '0', currency);
    let hasIncomeLine = false;
    for (const line of lines) {
      if (line.kind === 'income') {
        hasIncomeLine = true;
        incomeTotal = Currency.add(incomeTotal, line.amount, currency);
        continue;
      }
      allocated = Currency.add(allocated, line.amount, currency);
    }

    const expectedIncome = hasIncomeLine ? incomeTotal : Currency.add(plan.expectedIncome, '0', currency);
    const remainder = Currency.subtract(expectedIncome, allocated, currency);

    return { expectedIncome, allocated, remainder };
  } catch (error) {
    console.error('Failed to compute budget plan totals:', error);
    throw error;
  }
};

/**
 * Clone a plan and its still-pending lines from one month into a new month. Used
 * by the editor's "start from last month". Lines already executed in the source
 * month are left behind. Fails if the source month has no plan or the target month
 * already has one.
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

    // Already-executed lines are NOT carried over. getPlanLines only returns the
    // month's own one-off lines (recurring ones hang off plan_id IS NULL), and a
    // one-off that already fired is finished business — cloning it would re-add it
    // as pending (see the last_executed_month note below), inflating the new
    // month's allocation and offering a swipe that duplicates the operation.
    const sourceLines = (await getPlanLines(source.id))
      .filter((line) => !isSet(line.lastExecutedMonth));
    const now = new Date().toISOString();
    const newPlanId = uuid.v4();

    try {
      await executeTransaction(async (db) => {
        await db.runAsync(
          'INSERT INTO budget_plans (id, month, currency, expected_income, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
          [newPlanId, toMonth, source.currency, source.expectedIncome, now, now],
        );

        for (let i = 0; i < sourceLines.length; i++) {
          const line = sourceLines[i];
          const clonedId = uuid.v4();
          // `last_executed_month` is written NULL: every line that reaches here is
          // pending already (see the filter above), and a clone starts the new
          // month pending too, exactly like a recurring line does when the month
          // rolls over.
          await db.runAsync(
            'INSERT INTO budget_plan_lines (id, plan_id, label, amount, comment, category_id, to_account_id, sort_order, is_recurring, currency, kind, account_id, last_executed_month, include_children, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, NULL, ?, ?, ?)',
            [
              clonedId, newPlanId, line.label, line.amount, line.comment,
              line.categoryId, line.toAccountId, line.sortOrder ?? i,
              line.currency, line.kind, line.accountId,
              1, now, now, // include_children: always on, see mapLineFields
            ],
          );
          // The clone must track the same SET of categories, not just the primary
          // one the column carries.
          await writeLineCategoriesInTx(db, clonedId, line.categoryIds || []);
        }
      });
    } catch (txError) {
      // Same double-tap race as createPlan (e.g. handleCopyLast fired twice):
      // both calls pass the getPlanByMonth pre-check above before either
      // commits, then race at the UNIQUE(budget_plans.month) constraint here.
      // executeTransaction serializes actual commits (see app/services/db.js),
      // so by the time the loser's INSERT fails inside its own transaction,
      // the winner's plan (and lines) are already committed and visible — hand
      // that back instead of surfacing a raw constraint error.
      if (isUniqueMonthViolation(txError)) {
        const raced = await getPlanByMonth(toMonth);
        if (raced) return raced;
      }
      throw txError;
    }

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
 * - Category-linked line: expense spending across every category the line tracks
 *   (migration 0021 allows several), always including their descendants, via the
 *   shared convert-all engine
 *   ({@link calculateSpendingForCategories}). With `convertAll` off, only
 *   operations in accounts of `displayCurrency` count.
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

    // Income lines have no per-line actual: the income section compares the
    // month's total real income against the sum of the income lines (an income
    // category, when set, is only context for the row). Reporting a category
    // "spending" figure for one would be meaningless — and summing them would
    // double-count against actualIncome.
    if (line.kind === 'income') {
      return { broken: false, actual: '0', skipped: true };
    }

    const categoryIds = line.categoryIds ?? (isSet(line.categoryId) ? [line.categoryId] : []);
    if (categoryIds.length > 0) {
      const actual = await calculateSpendingForCategories(
        categoryIds,
        displayCurrency,
        startDate,
        endDate,
        true, // descendants always roll up into the categories a line tracks
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
    // A Set, not an array: since migration 0021 each line contributes a whole
    // category set (plus descendants), and plan lines routinely overlap — a
    // parent here, one of its children there. Repeats would only pad the IN list
    // toward SQLite's bound-parameter ceiling without changing the DISTINCT
    // result.
    const categoryIdSet = new Set();
    for (const line of lines) {
      // Income lines track no spending (their category, when set, is an income
      // one) — including them here would query expenses that cannot exist.
      if (line.kind === 'income') continue;
      const linked = line.categoryIds ?? (isSet(line.categoryId) ? [line.categoryId] : []);
      if (linked.length === 0) continue;
      // Same expansion the line's own actual uses, so the currencies collected
      // here are exactly the ones that can feed it — descendants included.
      for (const id of await expandCategoryIds(linked, true)) {
        categoryIdSet.add(id);
      }
    }

    const categoryIds = [...categoryIdSet];
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
    // Expected income is the sum of the plan's income lines (Budgets v3 phase 3);
    // the stored expected_income column is only a fallback for a plan that has
    // none — see the totals assembly below.
    let expectedFromLines = '0';
    let hasIncomeLine = false;

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

      // Income lines feed the expected-income figure instead of the allocation
      // total, and have no per-line actual (see calculateLineActual) — the
      // income section compares actualIncome against their sum as a whole.
      if (line.kind === 'income') {
        hasIncomeLine = true;
        expectedFromLines = Currency.add(expectedFromLines, amount, target);
        lineStatuses.push({
          lineId: line.id,
          broken: false,
          amount,
          actual: '0',
          remaining: amount,
          percentage: 0,
          isExceeded: false,
          status: 'income',
        });
        continue;
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
    const expectedIncome = hasIncomeLine
      ? expectedFromLines
      : Currency.add(plan.expectedIncome ?? '0', '0', target);
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
 * Compute plan-vs-actual statuses for all plans, keyed by plan ID. A single
 * failing plan is logged and skipped so the rest still refresh (same contract as
 * calculateAllBudgetStatuses).
 * @param {boolean} [convertAll=false]
 * @param {?string} [displayCurrency=null] - Currency to express every status in.
 *   Null (the default) keeps each plan in its own stored currency. The Budgets
 *   screen passes the currency it is being read in: its rows convert to that
 *   currency, so its totals have to be computed in it too, or the card prints
 *   converted rows above unconverted totals.
 * @returns {Promise<Map<string, Object>>}
 */
export const calculateAllPlanStatuses = async (convertAll = false, displayCurrency = null) => {
  try {
    const plans = await getAllPlans();
    const statusMap = new Map();
    for (const plan of plans) {
      try {
        const status = await calculatePlanStatus(plan.id, displayCurrency || plan.currency, convertAll);
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
/* Executable templates (Budgets v3 phase 3)                                   */
/* -------------------------------------------------------------------------- */

/**
 * True when a line carries an executable template (an account for the operation
 * to touch). A line without one is a pure analytic target — no execute action.
 * @param {Object} line - Plan line (camelCase, see mapLineFields)
 * @returns {boolean}
 */
export const isExecutable = (line) => !!line && isSet(line.accountId);

/**
 * Mark a line executed for the current month. The line SURVIVES, recurring or
 * not: a one-off line is already scoped to its own month (it hangs off that
 * month's plan via plan_id), and deleting it on execution — as the Planned tab
 * did for a fired one-time operation — silently rewrote the plan the user was
 * measuring against, dropping both its allocation and its actual spending.
 * @param {Object} db - Transaction handle
 * @param {Object} line - Plan line (camelCase)
 * @param {string} month - YYYY-MM
 */
const markLineInTx = async (db, line, month) => {
  await db.runAsync(
    'UPDATE budget_plan_lines SET last_executed_month = ?, updated_at = ? WHERE id = ?',
    [month, new Date().toISOString(), line.id],
  );
};

/**
 * Atomically execute a line's template in a single SQLite transaction: insert the
 * real operation (dated today), adjust account balances, and mark the line
 * executed for the current month.
 *
 * This is the phase-3 home of PlannedOperationsDB.executeAndMark and keeps its
 * guarantee: no partial-failure window where the operation exists but the line
 * still reads as pending (which would invite a silent double-charge).
 *
 * The month is derived here rather than taken from the caller so it can never
 * disagree with the operation's date — executing while browsing another month
 * would otherwise stamp that month while creating a today-dated operation.
 * @param {Object} line - Plan line with a template (camelCase, see mapLineFields)
 * @param {string} [fallbackName] - Name to describe the operation with when the
 *   line carries no label/comment of its own. Resolving the linked category or
 *   account's name needs data this layer does not load, so the caller passes it
 *   in; it must be a real entity name, never a translated UI placeholder.
 * @returns {Promise<Object>} The created operation (snake_case fields)
 */
export const executeLine = async (line, fallbackName = null) => {
  try {
    if (!isExecutable(line)) {
      throw new Error('This allocation has no account to execute from');
    }
    const month = currentMonthKey();
    // `operations.description` is not free text — it is the delimited label list
    // owned by labelUtils. An unsanitized name containing "|" would silently
    // become two labels, and one starting with a system prefix ("Category:", …)
    // would hide the operation from the list AND mark it non-deletable;
    // sanitizeNewLabel handles both (plain sanitizeLabel only handles the former).
    const rawDescription = line.label || line.comment || fallbackName || null;
    const description = rawDescription ? sanitizeNewLabel(rawDescription) || null : null;
    const operationData = {
      type: line.kind || 'expense',
      amount: line.amount,
      accountId: line.accountId,
      categoryId: line.categoryId || null,
      toAccountId: line.toAccountId || null,
      date: formatLocalDate(new Date()),
      description,
    };

    let createdOperation;
    await executeTransaction(async (db) => {
      createdOperation = await createOperationInTx(db, operationData);
      await markLineInTx(db, line, month);
    });
    return createdOperation;
  } catch (error) {
    console.error('Failed to execute plan line:', error);
    throw error;
  }
};

/**
 * Mark a line executed for the current month WITHOUT creating an operation (the
 * user already entered it by hand). Like {@link executeLine}, the line survives.
 * @param {Object} line - Plan line (camelCase)
 * @returns {Promise<void>}
 */
export const markLineExecuted = async (line) => {
  try {
    await executeTransaction(async (db) => {
      await markLineInTx(db, line, currentMonthKey());
    });
  } catch (error) {
    console.error('Failed to mark plan line as executed:', error);
    throw error;
  }
};

/**
 * Clear a line's executed mark (undo). Does not touch any operation that was
 * created by a previous execution — deleting that is the user's call, from the
 * operations list, exactly as it was for planned operations.
 * @param {string} id
 * @returns {Promise<void>}
 */
export const unmarkLineExecuted = async (id) => {
  try {
    await executeQuery(
      'UPDATE budget_plan_lines SET last_executed_month = NULL, updated_at = ? WHERE id = ?',
      [new Date().toISOString(), id],
    );
  } catch (error) {
    console.error('Failed to clear plan line execution mark:', error);
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
 * Whether migration 0021's junction table exists yet, on a raw db handle.
 *
 * The bridges below run in two very different situations. During a fresh
 * migrate() they run right after their own DDL, BEFORE 0021 — the table does not
 * exist, and 0021's backfill will pick their rows up from `category_id` moments
 * later. But a RETRY (a bridge that never completed, re-attempted on a later
 * launch) and BackupRestore's restore-time bridge both run on a schema that is
 * already at 0021, where nothing will backfill for them — there they must write
 * the links themselves, or every bridged line reads as broken and tracks nothing.
 * @param {Object} db - Raw SQLite database instance (or transaction handle)
 * @returns {Promise<boolean>}
 */
const hasLineCategoriesTable = async (db) => {
  const row = await db.getFirstAsync(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='budget_plan_line_categories'",
  ).catch(() => null);
  return !!row;
};

/**
 * Link a bridged line to its single category when the junction table is there.
 * @param {Object} db - Raw SQLite database instance (or transaction handle)
 * @param {boolean} junctionExists - Result of {@link hasLineCategoriesTable}
 * @param {string} lineId
 * @param {string|null} categoryId
 * @returns {Promise<void>}
 */
const linkBridgedLineCategory = async (db, junctionExists, lineId, categoryId) => {
  if (!junctionExists || !isSet(categoryId)) return;
  await db.runAsync(
    'INSERT OR IGNORE INTO budget_plan_line_categories (line_id, category_id) VALUES (?, ?)',
    [lineId, categoryId],
  );
};

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
  const junctionExists = await hasLineCategoriesTable(db);
  let migrated = 0;

  for (const budget of budgetRows || []) {
    const monthlyAmount = convertBudgetAmountToMonthly(budget.amount, budget.period_type, budget.currency);
    const lineId = uuid.v4();
    await db.runAsync(
      'INSERT INTO budget_plan_lines (id, plan_id, label, amount, comment, category_id, to_account_id, sort_order, is_recurring, currency, created_at, updated_at) VALUES (?, NULL, NULL, ?, NULL, ?, NULL, 0, 1, ?, ?, ?)',
      [lineId, monthlyAmount, budget.category_id, budget.currency, now, now],
    );
    await linkBridgedLineCategory(db, junctionExists, lineId, budget.category_id);
    migrated++;
  }

  await db.runAsync(
    "INSERT OR REPLACE INTO app_metadata (key, value, updated_at) VALUES (?, 'true', ?)",
    [BUDGETS_MIGRATION_FLAG_KEY, now],
  );

  return { migrated, skipped: false };
};

/* -------------------------------------------------------------------------- */
/* Planned operations (A) -> plan lines with templates (Budgets v3 phase 3)    */
/* -------------------------------------------------------------------------- */

// Same completion flag migration 0020's postMigration handler writes — see the
// note on BUDGETS_MIGRATION_FLAG_KEY above for why the key shape matters and why
// BackupRestore.js reuses it.
export const PLANNED_MIGRATION_FLAG_KEY = 'post_migration_m0020_completed';

const INSERT_LINE_SQL = 'INSERT INTO budget_plan_lines (id, plan_id, label, amount, comment, category_id, to_account_id, sort_order, is_recurring, currency, kind, account_id, last_executed_month, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)';

/**
 * Plan id for `month`, creating an empty plan when the month has none. Used by
 * the bridge below to give one-time templates (which are month-scoped) somewhere
 * to live. Raw-db flavored so it works inside a migration or a restore.
 */
const ensurePlanForMonthRaw = async (db, month, currency, now) => {
  const existing = await db.getFirstAsync('SELECT id FROM budget_plans WHERE month = ?', [month]).catch(() => null);
  if (existing) return existing.id;
  const id = uuid.v4();
  await db.runAsync(
    "INSERT INTO budget_plans (id, month, currency, expected_income, created_at, updated_at) VALUES (?, ?, ?, '0', ?, ?)",
    [id, month, currency, now, now],
  );
  return id;
};

/**
 * Bridge the standalone `planned_operations` model into `budget_plan_lines` as
 * lines carrying an executable template, and each plan's stored `expected_income`
 * into an income line — the two remaining double entries Budgets v3 set out to
 * remove. Idempotent — a no-op once {@link PLANNED_MIGRATION_FLAG_KEY} is set in
 * `app_metadata`.
 *
 * Mapping:
 *   - recurring template  → recurring line (`plan_id` NULL, applies to every month),
 *   - one-time template   → one-off line on the CURRENT month's plan (created if
 *     the month has none, since a one-off line needs a plan to hang off),
 *   - `name`/`description`→ `label`/`comment`, `type` → `kind`, `account_id` and
 *     `last_executed_month` carry over unchanged, so a template already executed
 *     this month still reads as done afterwards.
 * A line's `currency` is set to its account's currency: an executable template's
 * amount is expressed in the account it is paid from, which need not match the
 * plan's currency (calculatePlanStatus converts it).
 *
 * Expected income is only bridged when there is NO recurring income template —
 * when there is one, the templates ARE the expected income (that is the exact
 * duplication this phase removes), and migrating both would double the figure.
 *
 * Neither `planned_operations` nor `budget_plans.expected_income` is deleted
 * (append-only); they just stop being read.
 *
 * Takes a raw db-like object for the same reason
 * {@link migrateLegacyBudgetsToRecurringLines} does — one implementation serves
 * both migration 0020 and BackupRestore.js's restore-time bridge.
 * @param {Object} db - Raw SQLite database instance (or transaction handle)
 * @returns {Promise<{ migratedTemplates: number, migratedIncome: number, skipped: boolean }>}
 */
export const migratePlannedOperationsToLines = async (db) => {
  const flagRow = await db.getFirstAsync(
    'SELECT value FROM app_metadata WHERE key = ?',
    [PLANNED_MIGRATION_FLAG_KEY],
  ).catch(() => null);
  if (flagRow) {
    return { migratedTemplates: 0, migratedIncome: 0, skipped: true };
  }

  const now = new Date().toISOString();
  const month = currentMonthKey();

  const plans = await db.getAllAsync('SELECT * FROM budget_plans').catch(() => []);
  const accountRows = await db.getAllAsync('SELECT id, currency FROM accounts').catch(() => []);
  const plannedRows = await db.getAllAsync(
    'SELECT * FROM planned_operations ORDER BY display_order ASC, created_at ASC',
  ).catch(() => []);

  const junctionExists = await hasLineCategoriesTable(db);
  const currencyByAccount = new Map((accountRows || []).map(a => [String(a.id), a.currency]));
  const fallbackCurrency = (plans || [])[0]?.currency || (accountRows || [])[0]?.currency || 'USD';

  // Expected income → income lines, unless recurring income templates already
  // express it (see the doc comment above).
  const hasRecurringIncomeTemplate = (plannedRows || []).some(
    op => op.type === 'income' && Number(op.is_recurring) === 1,
  );
  let migratedIncome = 0;
  if (!hasRecurringIncomeTemplate) {
    for (const plan of plans || []) {
      const amount = plan.expected_income;
      if (!Currency.isValid(amount) || Currency.compare(amount, '0') <= 0) continue;
      await db.runAsync(
        INSERT_LINE_SQL,
        [uuid.v4(), plan.id, null, String(amount), null, null, null, 0, 0, null, 'income', null, null, now, now],
      );
      migratedIncome++;
    }
  }

  // Planned operations → lines with templates.
  let currentPlanId = null; // resolved lazily: only one-time templates need a plan
  let migratedTemplates = 0;
  for (let i = 0; i < (plannedRows || []).length; i++) {
    const op = plannedRows[i];
    const kind = LINE_KINDS.includes(op.type) ? op.type : 'expense';
    const lineCurrency = currencyByAccount.get(String(op.account_id)) || fallbackCurrency;
    const isRecurring = Number(op.is_recurring) === 1;

    let planId = null;
    if (!isRecurring) {
      if (!currentPlanId) {
        currentPlanId = await ensurePlanForMonthRaw(db, month, fallbackCurrency, now);
      }
      planId = currentPlanId;
    }

    const lineId = uuid.v4();
    const lineCategoryId = kind === 'transfer' ? null : (op.category_id ?? null);
    await db.runAsync(
      INSERT_LINE_SQL,
      [
        lineId,
        planId,
        op.name ?? null,
        String(op.amount ?? '0'),
        op.description ?? null,
        lineCategoryId,
        op.to_account_id ?? null,
        Number.isInteger(op.display_order) ? op.display_order : i,
        isRecurring ? 1 : 0,
        lineCurrency,
        kind,
        op.account_id ?? null,
        op.last_executed_month ?? null,
        now,
        now,
      ],
    );
    await linkBridgedLineCategory(db, junctionExists, lineId, lineCategoryId);
    migratedTemplates++;
  }

  await db.runAsync(
    "INSERT OR REPLACE INTO app_metadata (key, value, updated_at) VALUES (?, 'true', ?)",
    [PLANNED_MIGRATION_FLAG_KEY, now],
  );

  return { migratedTemplates, migratedIncome, skipped: false };
};
