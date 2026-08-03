import { sqliteTable, text, integer, index, unique, primaryKey } from 'drizzle-orm/sqlite-core';

/**
 * App metadata table for tracking database version and migration status
 */
export const appMetadata = sqliteTable('app_metadata', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: text('updated_at').notNull(),
});

/**
 * Accounts table
 */
export const accounts = sqliteTable('accounts', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  balance: text('balance').notNull().default('0'),
  currency: text('currency').notNull().default('USD'),
  displayOrder: integer('display_order'),
  // Surfaced in the UI as "archived". The column keeps its original `hidden`
  // name so existing databases, backups and Sheets exports need no migration.
  hidden: integer('hidden').default(0),
  monthlyTarget: text('monthly_target'),
  // Masked card number (e.g. "4083***7027") used to bind incoming bank
  // notifications to this account. Nullable — only set for accounts that
  // receive transaction notifications.
  cardMask: text('card_mask'),
  // Rounding step for operations created automatically from bank notifications
  // (10, 100, or 1000). When set, an auto-created amount is rounded to the
  // nearest multiple (ties up). Nullable / 0 means no rounding.
  autoTxnRounding: integer('auto_txn_rounding'),
  // How the rounding step above is applied: 'nearest' (round to the nearest
  // multiple, ties up — the default), 'up' (always up to the next multiple), or
  // 'down' (always down to the previous multiple). Nullable — NULL means
  // 'nearest'. Only meaningful when autoTxnRounding is set.
  autoTxnRoundingMode: text('auto_txn_rounding_mode'),
  // LEGACY (shipped in 0.190.0). Was a per-account "show on the Accounts tab"
  // flag; that granularity was replaced by a single global "show accounts in
  // main menu" preference. Kept append-only so already-migrated databases stay
  // consistent, and read once on upgrade to seed the new global toggle (see
  // AccountsDB.hasMainMenuPinnedAccount / DisplaySettingsContext). No longer
  // written by the app.
  showInMainMenu: integer('show_in_main_menu').default(0),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
  deletedAt: text('deleted_at'),
}, (table) => ({
  orderIdx: index('idx_accounts_order').on(table.displayOrder),
  hiddenIdx: index('idx_accounts_hidden').on(table.hidden),
}));

/**
 * Categories table
 */
export const categories = sqliteTable('categories', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  type: text('type', { enum: ['folder', 'entry'] }).notNull(),
  categoryType: text('category_type', { enum: ['expense', 'income'] }).notNull(),
  parentId: text('parent_id').references(() => categories.id, { onDelete: 'cascade' }),
  icon: text('icon'),
  color: text('color'),
  isShadow: integer('is_shadow').default(0),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
}, (table) => ({
  parentIdx: index('idx_categories_parent').on(table.parentId),
  typeIdx: index('idx_categories_type').on(table.type),
  categoryTypeIdx: index('idx_categories_category_type').on(table.categoryType),
  shadowIdx: index('idx_categories_is_shadow').on(table.isShadow),
}));

/**
 * Operations table
 */
