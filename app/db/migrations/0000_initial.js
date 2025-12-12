/**
 * Initial schema migration
 * Creates all tables with integer IDs
 * Idempotent: safe to run after UUID migration or on fresh install
 */

export default `
-- App metadata table for tracking database version and migration status
CREATE TABLE IF NOT EXISTS app_metadata (
	key text PRIMARY KEY NOT NULL,
	value text NOT NULL,
	updated_at text NOT NULL
);

-- Accounts table
CREATE TABLE IF NOT EXISTS accounts (
	id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	name text NOT NULL,
	balance text DEFAULT '0' NOT NULL,
	currency text DEFAULT 'USD' NOT NULL,
	display_order integer,
	hidden integer DEFAULT 0,
	monthly_target text,
	created_at text NOT NULL,
	updated_at text NOT NULL
);

-- Categories table
CREATE TABLE IF NOT EXISTS categories (
	id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	name text NOT NULL,
	type text NOT NULL,
	category_type text NOT NULL,
	parent_id integer,
	icon text,
	color text,
	is_shadow integer DEFAULT 0,
	exclude_from_forecast integer DEFAULT 0,
	created_at text NOT NULL,
	updated_at text NOT NULL,
	FOREIGN KEY (parent_id) REFERENCES categories(id) ON UPDATE no action ON DELETE cascade
);

-- Operations table
CREATE TABLE IF NOT EXISTS operations (
	id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	type text NOT NULL,
	amount text NOT NULL,
	account_id integer NOT NULL,
	category_id integer,
	to_account_id integer,
	date text NOT NULL,
	created_at text NOT NULL,
	description text,
	exchange_rate text,
	destination_amount text,
	source_currency text,
	destination_currency text,
	FOREIGN KEY (account_id) REFERENCES accounts(id) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (category_id) REFERENCES categories(id) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (to_account_id) REFERENCES accounts(id) ON UPDATE no action ON DELETE cascade
);

-- Budgets table
CREATE TABLE IF NOT EXISTS budgets (
	id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	category_id integer NOT NULL,
	amount text NOT NULL,
	currency text NOT NULL,
	period_type text NOT NULL,
	start_date text NOT NULL,
	end_date text,
	is_recurring integer DEFAULT 1,
	rollover_enabled integer DEFAULT 0,
	created_at text NOT NULL,
	updated_at text NOT NULL,
	FOREIGN KEY (category_id) REFERENCES categories(id) ON UPDATE no action ON DELETE cascade
);

-- Create indexes for accounts
CREATE INDEX IF NOT EXISTS idx_accounts_order ON accounts (display_order);
CREATE INDEX IF NOT EXISTS idx_accounts_hidden ON accounts (hidden);

-- Create indexes for categories
CREATE INDEX IF NOT EXISTS idx_categories_parent ON categories (parent_id);
CREATE INDEX IF NOT EXISTS idx_categories_type ON categories (type);
CREATE INDEX IF NOT EXISTS idx_categories_category_type ON categories (category_type);
CREATE INDEX IF NOT EXISTS idx_categories_is_shadow ON categories (is_shadow);
CREATE INDEX IF NOT EXISTS idx_categories_exclude_from_forecast ON categories (exclude_from_forecast);

-- Create indexes for operations
CREATE INDEX IF NOT EXISTS idx_operations_date ON operations (date);
CREATE INDEX IF NOT EXISTS idx_operations_account ON operations (account_id);
CREATE INDEX IF NOT EXISTS idx_operations_category ON operations (category_id);
CREATE INDEX IF NOT EXISTS idx_operations_type ON operations (type);

-- Create indexes for budgets
CREATE INDEX IF NOT EXISTS idx_budgets_category ON budgets (category_id);
CREATE INDEX IF NOT EXISTS idx_budgets_period ON budgets (period_type);
CREATE INDEX IF NOT EXISTS idx_budgets_dates ON budgets (start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_budgets_currency ON budgets (currency);
CREATE INDEX IF NOT EXISTS idx_budgets_recurring ON budgets (is_recurring);
`;
