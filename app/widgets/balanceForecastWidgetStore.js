import * as FileSystem from 'expo-file-system/legacy';
import { normalizeColumns } from './widgetConstants';

export { normalizeColumns };

/**
 * Which accounts each balance-forecast widget shows, and which of its columns.
 *
 * A file of its own beside the exchange-rate widgets' one, for the same reason:
 * widget ids belong to this phone's launcher, so they stay out of app_metadata
 * and out of backups. Account ids are kept as strings, the form they come back
 * in from every round trip (JSON, CSV, Sheets), and compared as such.
 *
 * Shape: { [widgetId]: { accountIds: [id, ...] | null, columns: [key, ...] } }.
 * accountIds null (or no entry) means every account, those opened later
 * included; columns are FORECAST_COLUMNS keys, every column when absent (as
 * for a widget set up before there was a choice).
 */

export const FORECAST_STORE_DIR = `${FileSystem.documentDirectory}widgets/`;
export const FORECAST_STORE_PATH = `${FORECAST_STORE_DIR}balance-forecast.json`;

const readAll = async () => {
  try {
    const info = await FileSystem.getInfoAsync(FORECAST_STORE_PATH);
    if (!info.exists) return {};
    const parsed = JSON.parse(await FileSystem.readAsStringAsync(FORECAST_STORE_PATH));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    // Unreadable is as good as empty: every widget falls back to all accounts.
    return {};
  }
};

const writeAll = async (configs) => {
  await FileSystem.makeDirectoryAsync(FORECAST_STORE_DIR, { intermediates: true });
  await FileSystem.writeAsStringAsync(FORECAST_STORE_PATH, JSON.stringify(configs));
};

/**
 * A widget's settings: the accounts it was set up with, in the order picked
 * (null when it shows every account, set up that way or never set up), and
 * its columns.
 *
 * @param {number} widgetId
 * @returns {Promise<{accountIds: string[]|null, columns: string[]}>}
 */
export const getWidgetConfig = async (widgetId) => {
  const configs = await readAll();
  const saved = configs[String(widgetId)] || {};
  return {
    accountIds: Array.isArray(saved.accountIds) ? saved.accountIds.map(String) : null,
    columns: normalizeColumns(saved.columns),
  };
};

/**
 * Save a widget's settings.
 *
 * @param {number} widgetId
 * @param {Object} config
 * @param {Array<string|number>|null} config.accountIds - null: every account
 * @param {string[]} [config.columns] - every column when absent
 */
export const setWidgetConfig = async (widgetId, { accountIds, columns }) => {
  const configs = await readAll();
  configs[String(widgetId)] = {
    accountIds: accountIds ? accountIds.map(String) : null,
    columns: normalizeColumns(columns),
  };
  await writeAll(configs);
};

/**
 * Drop a widget removed from the home screen.
 *
 * @param {number} widgetId
 */
export const forgetForecastWidget = async (widgetId) => {
  const configs = await readAll();
  if (!(String(widgetId) in configs)) return;
  delete configs[String(widgetId)];
  await writeAll(configs);
};

/**
 * The accounts a widget draws, in the Accounts screen's order: the ones it was
 * set up with, or every account. Archived accounts are left out either way,
 * as everywhere else accounts are offered; a picked account since deleted or
 * archived simply drops off.
 *
 * @param {Array<Object>} accounts - All accounts, in display order
 * @param {string[]|null} storedIds - The widget's own picks
 * @returns {Array<Object>}
 */
export const resolveForecastAccounts = (accounts, storedIds) => {
  const active = (accounts || []).filter((account) => !account.hidden);
  if (!storedIds) return active;
  const wanted = new Set(storedIds.map(String));
  return active.filter((account) => wanted.has(String(account.id)));
};
