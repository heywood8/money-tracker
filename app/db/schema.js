import { sqliteTable, text, integer, index, unique } from 'drizzle-orm/sqlite-core';

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
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
}, (table) => ({
  merchantIdx: index('idx_merchant_rules_merchant').on(table.merchant),
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
