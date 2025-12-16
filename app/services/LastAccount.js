// Utility for tracking and retrieving the latest accessed account
import AsyncStorage from '@react-native-async-storage/async-storage';

const LAST_ACCESSED_ACCOUNT_KEY = 'last_accessed_account_id';

export const setLastAccessedAccount = async (accountId) => {
  try {
    await AsyncStorage.setItem(LAST_ACCESSED_ACCOUNT_KEY, accountId);
  } catch (e) {
    // Ignore errors
  }
};

export const getLastAccessedAccount = async () => {
  try {
    const id = await AsyncStorage.getItem(LAST_ACCESSED_ACCOUNT_KEY);
    return id !== null ? id : null;
  } catch (e) {
    return null;
  }
};