export const operations = sqliteTable('operations', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  type: text('type', { enum: ['expense', 'income', 'transfer'] }).notNull(),
  amount: text('amount').notNull(),
  accountId: integer('account_id').notNull().references(() => accounts.id, { onDelete: 'cascade' }),
  categoryId: text('category_id').references(() => categories.id, { onDelete: 'set null' }),
  toAccountId: integer('to_account_id').references(() => accounts.id, { onDelete: 'cascade' }),
  date: text('date').notNull(),
  createdAt: text('created_at').notNull(),
  description: text('description'),
  exchangeRate: text('exchange_rate'),
  destinationAmount: text('destination_amount'),
  sourceCurrency: text('source_currency'),
  destinationCurrency: text('destination_currency'),
  originalBalance: text('original_balance'),
  // Optional device geolocation captured at save time (decimal degrees, stored as
  // string per the codebase's "numbers as strings" convention; parseFloat at use).
  // Nullable — only populated when the user opts in to attaching location. No index:
  // the proximity query compares CAST(... AS REAL), which a text index can't serve,
  // and getLabelsNearLocation already scans like getDistinctLabels.
  latitude: text('latitude'),
  longitude: text('longitude'),
  // When 1, this operation is left out of the daily spending average and the
  // burndown forecast (getTotalExpenses) only. It still counts as a normal
  // expense everywhere else — account balances, pie charts, category totals.
  // 0 / null = counted (default). Lets a one-off large purchase not skew the
  // forecast. Physically appended last by migration 0013 (after longitude).
  excludeFromAvg: integer('exclude_from_avg').default(0),
  // When 1, this operation is left out of every analytic surface: the expense and
  // income donuts, the 12-month spending trend, the category drill-down list, the
  // summary totals and the burndown forecast. Its money still moves — account
  // balances, balance history and the operations list are untouched. 0 / null =
  // shown (default). Unlike excludeFromAvg this flag is also settable on balance
  // adjustments (shadow-category ops), which have no editable form and are toggled
  // from the operations list's long-press menu. Appended by migration 0023.
  excludeFromCharts: integer('exclude_from_charts').default(0),
}, (table) => ({
  dateIdx: index('idx_operations_date').on(table.date),
  accountIdx: index('idx_operations_account').on(table.accountId),
  categoryIdx: index('idx_operations_category').on(table.categoryId),
  typeIdx: index('idx_operations_type').on(table.type),
}));

/**
 * Budgets table
 */
export const budgets = sqliteTable('budgets', {
  id: text('id').primaryKey(),
  categoryId: text('category_id').notNull().references(() => categories.id, { onDelete: 'cascade' }),
  amount: text('amount').notNull(),
  currency: text('currency').notNull(),
  periodType: text('period_type', { enum: ['weekly', 'monthly', 'yearly'] }).notNull(),
  startDate: text('start_date').notNull(),
  endDate: text('end_date'),
  isRecurring: integer('is_recurring').default(1),
  rolloverEnabled: integer('rollover_enabled').default(0),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
}, (table) => ({
  categoryIdx: index('idx_budgets_category').on(table.categoryId),
  periodIdx: index('idx_budgets_period').on(table.periodType),
  datesIdx: index('idx_budgets_dates').on(table.startDate, table.endDate),
  currencyIdx: index('idx_budgets_currency').on(table.currency),
  recurringIdx: index('idx_budgets_recurring').on(table.isRecurring),
}));

/**
 * Planned Operations table
 * Templates for recurring or one-time planned expenses/income/transfers
 */
export const plannedOperations = sqliteTable('planned_operations', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  type: text('type', { enum: ['expense', 'income', 'transfer'] }).notNull(),
  amount: text('amount').notNull(),
  accountId: integer('account_id').notNull().references(() => accounts.id, { onDelete: 'cascade' }),
  categoryId: text('category_id').references(() => categories.id, { onDelete: 'set null' }),
  toAccountId: integer('to_account_id').references(() => accounts.id, { onDelete: 'cascade' }),
  description: text('description'),
  isRecurring: integer('is_recurring').notNull().default(1),
  lastExecutedMonth: text('last_executed_month'),
  displayOrder: integer('display_order'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
}, (table) => ({
  accountIdx: index('idx_planned_ops_account').on(table.accountId),
  typeIdx: index('idx_planned_ops_type').on(table.type),
  recurringIdx: index('idx_planned_ops_recurring').on(table.isRecurring),
}));

/**
 * Notification merchant rules table
 *
 * Maps a merchant name parsed from a bank notification (e.g. "NAREK MEHRABYAN")
 * to a category. Learned the first time the user categorizes a transaction for
 * that merchant, then auto-applied to future notifications. Optionally scoped by
 * the source bank app's package name so the same merchant string can map
 * differently per bank if ever needed.
 *
 * `labelOverride` is an optional user-chosen display name for the merchant
 * (e.g. "ECOSENSE BYUZAND" -> "Ecosense"). When set, operations created from
 * future notifications for this merchant carry the override as their label
 * instead of the raw shop name. Nullable — most rules only learn a category.
 */
