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
  GOOGLE_SHEETS_SPREADSHEET_ID: 'google_sheets_spreadsheet_id',
  DEFAULT_ACCOUNT_ID: 'default_account_id',
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
