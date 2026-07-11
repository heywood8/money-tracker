/**
 * Migration 0015: Per-account "show in main menu" flag
 *
 * Adds accounts.show_in_main_menu — whether the account is listed on the
 * dedicated Accounts tab in the bottom navigation ("main menu"). Existing rows
 * default to 0 (not shown), so the new tab starts empty until accounts are
 * explicitly opted in from the account settings in the Settings tab.
 */

const sql = `ALTER TABLE \`accounts\` ADD COLUMN \`show_in_main_menu\` integer DEFAULT 0;`;

export default sql;
