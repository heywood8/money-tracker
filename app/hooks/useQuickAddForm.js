import { useState, useEffect, useCallback, useMemo } from 'react';
import { getLastAccessedAccount } from '../services/LastAccount';
import { getCategoryDisplayName, getCategoryNames } from '../utils/categoryUtils';
import * as Currency from '../services/currency';
import * as OperationsDB from '../services/OperationsDB';
import currencies from '../../assets/currencies.json';

/**
 * Get currency symbol from currency code
 */
const getCurrencySymbol = (currencyCode) => {
  if (!currencyCode) return '';
  const currency = currencies[currencyCode];
  return currency ? currency.symbol : currencyCode;
};

/**
 * Custom hook for managing quick add form state and helpers
 * Handles form values, account/category lookups, and initialization
 */
const useQuickAddForm = (visibleAccounts, accounts, categories, t) => {
  // Quick add form state
  const [quickAddValues, setQuickAddValues] = useState({
    type: 'expense',
    amount: '',
    accountId: '',
    categoryId: '',
    description: '',
    toAccountId: '',
    exchangeRate: '',
    destinationAmount: '',
  });

  // Set default account on mount
  useEffect(() => {
    async function setDefaultAccount() {
      if (visibleAccounts.length === 1) {
        setQuickAddValues(v => ({ ...v, accountId: visibleAccounts[0].id }));
      } else if (visibleAccounts.length > 1) {
        const lastId = await getLastAccessedAccount();
        if (lastId && visibleAccounts.some(acc => acc.id === lastId)) {
          setQuickAddValues(v => ({ ...v, accountId: lastId }));
        } else {
          const defaultId = visibleAccounts.slice().sort((a, b) => (a.id < b.id ? -1 : 1))[0].id;
          setQuickAddValues(v => ({ ...v, accountId: defaultId }));
        }
      }
    }
    setDefaultAccount();
  }, [visibleAccounts]);

  // Get account name
  const getAccountName = useCallback((accountId) => {
    const account = accounts.find(acc => acc.id === accountId);
    return account ? account.name : 'Unknown';
  }, [accounts]);

  // Get account balance with currency symbol
  const getAccountBalance = useCallback((accountId) => {
    const account = accounts.find(acc => acc.id === accountId);
    if (!account) return '';
    const symbol = getCurrencySymbol(account.currency);
    return `${symbol}${Currency.formatAmount(account.balance, account.currency)}`;
  }, [accounts]);

  // Get category info
  const getCategoryInfo = useCallback((categoryId) => {
    const category = categories.find(cat => cat.id === categoryId);
    if (!category) return { name: t('unknown_category'), icon: 'help-circle', parentName: null };

    const { categoryName, parentName } = getCategoryNames(categoryId, categories, t);

    return {
      name: categoryName || t('unknown_category'),
      icon: category.icon || 'help-circle',
      parentName,
    };
  }, [categories, t]);

  // Get category name for form
  const getCategoryName = useCallback((categoryId) => {
    if (!categoryId) return t('select_category');
    const displayName = getCategoryDisplayName(categoryId, categories, t);
    return displayName || t('select_category');
  }, [categories, t]);

  // Top most used categories from last 30 days (fetch extra to account for type filtering)
  const [topCategories, setTopCategories] = useState([]);
  // Top transfer target accounts from last 90 days
  const [topTransferTargets, setTopTransferTargets] = useState([]);

  // Load top categories and transfer targets from last 3 months
  useEffect(() => {
    async function loadTopCategories() {
      try {
        const topCats = await OperationsDB.getTopCategoriesFromLastMonth(5);
        setTopCategories(topCats);
      } catch (error) {
        console.error('Failed to load top categories:', error);
        setTopCategories([]);
      }
    }
    async function loadTopTransferTargets() {
      try {
        const targets = await OperationsDB.getTopTransferTargetAccounts(3);
        setTopTransferTargets(targets);
      } catch (error) {
        console.error('Failed to load top transfer targets:', error);
        setTopTransferTargets([]);
      }
    }
    loadTopCategories();
    loadTopTransferTargets();
  }, []);

  // Filtered categories for quick add form (excluding shadow categories)
  const filteredCategories = useMemo(() => {
    return categories.filter(cat => {
      if (quickAddValues.type === 'transfer') return false;
      // Exclude shadow categories from selection
      if (cat.isShadow) return false;
      // Include both folders and entries that match the operation type
      return cat.categoryType === quickAddValues.type;
    });
  }, [categories, quickAddValues.type]);

  // Get top 3 categories matching current operation type (expense/income)
  // Falls back to first 3 leaf categories when no usage history exists
  const topCategoriesForType = useMemo(() => {
    if (quickAddValues.type === 'transfer') return [];

    // Filter top categories to match current type and exclude shadow categories
    const fromHistory = topCategories
      .map(tc => categories.find(cat => cat.id === tc.categoryId))
      .filter(cat => cat && cat.categoryType === quickAddValues.type && !cat.isShadow)
      .slice(0, 3);

    if (fromHistory.length > 0) return fromHistory;

    // Fallback: first 3 leaf categories (non-folder) of this type
    return categories
      .filter(cat => cat.categoryType === quickAddValues.type && !cat.isShadow && !cat.isFolder)
      .slice(0, 3);
  }, [topCategories, categories, quickAddValues.type]);

  // Get top transfer target accounts, filtered to existing accounts excluding current source
  const topTransferAccountsForForm = useMemo(() => {
    if (quickAddValues.type !== 'transfer') return [];

    const sourceId = quickAddValues.accountId;

    // Filter history targets to accounts that still exist and aren't the source
    const fromHistory = topTransferTargets
      .map(tt => accounts.find(acc => acc.id === tt.accountId))
      .filter(acc => acc && acc.id !== sourceId)
      .slice(0, 3);

    if (fromHistory.length > 0) return fromHistory;

    // Fallback: first 3 visible accounts excluding current source
    return visibleAccounts
      .filter(acc => acc.id !== sourceId)
      .slice(0, 3);
  }, [topTransferTargets, accounts, visibleAccounts, quickAddValues.type, quickAddValues.accountId]);

  // Reset form but keep account and type
  const resetForm = useCallback(() => {
    setQuickAddValues(prev => ({
      type: prev.type,
      amount: '',
      accountId: prev.accountId,
      categoryId: '',
      description: '',
      toAccountId: '',
      exchangeRate: '',
      destinationAmount: '',
    }));
  }, []);

  return {
    quickAddValues,
    setQuickAddValues,
    getAccountName,
    getAccountBalance,
    getCategoryInfo,
    getCategoryName,
    filteredCategories,
    topCategoriesForType,
    topTransferAccountsForForm,
    resetForm,
  };
};

export default useQuickAddForm;
