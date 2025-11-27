import AsyncStorage from '@react-native-async-storage/async-storage';
import * as AccountsDB from './AccountsDB';
import * as OperationsDB from './OperationsDB';
import * as CategoriesDB from './CategoriesDB';
import * as Currency from './currency';

/**
 * Widget Data Service
 *
 * This service prepares and shares data between the main app and home screen widgets.
 * It stores widget data in AsyncStorage in a format that widgets can read.
 */

const WIDGET_DATA_KEY = 'penny_widget_data';
const WIDGET_LAST_UPDATE_KEY = 'penny_widget_last_update';

/**
 * Format currency value for display
 * @param {string} value - Numeric string value
 * @param {string} currency - Currency code
 * @returns {string} Formatted currency string
 */
const formatCurrency = (value, currency) => {
  const num = parseFloat(value) || 0;

  // Get currency symbol
  const symbols = {
    USD: '$',
    EUR: '€',
    GBP: '£',
    JPY: '¥',
    AMD: '֏',
    RUB: '₽',
  };

  const symbol = symbols[currency] || currency;

  // Format with 2 decimal places
  const formatted = Math.abs(num).toFixed(2);

  return num < 0 ? `-${symbol}${formatted}` : `${symbol}${formatted}`;
};

/**
 * Calculate total balance across all accounts by currency
 * @returns {Promise<Array<{currency: string, total: string, formatted: string}>>}
 */
const calculateTotalsByurrency = async () => {
  try {
    const accounts = await AccountsDB.getAllAccounts();
    const totals = {};

    // Group by currency and sum
    accounts.forEach(account => {
      const currency = account.currency || 'USD';
      if (!totals[currency]) {
        totals[currency] = '0';
      }
      totals[currency] = Currency.add(totals[currency], account.balance || '0');
    });

    // Convert to array format
    return Object.entries(totals).map(([currency, total]) => ({
      currency,
      total,
      formatted: formatCurrency(total, currency),
    }));
  } catch (error) {
    console.error('Failed to calculate totals by currency:', error);
    return [];
  }
};

/**
 * Get recent operations with enriched data
 * @param {number} limit - Number of operations to fetch
 * @returns {Promise<Array>}
 */
const getRecentOperations = async (limit = 5) => {
  try {
    const operations = await OperationsDB.getAllOperations();
    const accounts = await AccountsDB.getAllAccounts();
    const categories = await CategoriesDB.getAllCategories();

    // Create lookup maps
    const accountMap = new Map(accounts.map(a => [a.id, a]));
    const categoryMap = new Map(categories.map(c => [c.id, c]));

    // Enrich operations with account and category names
    const enrichedOps = operations.slice(0, limit).map(op => {
      const account = accountMap.get(op.accountId);
      const category = op.categoryId ? categoryMap.get(op.categoryId) : null;
      const toAccount = op.toAccountId ? accountMap.get(op.toAccountId) : null;

      return {
        id: op.id,
        type: op.type,
        amount: op.amount,
        formattedAmount: formatCurrency(op.amount, account?.currency || 'USD'),
        date: op.date,
        description: op.description,
        accountName: account?.name || 'Unknown',
        accountCurrency: account?.currency || 'USD',
        categoryName: category?.name || '',
        categoryIcon: category?.icon || '',
        toAccountName: toAccount?.name || null,
      };
    });

    return enrichedOps;
  } catch (error) {
    console.error('Failed to get recent operations:', error);
    return [];
  }
};

/**
 * Get top accounts by balance
 * @param {number} limit - Number of accounts to return
 * @returns {Promise<Array>}
 */
const getTopAccounts = async (limit = 3) => {
  try {
    const accounts = await AccountsDB.getAllAccounts();

    // Sort by absolute balance value (descending)
    const sorted = accounts
      .map(account => ({
        ...account,
        numericBalance: parseFloat(account.balance) || 0,
      }))
      .sort((a, b) => Math.abs(b.numericBalance) - Math.abs(a.numericBalance))
      .slice(0, limit);

    return sorted.map(account => ({
      id: account.id,
      name: account.name,
      balance: account.balance,
      currency: account.currency,
      formatted: formatCurrency(account.balance, account.currency),
    }));
  } catch (error) {
    console.error('Failed to get top accounts:', error);
    return [];
  }
};

/**
 * Prepare complete widget data
 * @returns {Promise<Object>}
 */
export const prepareWidgetData = async () => {
  try {
    const [totalsByCurrency, recentOps, topAccounts, allAccounts] = await Promise.all([
      calculateTotalsByurrency(),
      getRecentOperations(5),
      getTopAccounts(3),
      AccountsDB.getAllAccounts(),
    ]);

    const widgetData = {
      totalsByCurrency,
      recentOperations: recentOps,
      topAccounts,
      accountCount: allAccounts.length,
      lastUpdate: new Date().toISOString(),
    };

    return widgetData;
  } catch (error) {
    console.error('Failed to prepare widget data:', error);
    throw error;
  }
};

/**
 * Save widget data to AsyncStorage
 * This makes the data accessible to widgets
 * @returns {Promise<void>}
 */
export const updateWidgetData = async () => {
  try {
    const widgetData = await prepareWidgetData();
    await AsyncStorage.setItem(WIDGET_DATA_KEY, JSON.stringify(widgetData));
    await AsyncStorage.setItem(WIDGET_LAST_UPDATE_KEY, new Date().toISOString());

    console.log('Widget data updated successfully');
  } catch (error) {
    console.error('Failed to update widget data:', error);
  }
};

/**
 * Get current widget data from AsyncStorage
 * @returns {Promise<Object|null>}
 */
export const getWidgetData = async () => {
  try {
    const dataStr = await AsyncStorage.getItem(WIDGET_DATA_KEY);
    if (!dataStr) return null;

    return JSON.parse(dataStr);
  } catch (error) {
    console.error('Failed to get widget data:', error);
    return null;
  }
};

/**
 * Get last widget update timestamp
 * @returns {Promise<string|null>}
 */
export const getLastUpdateTime = async () => {
  try {
    return await AsyncStorage.getItem(WIDGET_LAST_UPDATE_KEY);
  } catch (error) {
    console.error('Failed to get last update time:', error);
    return null;
  }
};

/**
 * Check if widget data needs refresh (older than specified minutes)
 * @param {number} maxAgeMinutes - Maximum age in minutes
 * @returns {Promise<boolean>}
 */
export const needsRefresh = async (maxAgeMinutes = 15) => {
  try {
    const lastUpdate = await getLastUpdateTime();
    if (!lastUpdate) return true;

    const lastUpdateTime = new Date(lastUpdate).getTime();
    const now = new Date().getTime();
    const ageMinutes = (now - lastUpdateTime) / (1000 * 60);

    return ageMinutes >= maxAgeMinutes;
  } catch (error) {
    console.error('Failed to check refresh status:', error);
    return true;
  }
};

/**
 * Clear widget data
 * @returns {Promise<void>}
 */
export const clearWidgetData = async () => {
  try {
    await AsyncStorage.multiRemove([WIDGET_DATA_KEY, WIDGET_LAST_UPDATE_KEY]);
    console.log('Widget data cleared');
  } catch (error) {
    console.error('Failed to clear widget data:', error);
  }
};
