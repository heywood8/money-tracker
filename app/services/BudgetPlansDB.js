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
import { calculateSpendingForFilters, expandCategoryIds, deriveSpendingStatus } from './BudgetsDB';
import { formatDate as formatLocalDate } from './BalanceHistoryDB';
import {
  fetchRatesToTarget,
  convertWithRateMap,
  getTransferTotals,
  getUnconvertibleCurrencies,
} from './OperationsDB';

// YYYY-MM with a real 01–12 month.
const MONTH_REGEX = /^\d{4}-(0[1-9]|1[0-2])$/;

// What a line budgets. A line with no stored `kind` (every pre-0020 row) has its
// effective kind inferred from its tracking target — see {@link mapLineFields}.
const LINE_KINDS = ['income', 'expense', 'transfer'];

/**
 * Every line SELECT goes through this, so the category set (migration 0021's
 * budget_plan_line_categories) and the source-account filter (migration 0024's
 * budget_plan_line_accounts) always travel with the row instead of costing two
 * follow-up queries per line. GROUP_CONCAT joins with ','; category IDs are
 * UUIDs and account IDs are integers, so splitting back is unambiguous for both.
 *
 * Deliberately plain correlated SCALAR subqueries: SQLite has no LATERAL, so a
 * derived table in FROM cannot reference `l.id` — the tidier
 * `GROUP_CONCAT(...) FROM (SELECT ... ORDER BY ...)` spelling that would pin the
 * concat order fails outright with `no such column: l.id`. The sets' order is
 * not meaningful anyway (the UI sorts by name), and the line's PRIMARY category
 * comes from its own `category_id` column, not from this list's head.
 *
 * Callers append their own WHERE/ORDER BY against the `l` alias.
 */
