/**
 * Service to handle notifications and create operations
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { parseGooglePayNotification, isGooglePayTransaction } from './GooglePayParser';
import { createOperation } from './OperationsDB';
import { queryAll } from './db';
import uuid from 'react-native-uuid';

const SETTINGS_KEY = 'google_pay_settings';

/**
 * Default settings for Google Pay integration
 */
const DEFAULT_SETTINGS = {
  enabled: false,
  autoCreateTransactions: true,
  defaultAccountId: null,
  defaultCategoryId: null,
  requireConfirmation: true,
};

/**
 * Get Google Pay settings
 * @returns {Promise<Object>} Settings object
 */
export const getGooglePaySettings = async () => {
  try {
    const settings = await AsyncStorage.getItem(SETTINGS_KEY);
    if (settings) {
      return { ...DEFAULT_SETTINGS, ...JSON.parse(settings) };
    }
    return DEFAULT_SETTINGS;
  } catch (error) {
    console.error('Failed to get Google Pay settings:', error);
    return DEFAULT_SETTINGS;
  }
};

/**
 * Save Google Pay settings
 * @param {Object} settings - Settings to save
 * @returns {Promise<void>}
 */
export const saveGooglePaySettings = async (settings) => {
  try {
    const currentSettings = await getGooglePaySettings();
    const updatedSettings = { ...currentSettings, ...settings };
    await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(updatedSettings));
  } catch (error) {
    console.error('Failed to save Google Pay settings:', error);
    throw error;
  }
};

/**
 * Handle incoming Google Pay notification
 * @param {Object} notification - Notification data from native module
 * @param {Function} onPendingTransaction - Callback for pending transactions requiring confirmation
 * @returns {Promise<Object|null>} Created operation or null
 */
export const handleGooglePayNotification = async (notification, onPendingTransaction) => {
  try {
    // Check if feature is enabled
    const settings = await getGooglePaySettings();
    if (!settings.enabled || !settings.autoCreateTransactions) {
      return null;
    }

    // Check if it's a valid transaction notification
    if (!isGooglePayTransaction(notification)) {
      return null;
    }

    // Parse the notification
    const transaction = parseGooglePayNotification(notification);
    if (!transaction) {
      console.log('Failed to parse Google Pay notification');
      return null;
    }

    // Find matching account by currency
    const account = await findMatchingAccount(transaction.currency, settings.defaultAccountId);
    if (!account) {
      console.log('No matching account found for currency:', transaction.currency);
      return null;
    }

    // Find or create category
    const categoryId = await findOrCreateCategory(transaction, settings.defaultCategoryId);

    // Build operation data
    const operationData = {
      id: uuid.v4(),
      type: transaction.type,
      amount: transaction.amount,
      accountId: account.id,
      categoryId: categoryId,
      date: transaction.date,
      description: transaction.description,
    };

    // If confirmation required, call callback instead of creating immediately
    if (settings.requireConfirmation && onPendingTransaction) {
      onPendingTransaction({
        ...operationData,
        merchant: transaction.merchant,
        source: transaction.source,
      });
      return null;
    }

    // Create operation automatically
    const operation = await createOperation(operationData);
    console.log('Created operation from Google Pay notification:', operation.id);
    return operation;
  } catch (error) {
    console.error('Failed to handle Google Pay notification:', error);
    return null;
  }
};

/**
 * Find account matching the transaction currency
 * @param {string} currency - Currency code
 * @param {string|null} defaultAccountId - Default account ID from settings
 * @returns {Promise<Object|null>} Matching account or null
 */
const findMatchingAccount = async (currency, defaultAccountId) => {
  try {
    const accounts = await queryAll('SELECT * FROM accounts');

    // First try default account if set and currency matches
    if (defaultAccountId) {
      const defaultAccount = accounts.find(
        acc => acc.id === defaultAccountId && acc.currency === currency
      );
      if (defaultAccount) {
        return defaultAccount;
      }
    }

    // Find first account with matching currency
    const matchingAccount = accounts.find(acc => acc.currency === currency);
    if (matchingAccount) {
      return matchingAccount;
    }

    // Fallback: return first account if no currency match
    return accounts.length > 0 ? accounts[0] : null;
  } catch (error) {
    console.error('Failed to find matching account:', error);
    return null;
  }
};

/**
 * Find or create category for the transaction
 * @param {Object} transaction - Parsed transaction data
 * @param {string|null} defaultCategoryId - Default category ID from settings
 * @returns {Promise<string|null>} Category ID or null
 */
const findOrCreateCategory = async (transaction, defaultCategoryId) => {
  try {
    const categories = await queryAll(
      'SELECT * FROM categories WHERE type = ? AND category_type = ?',
      ['entry', transaction.type]
    );

    // Use default category if set
    if (defaultCategoryId) {
      const defaultCategory = categories.find(cat => cat.id === defaultCategoryId);
      if (defaultCategory) {
        return defaultCategoryId;
      }
    }

    // Try to find category by merchant name (basic matching)
    const merchant = transaction.merchant.toLowerCase();
    const matchingCategory = categories.find(cat => {
      const catName = cat.name.toLowerCase();
      return merchant.includes(catName) || catName.includes(merchant);
    });

    if (matchingCategory) {
      return matchingCategory.id;
    }

    // Return first available category for this type
    if (categories.length > 0) {
      return categories[0].id;
    }

    return null;
  } catch (error) {
    console.error('Failed to find category:', error);
    return null;
  }
};

/**
 * Create operation from pending transaction (used when confirmation is required)
 * @param {Object} transactionData - Transaction data including operation fields
 * @returns {Promise<Object>} Created operation
 */
export const confirmPendingTransaction = async (transactionData) => {
  try {
    const operation = await createOperation(transactionData);
    return operation;
  } catch (error) {
    console.error('Failed to confirm pending transaction:', error);
    throw error;
  }
};
