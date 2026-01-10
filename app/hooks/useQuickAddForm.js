import { useState, useEffect, useCallback, useMemo } from 'react';
import { getLastAccessedAccount } from '../services/LastAccount';
import { getCategoryDisplayName } from '../utils/categoryUtils';
import * as Currency from '../services/currency';
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
    if (!category) return { name: t('unknown_category'), icon: 'help-circle' };

    const categoryName = getCategoryDisplayName(categoryId, categories, t);

    return {
      name: categoryName || t('unknown_category'),
      icon: category.icon || 'help-circle',
    };
  }, [categories, t]);

  // Get category name for form
  const getCategoryName = useCallback((categoryId) => {
    if (!categoryId) return t('select_category');
    const displayName = getCategoryDisplayName(categoryId, categories, t);
    return displayName || t('select_category');
  }, [categories, t]);

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
    resetForm,
  };
};

export default useQuickAddForm;
