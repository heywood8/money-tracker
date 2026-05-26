import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { getLastAccessedAccount } from '../services/LastAccount';
import { getCategoryDisplayName, getCategoryNames } from '../utils/categoryUtils';
import * as Currency from '../services/currency';
import * as OperationsDB from '../services/OperationsDB';
import { appEvents, EVENTS } from '../services/eventEmitter';
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
    operationCurrency: '',
  });

  // Foreign currency preview state
  const [foreignRateSource, setForeignRateSource] = useState(null);
  const [foreignExchangeRate, setForeignExchangeRate] = useState('');

  // Set default account on mount
  useEffect(() => {
    async function setDefaultAccount() {
      if (visibleAccounts.length === 1) {
        const acc = visibleAccounts[0];
        setQuickAddValues(v => ({ ...v, accountId: acc.id, operationCurrency: acc.currency || v.operationCurrency }));
      } else if (visibleAccounts.length > 1) {
        const lastId = await getLastAccessedAccount();
        let resolvedAcc;
        if (lastId && visibleAccounts.some(acc => acc.id === lastId)) {
          resolvedAcc = visibleAccounts.find(acc => acc.id === lastId);
        } else {
          resolvedAcc = visibleAccounts.slice().sort((a, b) => (a.id < b.id ? -1 : 1))[0];
        }
        setQuickAddValues(v => ({ ...v, accountId: resolvedAcc.id, operationCurrency: resolvedAcc.currency || v.operationCurrency }));
      }
    }
    setDefaultAccount();
  }, [visibleAccounts]);

  // Track previous accountId to reset operationCurrency on account switch
  const prevAccountIdRef = useRef(null);
  useEffect(() => {
    if (!quickAddValues.accountId) return;
    if (prevAccountIdRef.current === quickAddValues.accountId) return;
    prevAccountIdRef.current = quickAddValues.accountId;
    const account = accounts.find(a => a.id === quickAddValues.accountId);
    if (!account) return;
    setQuickAddValues(v => ({ ...v, operationCurrency: account.currency }));
    setForeignRateSource(null);
    setForeignExchangeRate('');
  }, [quickAddValues.accountId, accounts]);

  // Pre-fetch exchange rate when operationCurrency differs from account currency
  useEffect(() => {
    const account = accounts.find(a => a.id === quickAddValues.accountId);
    if (!account || !quickAddValues.operationCurrency) return;
    if (quickAddValues.operationCurrency === account.currency) {
      setForeignRateSource(null);
      setForeignExchangeRate('');
      return;
    }
    let cancelled = false;
    setForeignRateSource('loading');
    setForeignExchangeRate('');
    Currency.fetchLiveExchangeRate(quickAddValues.operationCurrency, account.currency)
      .then(({ rate, source }) => {
        if (cancelled) return;
        if (rate) {
          setForeignExchangeRate(rate);
          setForeignRateSource(source);
        } else {
          const offlineRate = Currency.getExchangeRate(quickAddValues.operationCurrency, account.currency);
          if (offlineRate) {
            setForeignExchangeRate(String(offlineRate));
            setForeignRateSource('offline');
          } else {
            setForeignRateSource(null);
          }
        }
      })
      .catch(() => {
        if (cancelled) return;
        const offlineRate = Currency.getExchangeRate(quickAddValues.operationCurrency, account.currency);
        if (offlineRate) {
          setForeignExchangeRate(String(offlineRate));
          setForeignRateSource('offline');
        } else {
          setForeignRateSource(null);
        }
      });
    return () => { cancelled = true; };
  }, [quickAddValues.operationCurrency, quickAddValues.accountId, accounts]);

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

  const loadSuggestions = useCallback(async () => {
    try {
      const topCats = await OperationsDB.getTopCategoriesFromLastMonth(10);
      setTopCategories(topCats);
    } catch (error) {
      console.error('Failed to load top categories:', error);
      setTopCategories([]);
    }
    try {
      const targets = await OperationsDB.getTopTransferTargetAccounts(10);
      setTopTransferTargets(targets);
    } catch (error) {
      console.error('Failed to load top transfer targets:', error);
      setTopTransferTargets([]);
    }
  }, []);

  useEffect(() => {
    loadSuggestions();
  }, [loadSuggestions]);

  useEffect(() => {
    const unsubscribe = appEvents.on(EVENTS.OPERATION_CHANGED, loadSuggestions);
    return unsubscribe;
  }, [loadSuggestions]);

  useEffect(() => {
    const unsubscribe = appEvents.on(EVENTS.RELOAD_ALL, loadSuggestions);
    return unsubscribe;
  }, [loadSuggestions]);

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

  // Get top 8 categories matching current operation type (expense/income)
  // Fills remaining slots with leaf categories by id order when history has fewer than 8
  const topCategoriesForType = useMemo(() => {
    if (quickAddValues.type === 'transfer') return [];

    // Filter top categories to match current type and exclude shadow categories
    const fromHistory = topCategories
      .map(tc => categories.find(cat => cat.id === tc.categoryId))
      .filter(cat => cat && cat.categoryType === quickAddValues.type && !cat.isShadow && cat.type !== 'folder')
      .slice(0, 8);

    if (fromHistory.length >= 8) return fromHistory;

    // Fill remaining slots from leaf categories by id order, excluding already-selected
    const historyIds = new Set(fromHistory.map(cat => cat.id));
    const fillers = categories
      .filter(cat => cat.categoryType === quickAddValues.type && !cat.isShadow && cat.type !== 'folder' && !historyIds.has(cat.id))
      .slice(0, 8 - fromHistory.length);

    return [...fromHistory, ...fillers];
  }, [topCategories, categories, quickAddValues.type]);

  // Get top transfer target accounts, filtered to existing accounts excluding current source
  const topTransferAccountsForForm = useMemo(() => {
    if (quickAddValues.type !== 'transfer') return [];

    const sourceId = quickAddValues.accountId;

    // Filter history targets to accounts that still exist and aren't the source
    const fromHistory = topTransferTargets
      .map(tt => accounts.find(acc => acc.id === tt.accountId))
      .filter(acc => acc && acc.id !== sourceId)
      .slice(0, 8);

    if (fromHistory.length >= 8) return fromHistory;

    // Fill remaining slots from visible accounts excluding source and already-included
    const historyIds = new Set(fromHistory.map(acc => acc.id));
    const fillers = visibleAccounts
      .filter(acc => acc.id !== sourceId && !historyIds.has(acc.id))
      .slice(0, 8 - fromHistory.length);

    return [...fromHistory, ...fillers];
  }, [topTransferTargets, accounts, visibleAccounts, quickAddValues.type, quickAddValues.accountId]);

  // Reset form but keep account and type; restore operationCurrency to account currency
  const resetForm = useCallback(() => {
    setQuickAddValues(prev => {
      const acc = accounts.find(a => a.id === prev.accountId);
      return {
        type: prev.type,
        amount: '',
        accountId: prev.accountId,
        categoryId: '',
        description: '',
        toAccountId: '',
        exchangeRate: '',
        destinationAmount: '',
        operationCurrency: acc?.currency || prev.operationCurrency,
      };
    });
    setForeignRateSource(null);
    setForeignExchangeRate('');
  }, [accounts]);

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
    foreignRateSource,
    foreignExchangeRate,
  };
};

export default useQuickAddForm;
