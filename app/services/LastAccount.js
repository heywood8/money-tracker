// Utility for tracking and retrieving the latest accessed account
import { getNumberPreference, setPreference, PREF_KEYS } from './PreferencesDB';

/**
 * Set the last accessed account ID
 * @param {number} accountId - The account ID (integer)
 */
export const setLastAccessedAccount = async (accountId) => {
  try {
    // Store as string representation of number
    await setPreference(PREF_KEYS.LAST_ACCOUNT, String(accountId));
  } catch (e) {
    console.error('Failed to set last accessed account:', e);
  }
};

/**
 * Get the last accessed account ID
 * @returns {Promise<number|null>} The account ID as a number, or null if not set
 */
export const getLastAccessedAccount = async () => {
  try {
    return await getNumberPreference(PREF_KEYS.LAST_ACCOUNT, null);
  } catch (e) {
    console.error('Failed to get last accessed account:', e);
    return null;
  }
};
