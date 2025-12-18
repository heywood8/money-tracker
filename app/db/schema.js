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
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
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
  excludeFromForecast: integer('exclude_from_forecast').default(0),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
}, (table) => ({
  parentIdx: index('idx_categories_parent').on(table.parentId),
  typeIdx: index('idx_categories_type').on(table.type),
  categoryTypeIdx: index('idx_categories_category_type').on(table.categoryType),
  shadowIdx: index('idx_categories_is_shadow').on(table.isShadow),
  excludeFromForecastIdx: index('idx_categories_exclude_from_forecast').on(table.excludeFromForecast),
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
 * Card Bindings table
 * Maps masked card numbers to accounts for notification processing
 */
export const cardBindings = sqliteTable('card_bindings', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  cardMask: text('card_mask').notNull().unique(),
  accountId: integer('account_id').notNull().references(() => accounts.id, { onDelete: 'cascade' }),
  bankName: text('bank_name'),
  lastUsed: text('last_used').notNull(),
  createdAt: text('created_at').notNull(),
}, (table) => ({
  cardMaskIdx: index('idx_card_bindings_card_mask').on(table.cardMask),
  accountIdx: index('idx_card_bindings_account').on(table.accountId),
}));

/**
 * Merchant Bindings table
 * Maps merchant/purchase source names to categories for notification processing
 */
export const merchantBindings = sqliteTable('merchant_bindings', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  merchantName: text('merchant_name').notNull().unique(),
  categoryId: text('category_id').notNull().references(() => categories.id, { onDelete: 'cascade' }),
  lastUsed: text('last_used').notNull(),
  createdAt: text('created_at').notNull(),
}, (table) => ({
  merchantNameIdx: index('idx_merchant_bindings_merchant_name').on(table.merchantName),
  categoryIdx: index('idx_merchant_bindings_category').on(table.categoryId),
}));
