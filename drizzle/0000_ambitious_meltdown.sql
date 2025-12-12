CREATE TABLE `accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`balance` text DEFAULT '0' NOT NULL,
	`currency` text DEFAULT 'USD' NOT NULL,
	`display_order` integer,
	`hidden` integer DEFAULT 0,
	`monthly_target` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_accounts_order` ON `accounts` (`display_order`);--> statement-breakpoint
CREATE INDEX `idx_accounts_hidden` ON `accounts` (`hidden`);--> statement-breakpoint
CREATE TABLE `app_metadata` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `budgets` (
	`id` text PRIMARY KEY NOT NULL,
	`category_id` text NOT NULL,
	`amount` text NOT NULL,
	`currency` text NOT NULL,
	`period_type` text NOT NULL,
	`start_date` text NOT NULL,
	`end_date` text,
	`is_recurring` integer DEFAULT 1,
	`rollover_enabled` integer DEFAULT 0,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_budgets_category` ON `budgets` (`category_id`);--> statement-breakpoint
CREATE INDEX `idx_budgets_period` ON `budgets` (`period_type`);--> statement-breakpoint
CREATE INDEX `idx_budgets_dates` ON `budgets` (`start_date`,`end_date`);--> statement-breakpoint
CREATE INDEX `idx_budgets_currency` ON `budgets` (`currency`);--> statement-breakpoint
CREATE INDEX `idx_budgets_recurring` ON `budgets` (`is_recurring`);--> statement-breakpoint
CREATE TABLE `categories` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`category_type` text NOT NULL,
	`parent_id` text,
	`icon` text,
	`color` text,
	`is_shadow` integer DEFAULT 0,
	`exclude_from_forecast` integer DEFAULT 0,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`parent_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_categories_parent` ON `categories` (`parent_id`);--> statement-breakpoint
CREATE INDEX `idx_categories_type` ON `categories` (`type`);--> statement-breakpoint
CREATE INDEX `idx_categories_category_type` ON `categories` (`category_type`);--> statement-breakpoint
CREATE INDEX `idx_categories_is_shadow` ON `categories` (`is_shadow`);--> statement-breakpoint
CREATE INDEX `idx_categories_exclude_from_forecast` ON `categories` (`exclude_from_forecast`);--> statement-breakpoint
CREATE TABLE `operations` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`amount` text NOT NULL,
	`account_id` text NOT NULL,
	`category_id` text,
	`to_account_id` text,
	`date` text NOT NULL,
	`created_at` text NOT NULL,
	`description` text,
	`exchange_rate` text,
	`destination_amount` text,
	`source_currency` text,
	`destination_currency` text,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`to_account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_operations_date` ON `operations` (`date`);--> statement-breakpoint
CREATE INDEX `idx_operations_account` ON `operations` (`account_id`);--> statement-breakpoint
CREATE INDEX `idx_operations_category` ON `operations` (`category_id`);--> statement-breakpoint
CREATE INDEX `idx_operations_type` ON `operations` (`type`);