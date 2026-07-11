import { queryFirst, executeQuery, queryAll } from './db';

// Preference keys
export const PREF_KEYS = {
  THEME: 'theme_preference',
  LANGUAGE: 'app_language',
  LAST_ACCOUNT: 'last_accessed_account_id',
  OPERATIONS_FILTERS: 'operations_active_filters',
  UPDATE_LAST_CHECK_AT: 'update_last_check_at',
  UPDATE_LAST_PROMPTED_VERSION: 'update_last_prompted_version',
  UPDATE_SKIP_UNTIL: 'update_skip_until',
  HIDE_BALANCES: 'hide_balances',
  ATTACH_LOCATION: 'attach_location',
  // Global toggle: show a dedicated Accounts tab in the bottom navigation.
  SHOW_ACCOUNTS_TAB: 'show_accounts_tab',
  GOOGLE_SHEETS_SPREADSHEET_ID: 'google_sheets_spreadsheet_id',
  DEFAULT_ACCOUNT_ID: 'default_account_id',
  // Bank-notification processing
  BANK_NOTIFICATIONS_ENABLED: 'bank_notifications_enabled',
  BANK_NOTIFICATIONS_PROCESSED_SIGS: 'bank_notifications_processed_sigs',
  BANK_NOTIFICATIONS_PACKAGES: 'bank_notifications_packages',
  // Opt-in: run the ingestion pipeline periodically in the background and post a
  // system notification when new transactions land in the review queue.
  BANK_NOTIFICATIONS_BACKGROUND_ALERTS: 'bank_notifications_background_alerts',
  // Target "cash" account for ATM-withdrawal transfers, bound the first time an
  // ATM CASH notification is reviewed and reused for subsequent withdrawals.
  BANK_NOTIFICATIONS_ATM_ACCOUNT: 'bank_notifications_atm_account',
  // Learned (source app + currency) -> account bindings for notifications that
  // carry no card number (e.g. T-Bank SBP payments say "счет RUB", not "*4087").
  // A JSON object keyed by "<packageName>|<CURRENCY>" with an account id value.
  BANK_NOTIFICATIONS_ACCOUNT_BINDINGS: 'bank_notifications_account_bindings',
  // Notification feed app filters (which apps' notifications are shown)
  NOTIFICATION_FILTER_KNOWN: 'notification_filter_known_packages',
  NOTIFICATION_FILTER_HIDDEN: 'notification_filter_hidden_packages',
};

/**
 * Get a preference value from the database
 * Includes fallback to AsyncStorage for backward compatibility during migration
 * @param {string} key - Preference key
 * @param {*} defaultValue - Default value if preference doesn't exist
 * @returns {Promise<string|null>}
 */
export const getPreference = async (key, defaultValue = null) => {
  try {
    // Try SQLite first
    const result = await queryFirst(
      'SELECT value FROM app_metadata WHERE key = ?',
      [key],
    );

    if (result && result.value !== null) {
      return result.value;
    }

    return defaultValue;
  } catch (error) {
    console.error('[PreferencesDB] Error getting preference:', key, error);
    return defaultValue;
  }
};

/**
 * Set a preference value in the database
 * @param {string} key - Preference key
 * @param {string} value - Preference value
 * @returns {Promise<void>}
 */
export const setPreference = async (key, value) => {
  try {
    const now = new Date().toISOString();
    await executeQuery(
      `INSERT OR REPLACE INTO app_metadata (key, value, updated_at)
       VALUES (?, ?, ?)`,
      [key, value, now],
    );
  } catch (error) {
    console.error('[PreferencesDB] Error setting preference:', key, error);
    throw error;
  }
};

/**
 * Get a numeric preference value
 * @param {string} key - Preference key
 * @param {number|null} defaultValue - Default value if preference doesn't exist
 * @returns {Promise<number|null>}
 */
export const getNumberPreference = async (key, defaultValue = null) => {
  const value = await getPreference(key);
  if (value === null) {
    return defaultValue;
  }
  const numValue = Number(value);
  return isNaN(numValue) ? defaultValue : numValue;
};

/**
 * Get a JSON preference value (parsed object)
 * @param {string} key - Preference key
 * @param {*} defaultValue - Default value if preference doesn't exist
 * @returns {Promise<*>}
 */
export const getJsonPreference = async (key, defaultValue = null) => {
  const value = await getPreference(key);
  if (value === null) {
    return defaultValue;
  }
  try {
    return JSON.parse(value);
  } catch (error) {
    console.warn('[PreferencesDB] Error parsing JSON preference:', key, error);
    return defaultValue;
  }
};

/**
 * Set a JSON preference value (stringified object)
 * @param {string} key - Preference key
 * @param {*} value - Preference value (will be JSON stringified)
 * @returns {Promise<void>}
 */
export const setJsonPreference = async (key, value) => {
  await setPreference(key, JSON.stringify(value));
};

/**
 * Delete a preference from the database
 * @param {string} key - Preference key
 * @returns {Promise<void>}
 */
export const deletePreference = async (key) => {
  try {
    await executeQuery('DELETE FROM app_metadata WHERE key = ?', [key]);
  } catch (error) {
    console.error('[PreferencesDB] Error deleting preference:', key, error);
    throw error;
  }
};

/**
 * Get all preferences
 * @returns {Promise<Object>}
 */
export const getAllPreferences = async () => {
  try {
    const rows = await queryAll('SELECT key, value FROM app_metadata');
    const preferences = {};
    for (const row of rows) {
      preferences[row.key] = row.value;
    }
    return preferences;
  } catch (error) {
    console.error('[PreferencesDB] Error getting all preferences:', error);
    return {};
  }
};

/**
 * Get the pinned default account ID for QuickAdd
 * @returns {Promise<number|null>} Account ID or null ("Latest used" mode)
 */
export const getDefaultAccountId = async () => {
  try {
    return await getNumberPreference(PREF_KEYS.DEFAULT_ACCOUNT_ID, null);
  } catch (e) {
    console.error('[PreferencesDB] Failed to get default account:', e);
    return null;
  }
};

/**
 * Set the pinned default account ID for QuickAdd
 * @param {number|null} id - Account ID to pin, or null to revert to "Latest used"
 */
export const setDefaultAccountId = async (id) => {
  try {
    if (id === null) {
      await deletePreference(PREF_KEYS.DEFAULT_ACCOUNT_ID);
    } else {
      await setPreference(PREF_KEYS.DEFAULT_ACCOUNT_ID, String(id));
    }
  } catch (e) {
    console.error('[PreferencesDB] Failed to set default account:', e);
  }
};