const LINE_SELECT = `SELECT l.*, (
      SELECT GROUP_CONCAT(lc.category_id)
      FROM budget_plan_line_categories lc
      WHERE lc.line_id = l.id
    ) AS category_ids, (
      SELECT GROUP_CONCAT(la.account_id)
      FROM budget_plan_line_accounts la
      WHERE la.line_id = l.id
    ) AS source_account_ids
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
 * `kind` was added in migration 0020 (phase 3) and says what the line budgets:
 * income, expense or transfer. It is NULL on legacy rows, so the mapped value
 * falls back to the kind implied by the target (transfer target → 'transfer',
 * otherwise 'expense') — every consumer can then read `line.kind`
 * unconditionally.
 *
 * That same migration also brought `account_id` / `last_executed_month`, the
 * executable-template columns the former Planned tab used to run a line as a
 * one-tap operation. Operations are captured automatically from bank
 * notifications now, so nothing executes a budget line any more: the two columns
 * stay in the schema (append-only, still round-tripped by backups and the Sheets
 * export) but are neither read nor written by the app.
 *
 * `sourceAccountIds` (migration 0024) is the line's SOURCE ACCOUNT filter — the
 * accounts an expense must have been paid from to count. Empty (the default, and
 * what every pre-0024 line has) means "any account", so it changes nothing for
 * an existing line. It combines with the category set by logical AND, which is
 * also why it participates in `isBroken`: an account-only line tracks something
 * real, and a line whose last account AND last category are gone tracks nothing.
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
  const sourceAccountIds = readSourceAccountIds(row);
  const primary = row.category_id ?? null;
  // The junction wins: when the row's denormalized primary category has been
  // deleted (its FK nulled, or it simply is not linked any more) but other
  // categories remain, the line still tracks those — reporting `categoryId: null`
  // would render it as broken while its actual keeps counting spending.
  const categoryId = primary !== null && categoryIds.includes(primary)
    ? primary
    : (categoryIds[0] ?? null);
  const toAccountId = row.to_account_id ?? null;
  const kind = LINE_KINDS.includes(row.kind) ? row.kind : (toAccountId !== null ? 'transfer' : 'expense');
  return {
    id: row.id,
    planId: row.plan_id ?? null,
    label: row.label ?? null,
    amount: row.amount,
    comment: row.comment ?? null,
    categoryId,
    categoryIds,
    // The source-account filter (migration 0024). Empty = any account.
    sourceAccountIds,
    // NOTE: `include_children` is deliberately NOT surfaced. Descendant spending
    // always rolls up now — picking a parent category means its subtree, and a
    // leaf category has no subtree, so the flag never expressed a real choice.
    // The column stays (append-only, still round-tripped by backups/Sheets) but
    // a stored 0 no longer changes how a line counts.
    toAccountId,
    sortOrder: row.sort_order ?? 0,
    // The envelope this line belongs to (migration 0022), or null when it stands
    // on its own. An income line is never grouped — groups sit in the allocations
    // section and aggregate spending, which income lines have none of.
    groupId: kind === 'income' ? null : (row.group_id ?? null),
    isBroken: kind !== 'income'
      && categoryIds.length === 0
      && sourceAccountIds.length === 0
      && toAccountId === null,
    isRecurring: row.is_recurring === 1,
    currency: row.currency ?? null,
    kind,
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
 * De-duplicated list of set account IDs, normalized to numbers and order
 * preserved. `accounts.id` is an integer autoincrement, so a filter read back
 * from GROUP_CONCAT (which yields strings) must come out as numbers or a UI
 * comparing it against `account.id` would find no match at all.
 * @param {Array|null|undefined} ids
 * @returns {Array<number>}
 */
const uniqueAccountIds = (ids) => {
  const out = [];
  for (const id of ids || []) {
    if (!isSet(id)) continue;
    const numeric = Number(id);
    if (!Number.isFinite(numeric) || out.includes(numeric)) continue;
    out.push(numeric);
  }
  return out;
};

/**
 * Parse the `source_account_ids` GROUP_CONCAT column produced by
 * {@link LINE_SELECT} (migration 0024). A row selected without it (an insert's
 * in-memory row, a hand-built test row, a legacy `SELECT *`) has no filter at
 * all — which is "any account", the pre-0024 behaviour — so it reads as empty.
 * @param {Object} row - Raw budget_plan_lines row
 * @returns {Array<number>}
 */
const readSourceAccountIds = (row) => {
  const raw = row.source_account_ids;
  if (Array.isArray(raw)) return uniqueAccountIds(raw);
  return typeof raw === 'string' && raw.length > 0
    ? uniqueAccountIds(raw.split(','))
    : [];
};

/**
 * The source-account filter a caller means (migration 0024). Returns `undefined`
 * when the caller did not mention `sourceAccountIds` at all — which for an update
 * means "leave the filter alone", as distinct from `[]` ("count any account").
 * @param {Object} line
 * @returns {Array<number>|undefined}
 */
const resolveSourceAccountIds = (line) => {
  if (Array.isArray(line?.sourceAccountIds)) return uniqueAccountIds(line.sourceAccountIds);
  return undefined;
};

/**
 * Rewrite a line's source-account links inside an open transaction: drop what's
 * there, insert the new set. The account-side twin of
 * {@link writeLineCategoriesInTx}.
 * @param {Object} db - Transaction-scoped database handle
 * @param {string} lineId
 * @param {Array<number>} accountIds
 * @returns {Promise<void>}
 */
const writeLineAccountsInTx = async (db, lineId, accountIds) => {
  await db.runAsync('DELETE FROM budget_plan_line_accounts WHERE line_id = ?', [lineId]);
  for (const accountId of accountIds) {
    await db.runAsync(
      'INSERT OR IGNORE INTO budget_plan_line_accounts (line_id, account_id) VALUES (?, ?)',
      [lineId, accountId],
    );
  }
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
 *
 * The SOURCE-ACCOUNT filter (migration 0024) is NOT a third kind of target and is
 * not part of the exclusivity rule: it narrows which expenses count, and combines
 * with the category set by AND. It does, however, satisfy the "track something"
 * requirement on its own — "everything I spend on this card" is a complete
 * budget. It is meaningless on a transfer line (which tracks incoming transfers,
 * not expenses), so it is rejected there rather than silently ignored.
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
  const hasSourceAccounts = (resolveSourceAccountIds(line) || []).length > 0;
  if (line.kind === 'income') {
    if (hasAccount) {
      return 'An income line cannot link to a transfer target';
    }
    if (hasSourceAccounts) {
      return 'An income line cannot filter by spending account';
    }
    return null;
  }
  if (hasCategory && hasAccount) {
    return 'A line must link to either a category or an account, not both';
  }
  if (hasAccount && hasSourceAccounts) {
    return 'A transfer line cannot filter by spending account';
  }
  if (!hasCategory && !hasAccount && !hasSourceAccounts) {
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
    // for re-linking. Migration 0024 adds the same requirement on the account
    // side: a line left with only a source-account filter still tracks real
    // spending ("everything on this card"), so it is not broken either.
    const rows = await queryAll(
      `${LINE_SELECT} WHERE l.plan_id = ?
         AND NOT EXISTS (SELECT 1 FROM budget_plan_line_categories lc WHERE lc.line_id = l.id)
         AND NOT EXISTS (SELECT 1 FROM budget_plan_line_accounts la WHERE la.line_id = l.id)
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
 *   sortOrder?, kind? }
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
    // A transfer line tracks incoming transfers and an income line tracks nothing
    // per-line, so neither has expenses for a source-account filter to narrow —
    // validatePlanLine has already rejected a caller that asked for one.
    const sourceAccountIds = line.kind === 'transfer' || line.kind === 'income'
      ? []
      : (resolveSourceAccountIds(line) || []);
    const row = {
      id: line.id || uuid.v4(),
      plan_id: planId,
      label: line.label ?? null,
      amount: String(line.amount),
      comment: line.comment ?? null,
      // Primary = first of the set; the full set lives in the junction below.
      category_id: categoryIds[0] ?? null,
      category_ids: categoryIds,
      source_account_ids: sourceAccountIds,
      to_account_id: isSet(line.toAccountId) ? line.toAccountId : null,
      sort_order: Number.isInteger(line.sortOrder) ? line.sortOrder : 0,
      is_recurring: isRecurring ? 1 : 0,
      // A one-off line may carry its own currency too (it just falls back to the
      // plan's when null): a budget priced in a foreign account's currency need
      // not match the plan's.
      currency: line.currency ?? null,
      kind: LINE_KINDS.includes(line.kind) ? line.kind : null,
      // Always 1: descendant spending always rolls up (see mapLineFields). The
      // column is kept written so the backup/Sheets shape stays stable.
      include_children: 1,
      // An income line is never grouped (see mapLineFields), so the column is
      // written NULL for one however the caller asked.
      group_id: (line.kind !== 'income' && isSet(line.groupId)) ? line.groupId : null,
      created_at: now,
      updated_at: now,
    };

    // The row and its category/account links go in together: a line that
    // committed without its links would read as broken (empty sets, no transfer
    // target) and silently stop tracking anything — or worse, an account-filtered
    // line that lost only its accounts would quietly count the WHOLE category.
    await executeTransaction(async (db) => {
      await db.runAsync(
        'INSERT INTO budget_plan_lines (id, plan_id, label, amount, comment, category_id, to_account_id, sort_order, is_recurring, currency, kind, include_children, group_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [
          row.id, row.plan_id, row.label, row.amount, row.comment, row.category_id,
          row.to_account_id, row.sort_order, row.is_recurring, row.currency,
          row.kind, row.include_children,
          row.group_id, row.created_at, row.updated_at,
        ],
      );
      await writeLineCategoriesInTx(db, row.id, categoryIds);
      await writeLineAccountsInTx(db, row.id, sourceAccountIds);
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
 * The SOURCE-ACCOUNT filter (migration 0024) follows the same partial-update
 * rules as the category set: `sourceAccountIds` omitted leaves the filter alone,
 * `[]` clears it back to "any account". It is not part of the target exclusivity
 * rule (it narrows expenses rather than naming a target), but assigning a
 * transfer target does clear it — a transfer line tracks incoming transfers, and
 * an inherited expense filter on one would silently mean nothing.
 * @param {string} id
 * @param {Object} updates - Partial { label, amount, comment, categoryId, categoryIds,
 *   sourceAccountIds, toAccountId, sortOrder, isRecurring, currency, planId }
 * @returns {Promise<void>}
 */
export const updateLine = async (id, updates) => {
  try {
    // `categoryIds` (the whole set) or the legacy single `categoryId`; undefined
    // when the caller mentioned neither, which leaves the existing links alone.
    const requestedCategoryIds = resolveCategoryIds(updates);
    const requestedSourceAccountIds = resolveSourceAccountIds(updates);

    // Reject setting both targets in a single update outright.
    if ((requestedCategoryIds || []).length > 0 && isSet(updates.toAccountId)) {
      throw new Error('A line must link to either a category or an account, not both');
    }
    // ...and asking for a source-account filter on a line this same update makes
    // a transfer or an income line. Rejected rather than quietly dropped, so a
    // caller that asks for two incompatible things hears about it — the silent
    // clear below is only for a filter the caller did NOT mention.
    if ((requestedSourceAccountIds || []).length > 0
      && (isSet(updates.toAccountId) || updates.kind === 'transfer' || updates.kind === 'income')) {
      throw new Error(updates.kind === 'income'
        ? 'An income line cannot filter by spending account'
        : 'A transfer line cannot filter by spending account');
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
    let sourceAccountIds = requestedSourceAccountIds;
    if ((categoryIds || []).length > 0) {
      toAccountId = null;
    } else if (isSet(updates.toAccountId)) {
      categoryIds = [];
    }
    // Becoming a transfer or an income line drops whatever filter the row still
    // holds, for the same reason `group_id` is dropped when a line becomes income
    // below: the line no longer has expenses of its own to narrow, and a stale
    // filter would sit in the editor as a setting that changes nothing. (A filter
    // the caller ASKED for alongside such a change was rejected above.)
    if (isSet(updates.toAccountId) || updates.kind === 'transfer' || updates.kind === 'income') {
      sourceAccountIds = [];
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
    if (updates.kind !== undefined) {
      if (updates.kind !== null && !LINE_KINDS.includes(updates.kind)) {
        throw new Error('A line must be an income, expense or transfer');
      }
      fields.push('kind = ?');
      values.push(updates.kind ?? null);
    }
    // Group membership (migration 0022). Turning a line into an income line drops
    // it out of its group even when the caller said nothing about groups: income
    // lines are not part of the allocations the groups aggregate (see
    // mapLineFields), and a stale group_id there would make the group's derived
    // total count a figure its own children's sum cannot explain.
    if (updates.groupId !== undefined || updates.kind === 'income') {
      fields.push('group_id = ?');
      values.push(
        updates.kind === 'income' || !isSet(updates.groupId) ? null : updates.groupId,
      );
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
          // A one-off line may keep a currency of its own since migration 0020,
          // and forcing it to the plan's here would convert the amount away from
          // the currency the user priced it in. Without one it inherits the
          // target plan's currency (the pre-0020 behaviour).
          const toCurrency = updates.currency || await getPlanCurrencyOrThrow(updates.planId);
          amount = await convertLineAmount(rawAmount, fromCurrency, toCurrency);
          fields.push('is_recurring = ?', 'plan_id = ?', 'currency = ?');
          values.push(0, updates.planId, updates.currency ?? null);
        }
      } else {
        // Direct currency edit, no scope change. Since migration 0020 a one-off
        // line may carry its own currency too, so this is no longer
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

    // "No columns changed" is not the same as "nothing to do": the source-account
    // filter (migration 0024) lives entirely in a junction and pushes no column of
    // its own, so an update that only narrows a line to one card would otherwise
    // return here and silently discard the change. The category set happens to be
    // safe (it also writes the denormalized `category_id` column) but is checked
    // alongside so the two cannot diverge on the next change.
    if (fields.length === 0 && categoryIds === undefined && sourceAccountIds === undefined) {
      return; // Nothing to update
    }

    fields.push('updated_at = ?');
    values.push(new Date().toISOString());
    values.push(id);

    const sql = `UPDATE budget_plan_lines SET ${fields.join(', ')} WHERE id = ?`;

    if (categoryIds === undefined && sourceAccountIds === undefined) {
      await executeQuery(sql, values);
      return;
    }

    // Row and links move together, so a failure can't leave the primary column
    // pointing at a category the junction no longer holds, nor a line counting a
    // category it was just told to narrow to one account.
    await executeTransaction(async (db) => {
      await db.runAsync(sql, values);
      if (categoryIds !== undefined) {
        await writeLineCategoriesInTx(db, id, categoryIds);
      }
      if (sourceAccountIds !== undefined) {
        await writeLineAccountsInTx(db, id, sourceAccountIds);
      }
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
/* Groups (migration 0022)                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Map a budget_plan_line_groups row to camelCase. `isDerived` is the computed
 * "this group has no override" flag every consumer keys off — a null `amount`
 * means the group's budget is the sum of its lines, recomputed as they change.
 * @param {Object|null} row
 * @returns {Object|null}
 */
export const mapGroupFields = (row) => {
  if (!row) return null;
  const amount = isSet(row.amount) ? String(row.amount) : null;
  return {
    id: row.id,
    label: row.label,
    amount,
    // Only meaningful alongside an override amount; a derived group's total is
    // expressed in whatever currency the screen is being read in.
    currency: amount === null ? null : (row.currency ?? null),
    sortOrder: row.sort_order ?? 0,
    isDerived: amount === null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
};

/**
 * Validate a group. An override amount must be a positive number AND name its
 * currency — a bare number would be read in whichever currency the screen
 * happened to be showing when it was typed.
 * @param {Object} group
 * @returns {string|null} Error message or null if valid.
 */
export const validateLineGroup = (group) => {
  if (!group || !isSet(group.label) || !String(group.label).trim()) {
    return 'A group name is required';
  }
  if (isSet(group.amount)) {
    if (!Currency.isValid(group.amount) || Currency.compare(group.amount, '0') <= 0) {
      return 'Amount must be greater than zero';
    }
    if (!isSet(group.currency)) {
      return 'Currency is required for a custom group budget';
    }
  }
  return null;
};

/**
 * Create a group.
 * @param {Object} group - { id?, label, amount?, currency?, sortOrder? }
 * @returns {Promise<Object>} The created group (camelCase).
 */
export const createLineGroup = async (group) => {
  try {
    const validationError = validateLineGroup(group);
    if (validationError) {
      throw new Error(validationError);
    }
    const now = new Date().toISOString();
    const hasAmount = isSet(group.amount);
    const row = {
      id: group.id || uuid.v4(),
      // Trimmed, NOT sanitizeNewLabel'd: that strips the system-label prefixes
      // that mark a protected imported operation, and a group's name never
      // becomes an operation description — running it through would silently
      // empty a group a user legitimately called "Category: fun".
      label: String(group.label).trim(),
      amount: hasAmount ? String(group.amount) : null,
      // Currency is stored only with an override; a derived group carrying one
      // would suggest its computed total is fixed to that currency, which it is not.
      currency: hasAmount ? group.currency : null,
      sort_order: Number.isInteger(group.sortOrder) ? group.sortOrder : 0,
      created_at: now,
      updated_at: now,
    };
    await executeQuery(
      'INSERT INTO budget_plan_line_groups (id, label, amount, currency, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [row.id, row.label, row.amount, row.currency, row.sort_order, row.created_at, row.updated_at],
    );
    return mapGroupFields(row);
  } catch (error) {
    console.error('Failed to create budget line group:', error);
    throw error;
  }
};

/**
 * Every group, in display order. Groups are global (not month-scoped), so this is
 * the whole list — the UI shows the ones that have a line in the month it renders.
 * @returns {Promise<Array>}
 */
export const getLineGroups = async () => {
  try {
    const rows = await queryAll(
      'SELECT * FROM budget_plan_line_groups ORDER BY sort_order ASC, created_at ASC',
    );
    return (rows || []).map(mapGroupFields);
  } catch (error) {
    console.error('Failed to get budget line groups:', error);
    throw error;
  }
};

/**
 * A single group by ID.
 * @param {string} id
 * @returns {Promise<Object|null>}
 */
export const getLineGroupById = async (id) => {
  try {
    const row = await queryFirst('SELECT * FROM budget_plan_line_groups WHERE id = ?', [id]);
    return mapGroupFields(row);
  } catch (error) {
    console.error('Failed to get budget line group:', error);
    throw error;
  }
};

/**
 * Update a group. Partial updates.
 *
 * Passing `amount: null` clears the override and returns the group to a DERIVED
 * total — and clears the stored currency with it, so a later override cannot
 * inherit a currency the user last picked months ago. Passing an amount requires
 * a currency (either in this call or already stored), for the reason
 * {@link validateLineGroup} gives.
 * @param {string} id
 * @param {Object} updates - Partial { label, amount, currency, sortOrder }
 * @returns {Promise<void>}
 */
export const updateLineGroup = async (id, updates) => {
  try {
    const fields = [];
    const values = [];

    if (updates.label !== undefined) {
      if (!isSet(updates.label) || !String(updates.label).trim()) {
        throw new Error('A group name is required');
      }
      fields.push('label = ?');
      values.push(String(updates.label).trim());
    }

    if (updates.amount !== undefined) {
      if (isSet(updates.amount)) {
        if (!Currency.isValid(updates.amount) || Currency.compare(updates.amount, '0') <= 0) {
          throw new Error('Amount must be greater than zero');
        }
        // The currency may come with this update or already be on the row; one of
        // the two must hold, or the stored number means nothing.
        let currency = updates.currency;
        if (!isSet(currency)) {
          const existing = await queryFirst('SELECT currency FROM budget_plan_line_groups WHERE id = ?', [id]);
          currency = existing?.currency;
        }
        if (!isSet(currency)) {
          throw new Error('Currency is required for a custom group budget');
        }
        fields.push('amount = ?', 'currency = ?');
        values.push(String(updates.amount), currency);
      } else {
        // Back to a derived total: the currency goes with the amount it described.
        fields.push('amount = ?', 'currency = ?');
        values.push(null, null);
      }
    } else if (updates.currency !== undefined) {
      // A currency edit on its own only makes sense for a group that HAS an
      // override; for a derived one there is no amount for it to describe.
      const existing = await queryFirst('SELECT amount FROM budget_plan_line_groups WHERE id = ?', [id]);
      if (isSet(existing?.amount)) {
        if (!isSet(updates.currency)) {
          throw new Error('Currency is required for a custom group budget');
        }
        fields.push('currency = ?');
        values.push(updates.currency);
      }
    }

    if (updates.sortOrder !== undefined) {
      fields.push('sort_order = ?');
      values.push(Number.isInteger(updates.sortOrder) ? updates.sortOrder : 0);
    }

    if (fields.length === 0) {
      return; // Nothing to update
    }

    fields.push('updated_at = ?');
    values.push(new Date().toISOString());
    values.push(id);

    await executeQuery(
      `UPDATE budget_plan_line_groups SET ${fields.join(', ')} WHERE id = ?`,
      values,
    );
  } catch (error) {
    console.error('Failed to update budget line group:', error);
    throw error;
  }
};

/**
 * Delete a group. Its lines are UNGROUPED, not deleted (group_id is ON DELETE SET
 * NULL) — the budgets inside an envelope outlive the envelope.
 * @param {string} id
 * @returns {Promise<void>}
 */
export const deleteLineGroup = async (id) => {
  try {
    await executeQuery('DELETE FROM budget_plan_line_groups WHERE id = ?', [id]);
  } catch (error) {
    console.error('Failed to delete budget line group:', error);
    throw error;
  }
};

/**
 * Persist a new group order. `orderedIds` is the full list of group IDs in the
 * desired order; each group's sort_order is set to its index.
 * @param {Array<string>} orderedIds
 * @returns {Promise<void>}
 */
export const reorderLineGroups = async (orderedIds) => {
  try {
    const seen = new Set();
    for (const id of orderedIds) {
      if (!id) {
        throw new Error('Invalid group data: missing id');
      }
      if (seen.has(id)) {
        throw new Error(`Duplicate group ID in reorder: ${id}`);
      }
      seen.add(id);
    }
    const now = new Date().toISOString();
    await executeTransaction(async (db) => {
      for (let i = 0; i < orderedIds.length; i++) {
        await db.runAsync(
          'UPDATE budget_plan_line_groups SET sort_order = ?, updated_at = ? WHERE id = ?',
          [i, now, orderedIds[i]],
        );
      }
    });
  } catch (error) {
    console.error('Failed to reorder budget line groups:', error);
    throw error;
  }
};

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
 *
 * A raw same-currency sum of THIS plan's own lines: it counts no recurring line
 * (those hang off no plan) and applies no group override (migration 0022). The
 * screen's figures come from {@link calculatePlanStatus}, which does both.
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
 * Clone a plan and its lines from one month into a new month. Used by the
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

    // getPlanLines only returns the month's own one-off lines — recurring ones
    // hang off plan_id IS NULL and already apply to every month, so cloning them
    // here would double them.
    const sourceLines = await getPlanLines(source.id);
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
          await db.runAsync(
            'INSERT INTO budget_plan_lines (id, plan_id, label, amount, comment, category_id, to_account_id, sort_order, is_recurring, currency, kind, include_children, group_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?)',
            [
              clonedId, newPlanId, line.label, line.amount, line.comment,
              line.categoryId, line.toAccountId, line.sortOrder ?? i,
              line.currency, line.kind,
              1, // include_children: always on, see mapLineFields
              // Groups are global, so the clone joins the very same envelope its
              // source belongs to — copying a month must not scatter its groups.
              line.groupId ?? null,
              now, now,
            ],
          );
          // The clone must track the same SET of categories, not just the primary
          // one the column carries — and the same source-account filter, or a
          // "card only" budget would silently widen to every account next month.
          await writeLineCategoriesInTx(db, clonedId, line.categoryIds || []);
          await writeLineAccountsInTx(db, clonedId, line.sourceAccountIds || []);
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
 * - Category- and/or account-filtered line: expense spending matching BOTH
 *   filters (migration 0021 allows several categories, 0024 several source
 *   accounts), always including category descendants, via the shared convert-all
 *   engine ({@link calculateSpendingForFilters}). An empty category set means
 *   "any category", an empty account set "any account", so a line may be
 *   "Groceries, anywhere", "anything on this card", or the intersection of the
 *   two. With `convertAll` off, only operations in accounts of `displayCurrency`
 *   count.
 * - Account-linked line (transfer target): incoming transfers into the account
 *   ({@link getTransferTotals}; values are in the destination account's currency),
 *   converted into `displayCurrency` regardless of the toggle — a transfer target
 *   in another currency is still part of the plan.
 * - Broken line (every target and filter deleted): `{ broken: true }`.
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
    const sourceAccountIds = line.sourceAccountIds ?? [];
    // Either filter alone is a complete budget, and together they intersect —
    // which is why this is one branch rather than a category branch that an
    // account filter is bolted onto.
    if (categoryIds.length > 0 || sourceAccountIds.length > 0) {
      const actual = await calculateSpendingForFilters({
        categoryIds,
        accountIds: sourceAccountIds,
        currency: displayCurrency,
        startDate,
        endDate,
        includeChildren: true, // descendants always roll up into the categories a line tracks
        convertAll,
      });
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
 * currencies of the linked categories (incl. descendants) and source accounts,
 * and income currencies, when `convertAll` is on, plus the destination
 * currencies of transfer lines (those convert regardless of the toggle). Used to
 * compute the unconvertible-currency warning without changing how the sums drop
 * them.
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
    // Lines carrying a source-account filter (migration 0024) cannot join that
    // aggregate: their currencies are those of the operations matching BOTH
    // filters, and folding their categories into the shared set would flag a
    // currency the line itself can never contribute. They are asked separately,
    // one query each — the aggregate above still covers the common, unfiltered
    // case in a single query.
    const filteredLines = [];
    for (const line of lines) {
      // Income lines track no spending (their category, when set, is an income
      // one) — including them here would query expenses that cannot exist.
      if (line.kind === 'income') continue;
      const linked = line.categoryIds ?? (isSet(line.categoryId) ? [line.categoryId] : []);
      const sourceAccounts = line.sourceAccountIds ?? [];
      if (sourceAccounts.length > 0) {
        filteredLines.push({ categoryIds: linked, accountIds: sourceAccounts });
        continue;
      }
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

    for (const filtered of filteredLines) {
      const conditions = [];
      const params = [];
      if (filtered.categoryIds.length > 0) {
        const expanded = await expandCategoryIds(filtered.categoryIds, true);
        // Every tracked category was deleted; only the account filter is left, so
        // an `IN ()` here would be both a syntax error and the wrong question.
        if (expanded.length > 0) {
          conditions.push(`o.category_id IN (${expanded.map(() => '?').join(',')})`);
          params.push(...expanded);
        }
      }
      conditions.push(`o.account_id IN (${filtered.accountIds.map(() => '?').join(',')})`);
      params.push(...filtered.accountIds);
      const rows = await queryAll(
        `SELECT DISTINCT a.currency as currency
         FROM operations o
         JOIN accounts a ON o.account_id = a.id
         WHERE ${conditions.join(' AND ')}
           AND o.type = 'expense'
           AND o.date >= ?
           AND o.date <= ?`,
        [...params, startDate, endDate],
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
 *   groups: Array<{ groupId, amount, childAmount, actual, remaining, percentage, isExceeded,
 *     status, overrideApplied, lineCount }> — one per group with at least one line in
 *     this month (migration 0022). `amount` is the group's override when it has one
 *     (and it is convertible), else its children's sum; `overrideApplied` says which.
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
    const [oneOffLines, recurringLines, allGroups] = await Promise.all([
      getPlanLines(planId), getRecurringLines(), getLineGroups(),
    ]);
    const lines = [...recurringLines, ...oneOffLines];
    const { startDate, endDate } = getMonthDateRange(plan.month);

    const groupsById = new Map(allGroups.map(g => [g.id, g]));
    // What each group's own children contribute, accumulated as the lines are
    // walked below. Only lines that actually reached `allocated` are counted, so
    // a derived group's total can never claim a figure the month's own does not hold.
    const groupTallies = new Map();
    const tallyFor = (groupId) => {
      let tally = groupTallies.get(groupId);
      if (!tally) {
        tally = { childAmount: '0', actual: '0', lineCount: 0 };
        groupTallies.set(groupId, tally);
      }
      return tally;
    };

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
    // Group override amounts carry their own currency too (a group is global, so
    // it has no plan to inherit one from) — collected here so they share the one
    // lookup rather than adding a round trip per group.
    const distinctLineCurrencies = [...new Set(
      [
        ...lines.map(line => line.currency || target),
        ...allGroups.map(group => group.currency || target),
      ].filter(c => c !== target),
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
      // A line only counts toward its group once its amount is known in the
      // target currency — which is exactly the point it counts toward `allocated`.
      const groupTally = isSet(line.groupId) && groupsById.has(line.groupId)
        ? tallyFor(line.groupId)
        : null;
      if (groupTally) {
        groupTally.childAmount = Currency.add(groupTally.childAmount, amount, target);
        groupTally.lineCount += 1;
      }
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
      if (groupTally) {
        groupTally.actual = Currency.add(groupTally.actual, actual, target);
      }
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

    // Group statuses, and the correction an OVERRIDE group makes to `allocated`.
    //
    // A derived group (the default) is pure presentation: its target is the sum
    // of the very lines already counted, so the month's total is untouched. An
    // override is the opposite — the user said the envelope is worth X whatever
    // its parts add up to, so X REPLACES the children's sum in `allocated`
    // (otherwise the number in the group's own row would disagree with the total
    // printed under it, and the override would be decorative).
    //
    // Only groups with at least one line in this month appear: a group whose
    // members are all one-off lines of another month is not part of this one.
    const groupStatuses = [];
    for (const group of allGroups) {
      const tally = groupTallies.get(group.id);
      if (!tally || tally.lineCount === 0) continue;

      let amount = tally.childAmount;
      let overrideApplied = false;
      let unconvertibleOverride = false;
      if (!group.isDerived) {
        const groupCurrency = group.currency || target;
        const converted = groupCurrency === target
          ? group.amount
          : convertWithRateMap(group.amount, groupCurrency, target, lineRateByCurrency);
        if (converted === null) {
          // No rate for the override's currency. Falling back to the derived sum
          // keeps the row and the totals in one currency and honest about it;
          // the currency is flagged through the same unconvertible plumbing a
          // line uses.
          transferCurrencies.add(groupCurrency);
          unconvertibleOverride = true;
        } else {
          amount = converted;
          overrideApplied = true;
          allocated = Currency.add(
            Currency.subtract(allocated, tally.childAmount, target),
            amount,
            target,
          );
        }
      }

      const { isExceeded, percentage, status } = deriveSpendingStatus(tally.actual, amount);
      groupStatuses.push({
        groupId: group.id,
        amount,
        childAmount: tally.childAmount,
        actual: tally.actual,
        remaining: Currency.subtract(amount, tally.actual, target),
        percentage,
        isExceeded,
        status: unconvertibleOverride ? 'unconvertible' : status,
        // True when the printed target is the group's own figure rather than its
        // children's sum — the row says so, since the two disagreeing is the
        // whole point of an override.
        overrideApplied,
        lineCount: tally.lineCount,
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
      groups: groupStatuses,
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
 * Bridge the standalone `planned_operations` model into `budget_plan_lines`, and
 * each plan's stored `expected_income` into an income line — the two remaining
 * double entries Budgets v3 set out to remove. Idempotent — a no-op once {@link PLANNED_MIGRATION_FLAG_KEY} is set in
 * `app_metadata`.
 *
 * Mapping:
 *   - recurring template  → recurring line (`plan_id` NULL, applies to every month),
 *   - one-time template   → one-off line on the CURRENT month's plan (created if
 *     the month has none, since a one-off line needs a plan to hang off),
 *   - `name`/`description`→ `label`/`comment`, `type` → `kind`. `account_id` and
 *     `last_executed_month` carry over unchanged into the columns of the same
 *     name — legacy since the executable-template feature was retired, but the
 *     migration preserves rather than discards what a template recorded.
 * A line's `currency` is set to its account's currency: a planned operation's
 * amount was expressed in the account it was paid from, which need not match the
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