export const notificationMerchantRules = sqliteTable('notification_merchant_rules', {
  id: text('id').primaryKey(),
  merchant: text('merchant').notNull(),
  packageName: text('package_name'),
  categoryId: text('category_id').references(() => categories.id, { onDelete: 'cascade' }),
  labelOverride: text('label_override'),
  // ISO timestamp of the most recent notification this rule actually resolved
  // (auto-created or approved from the queue). Unlike updatedAt (which only
  // moves when the rule is edited), this bumps every time the merchant is seen
  // again, so the bindings UI can float a freshly-matched rule to the top.
  // Nullable — NULL until the first post-0016 match; ordering falls back to
  // updatedAt for such rows.
  lastMatchedAt: text('last_matched_at'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
}, (table) => ({
  merchantIdx: index('idx_merchant_rules_merchant').on(table.merchant),
}));

/**
 * Notification parse templates table
 *
 * User-defined parsers for banking apps Penny doesn't ship a parser for. The
 * user marks the amount / payee / card / date in one captured notification and
 * the marks are stored here as context anchors (see
 * services/notifications/templateEngine.js), not character offsets — the next
 * notification has a different number of digits and every offset would shift.
 *
 * `fields` is a JSON object keyed by field name (amount, currency, merchant,
 * card, date, time), each holding `{ source, kind, before, after, value,
 * occurrence }`. `triggers` is a JSON array of literal words the notification
 * must contain for the template to claim it, which is what stops a template from
 * matching its app's unrelated messages. Both are JSON columns rather than child
 * tables: they are read and written whole, only ever by the template editor, and
 * never queried across.
 *
 * The sample the template was built from is kept so the editor can reopen it and
 * re-derive the marks, and so the preview can show what the template extracts.
 */
export const notificationTemplates = sqliteTable('notification_templates', {
  id: text('id').primaryKey(),
  // Shown in the templates list, and used as the descriptor's `kind` (the review
  // queue falls back to it when a notification carries no payee).
  name: text('name').notNull(),
  // The app this template parses. Nullable only for a template built from a
  // notification whose source app was unknown.
  packageName: text('package_name'),
  type: text('type', { enum: ['expense', 'income'] }).notNull(),
  // 0 disables a template without deleting it — the escape hatch for a template
  // that turns out to misfire, so the user can stop it and fix it rather than
  // losing the work.
  enabled: integer('enabled').notNull().default(1),
  // Evaluation order within an app; lower runs first. Lets a specific template
  // win over a broader one for the same bank.
  priority: integer('priority').notNull().default(0),
  // Optional fallback category for everything this template parses. A learned
  // merchant rule always wins over it — that is the more specific fact.
  categoryId: text('category_id').references(() => categories.id, { onDelete: 'set null' }),
  // Fixed currency, used when the notification doesn't spell one out.
  currency: text('currency'),
  // 'dmy' | 'mdy' | 'ymd' — how to read an ambiguous numeric date. Null = 'dmy'.
  dateOrder: text('date_order'),
  fields: text('fields').notNull(),
  triggers: text('triggers'),
  sampleTitle: text('sample_title'),
  sampleText: text('sample_text'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
}, (table) => ({
  packageIdx: index('idx_notification_templates_package').on(table.packageName),
}));

/**
 * Pending notifications table
 *
 * Parsed bank notifications that could not be fully matched (unknown card or
 * unknown merchant) wait here for the user to resolve them in the review queue.
 * Fully-matched notifications are turned into operations immediately and never
 * land here.
 */
export const pendingNotifications = sqliteTable('pending_notifications', {
  id: text('id').primaryKey(),
  kind: text('kind').notNull(),
  type: text('type', { enum: ['expense', 'income', 'transfer'] }).notNull(),
  amount: text('amount').notNull(),
  currency: text('currency').notNull(),
  cardMask: text('card_mask'),
  merchant: text('merchant'),
  country: text('country'),
  date: text('date'),
  time: text('time'),
  // Best-effort resolved suggestions; one or both may be null (that's why the
  // item is pending). The user confirms/overrides them before saving.
  accountId: integer('account_id').references(() => accounts.id, { onDelete: 'cascade' }),
  categoryId: text('category_id').references(() => categories.id, { onDelete: 'set null' }),
  packageName: text('package_name'),
  raw: text('raw'),
  // Location captured at ingestion time (near the shop), reused when the item is
  // resolved so a notification reviewed later isn't stamped with the wrong place.
  // Both nullable — only populated when the attach-location opt-in was on.
  latitude: text('latitude'),
  longitude: text('longitude'),
  createdAt: text('created_at').notNull(),
}, (table) => ({
  createdIdx: index('idx_pending_notifications_created').on(table.createdAt),
}));

/**
 * Accounts Balance History table
 * Tracks daily end-of-day balances for accounts
 */
export const accountsBalanceHistory = sqliteTable('accounts_balance_history', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  accountId: integer('account_id').notNull().references(() => accounts.id, { onDelete: 'cascade' }),
  date: text('date').notNull(),
  balance: text('balance').notNull(),
  createdAt: text('created_at').notNull(),
}, (table) => ({
  accountDateIdx: index('idx_balance_history_account_date').on(table.accountId, table.date),
  dateIdx: index('idx_balance_history_date').on(table.date),
  uniqueAccountDate: unique().on(table.accountId, table.date),
}));

/**
 * Budget Plans table (Budgets v2 — envelope-style monthly income allocation)
 *
 * One plan per calendar month. `expected_income` is the total income the user
 * expects that month; it is split into budget_plan_lines. The un-allocated
 * remainder (expected_income − Σ lines) is always COMPUTED, never stored.
 *
 * Amounts follow the codebase convention: string decimals (see budgets.amount),
 * with all arithmetic going through app/services/currency.js.
 */
export const budgetPlans = sqliteTable('budget_plans', {
  id: text('id').primaryKey(),
  // YYYY-MM. Unique — a month has at most one plan.
  month: text('month').notNull(),
  // Display/base currency of the plan.
  currency: text('currency').notNull(),
  // Total expected income for the month (string decimal). Defaults to '0'.
  expectedIncome: text('expected_income').notNull().default('0'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
}, (table) => ({
  monthIdx: unique('idx_budget_plans_month').on(table.month),
}));

/**
 * Budget Plan Lines table
 *
 * Each line allocates part of the plan's expected income to a tracking target.
 * Every line is linked to EXACTLY ONE of:
 *   - an expense `category_id` → tracked against category spending, or
 *   - a destination `to_account_id` → tracked against transfers INTO that account.
 * The "exactly one" invariant is enforced in the service (BudgetPlansDB), not by
 * SQL, so a line whose FK is nulled by a category/account deletion (ON DELETE SET
 * NULL) becomes "broken" (both targets null) instead of crashing — the UI (later
 * parts) prompts the user to re-link it.
 *
 * `to_account_id` is an integer FK to match accounts.id (integer autoincrement),
 * consistent with operations.to_account_id / planned_operations.to_account_id.
 *
 * Budgets v3 phase 2 (migration 0019) consolidated the old per-category `budgets`
 * table (C) into this model as RECURRING lines:
 *   - `is_recurring` = 0 (one-time): scoped to a single month via `plan_id`
 *     (required). This is the original Budgets v2 line.
 *   - `is_recurring` = 1 (recurring): a global template NOT tied to any one
 *     month's plan — `plan_id` is NULL — that applies to every calendar month
 *     automatically (mirroring how v1 `budgets` behaved). Since it has no plan to
 *     inherit a currency from, it carries its own `currency`.
 * `plan_id` was made nullable via a recreate-table migration (SQLite cannot
 * ALTER COLUMN DROP NOT NULL) — see drizzle/0019_recurring_plan_lines.js.
 *
 * Budgets v3 phase 3 (migration 0020) absorbed the standalone `planned_operations`
 * model into this one: a line may now carry an EXECUTABLE TEMPLATE. `kind` says
 * what an execution creates (income / expense / transfer), `account_id` is the
 * account it touches (same meaning as `operations.account_id`: source for an
 * expense/transfer, destination for income), and `last_executed_month` records
 * the last YYYY-MM it ran. A line WITH `account_id` shows the execute action; a
 * line without it is a pure analytic target, exactly as before. `is_recurring`
 * doubles as the old "recurring vs one-time" planned-operation flag: executing a
 * ONE-OFF template deletes it, mirroring `executeAndMark`.
 *
 * Income lines (`kind` = 'income') are the plan's expected income: their sum
 * replaces the stored `budget_plans.expected_income` (kept, append-only, but no
 * longer written or read by the app after migration 0020 bridges it into lines).
 * They are NOT counted in `allocated` and get no per-line actual — the income
 * section compares the month's real income against their total.
 */
export const budgetPlanLines = sqliteTable('budget_plan_lines', {
  id: text('id').primaryKey(),
  // Nullable: NULL for a recurring (global template) line. Non-null one-off lines
  // still reference an existing plan (ON DELETE CASCADE); recurring lines have no
  // plan to cascade from.
  planId: text('plan_id').references(() => budgetPlans.id, { onDelete: 'cascade' }),
  // Optional display name; falls back to the linked category/account name.
  label: text('label'),
  amount: text('amount').notNull(),
  comment: text('comment'),
  // The line's PRIMARY category. Since migration 0021 a line can track several
  // categories and budget_plan_line_categories is the source of truth — this
  // column is the denormalized first entry, kept for the CSV/backup shape and
  // still written on every insert/update. Readers use the junction (see
  // BudgetPlansDB.mapLineFields), which is why an ON DELETE SET NULL here cannot
  // silently unlink a line that still tracks other categories.
  categoryId: text('category_id').references(() => categories.id, { onDelete: 'set null' }),
  toAccountId: integer('to_account_id').references(() => accounts.id, { onDelete: 'set null' }),
  sortOrder: integer('sort_order').notNull().default(0),
  // 0 = one-time (scoped to `plan_id`'s month), 1 = recurring (global, every month).
  // For a line with an executable template this also carries the old planned-
  // operation meaning: a one-time template is deleted once executed.
  isRecurring: integer('is_recurring').notNull().default(0),
  // Currency this line's `amount` is expressed in. Required for a recurring line
  // (it has no plan to inherit one from); optional elsewhere — NULL means "inherit
  // the parent plan's currency", which is what every pre-0020 one-off line does.
  currency: text('currency'),
  // Executable template (migration 0020, Budgets v3 phase 3). NULL `kind` on
  // legacy rows: inferred from the target (toAccountId → transfer, else expense).
  kind: text('kind', { enum: ['income', 'expense', 'transfer'] }),
  // Account an execution touches — source for expense/transfer, destination for
  // income (same semantics as operations.account_id). NULL = no template, i.e. a
  // pure analytic target with no execute action.
  accountId: integer('account_id').references(() => accounts.id, { onDelete: 'set null' }),
  // YYYY-MM of the last execution (or manual "mark as done"), like the old
  // planned_operations.last_executed_month.
  lastExecutedMonth: text('last_executed_month'),
  // Migration 0021. Legacy since the toggle was dropped: descendant categories
  // ALWAYS roll up into a line's actual (picking a parent category means its
  // subtree; a leaf has no subtree), so the app writes 1 and ignores a stored 0.
  // The column stays for the backup/Sheets shape — see BudgetPlansDB.mapLineFields.
  includeChildren: integer('include_children').notNull().default(1),
  // Migration 0022. The envelope this line belongs to, or NULL for a line that
  // stands on its own. ON DELETE SET NULL: dropping a group ungroups its lines,
  // it never deletes the budgets inside it.
  groupId: text('group_id').references(() => budgetPlanLineGroups.id, { onDelete: 'set null' }),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
}, (table) => ({
  planIdx: index('idx_budget_plan_lines_plan').on(table.planId),
  recurringIdx: index('idx_budget_plan_lines_recurring').on(table.isRecurring),
  kindIdx: index('idx_budget_plan_lines_kind').on(table.kind),
  groupIdx: index('idx_budget_plan_lines_group').on(table.groupId),
}));

/**
 * Budget Plan Line Groups table (migration 0022)
 *
 * An envelope over several lines. A group's members may mix category targets from
 * unrelated trees with transfer targets, and recurring lines with one-off ones —
 * membership is the only thing a group asserts.
 *
 * GLOBAL, like recurring lines: no `plan_id`, so a group outlives any single
 * month and shows up in every month where at least one of its lines does. That is
 * what lets one group hold a recurring line (which belongs to no plan) and a
 * one-off line (which belongs to exactly one) at the same time.
 *
 * `amount` NULL — the default — means the group's budget is DERIVED: the sum of
 * its children's targets, in whatever currency the screen is read in. A non-null
 * amount overrides that and, being an override the user typed deliberately,
 * replaces the children's sum in the month's allocated total (see
 * BudgetPlansDB.calculatePlanStatus). `currency` accompanies an override amount
 * (a group has no plan to inherit one from) and is NULL for a derived group.
 *
 * A group's ACTUAL is always the sum of its children's actuals — an override
 * changes the target, never what was really spent.
 */
export const budgetPlanLineGroups = sqliteTable('budget_plan_line_groups', {
  id: text('id').primaryKey(),
  // Required: a group has no target to borrow a name from, unlike a line.
  label: text('label').notNull(),
  // NULL = derived (sum of the group's lines). Non-null = explicit override.
  amount: text('amount'),
  // Set only alongside an override `amount`.
  currency: text('currency'),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

/**
 * Budget Plan Line ↔ Categories junction (migration 0021)
 *
 * The set of expense categories a plan line tracks. Replaces the single
 * `budget_plan_lines.category_id` as the source of truth, so a line can budget
 * several sibling categories at once (e.g. Groceries + Cafes) instead of forcing
 * the user to pick their common parent and swallow every other child with it.
 *
 * Both FKs cascade: deleting the line drops its links, and deleting a category
 * merely SHRINKS the line's set. A line whose set becomes empty (and which has no
 * transfer target) reads as "broken", the same state a nulled `category_id`
 * produced before — see BudgetPlansDB.mapLineFields.
 *
 * Whether descendants of these categories also count is the line's
 * `include_children` flag, not a property of the link.
 */
export const budgetPlanLineCategories = sqliteTable('budget_plan_line_categories', {
  lineId: text('line_id').notNull().references(() => budgetPlanLines.id, { onDelete: 'cascade' }),
  categoryId: text('category_id').notNull().references(() => categories.id, { onDelete: 'cascade' }),
}, (table) => ({
  pk: primaryKey({ columns: [table.lineId, table.categoryId] }),
  categoryIdx: index('idx_budget_plan_line_categories_category').on(table.categoryId),
}));

/**
 * Budget Plan Line ↔ Accounts junction (migration 0024)
 *
 * The set of SOURCE accounts a plan line counts spending from — matched against
 * `operations.account_id`. An empty set (the default, and what every pre-0024
 * line has) means "any account", so nothing about an existing line changes.
 *
 * This is a SECOND, INDEPENDENT filter alongside the line's categories, combined
 * with logical AND: categories only → those categories from any account;
 * accounts only → any expense from those accounts; both → the intersection.
 * A line with neither (and no transfer target) is "broken", the same state an
 * unlinked line already reaches — see BudgetPlansDB.mapLineFields.
 *
 * NOT either of the account columns on the line itself: `to_account_id` is a
 * transfer TARGET, `account_id` is an executable template's EXECUTION account.
 * This junction only narrows which operations count toward the actual.
 *
 * Both FKs cascade, like budgetPlanLineCategories: deleting the line drops its
 * links, deleting an account merely SHRINKS the filter.
 */
export const budgetPlanLineAccounts = sqliteTable('budget_plan_line_accounts', {
  lineId: text('line_id').notNull().references(() => budgetPlanLines.id, { onDelete: 'cascade' }),
  accountId: integer('account_id').notNull().references(() => accounts.id, { onDelete: 'cascade' }),
}, (table) => ({
  pk: primaryKey({ columns: [table.lineId, table.accountId] }),
  accountIdx: index('idx_budget_plan_line_accounts_account').on(table.accountId),
}));
