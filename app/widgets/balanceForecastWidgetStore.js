import * as FileSystem from 'expo-file-system/legacy';

/**
 * Which accounts each balance-forecast widget shows.
 *
 * A file of its own beside the exchange-rate widgets' one, for the same reason:
 * widget ids belong to this phone's launcher, so they stay out of app_metadata
 * and out of backups. Account ids are kept as strings, the form they come back
 * in from every round trip (JSON, CSV, Sheets), and compared as such.
 *
 * Shape: { [widgetId]: { accountIds: [id, ...] | null } }, null (or no entry)
 * meaning every account, those opened later included.
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
 * The accounts a widget was set up with, in the order picked; null when it
 * shows every account (set up that way, or never set up).
 *
 * @param {number} widgetId
 * @returns {Promise<string[]|null>}
 */
export const getWidgetAccountIds = async (widgetId) => {
  const configs = await readAll();
  const ids = configs[String(widgetId)]?.accountIds;
  return Array.isArray(ids) ? ids.map(String) : null;
};

/**
 * Bind a widget to its accounts, or with null to every account.
 *
 * @param {number} widgetId
 * @param {Array<string|number>|null} accountIds
 */
export const setWidgetAccountIds = async (widgetId, accountIds) => {
  const configs = await readAll();
  configs[String(widgetId)] = { accountIds: accountIds ? accountIds.map(String) : null };
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
