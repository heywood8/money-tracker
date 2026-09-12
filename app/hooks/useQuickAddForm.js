import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { getLastAccessedAccount } from '../services/LastAccount';
import { getDefaultAccountId } from '../services/PreferencesDB';
import { getCategoryDisplayName, getCategoryNames } from '../utils/categoryUtils';
import * as Currency from '../services/currency';
import * as OperationsDB from '../services/OperationsDB';
import { appEvents, EVENTS } from '../services/eventEmitter';
import useTopCategoryIds from './useTopCategoryIds';
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

  // Refs mirroring the latest props/state so the default-account effect below can
  // read them without depending on their identity (same pattern as `accountsRef` in
  // AccountsActionsContext). Declared first so this sync runs before that effect in
  // every commit.
  const visibleAccountsRef = useRef(visibleAccounts);
  const selectedAccountIdRef = useRef(quickAddValues.accountId);
  useEffect(() => {
    visibleAccountsRef.current = visibleAccounts;
    selectedAccountIdRef.current = quickAddValues.accountId;
  });

  // `visibleAccounts` is a brand-new array after every reloadAccounts() — i.e. after
  // every operation add/update/delete, every RELOAD_ALL and every balance edit — so
  // keying the effect on the array identity re-ran it mid-entry and overwrote the
  // account the user had deliberately picked. Key it on the ids instead.
  const visibleAccountIdsKey = useMemo(
    () => visibleAccounts.map(acc => acc.id).join('|'),
    [visibleAccounts],
  );

  // Pick a default account on mount, and again only when the set of visible accounts
  // no longer contains the current pick (e.g. that account was hidden or deleted).
  useEffect(() => {
    let cancelled = false;
    async function setDefaultAccount() {
      const currentAccounts = visibleAccountsRef.current;
      const chosenId = selectedAccountIdRef.current;

      // The user's choice is still available — leave it (and operationCurrency) alone.
      if (chosenId && currentAccounts.some(acc => acc.id === chosenId)) return;

      if (currentAccounts.length === 1) {
        const acc = currentAccounts[0];
        setQuickAddValues(v => ({ ...v, accountId: acc.id, operationCurrency: acc.currency || v.operationCurrency }));
      } else if (currentAccounts.length > 1) {
        const defaultId = await getDefaultAccountId();
        if (cancelled) return;
        let resolvedAcc;
        if (defaultId && currentAccounts.some(acc => acc.id === defaultId)) {
          resolvedAcc = currentAccounts.find(acc => acc.id === defaultId);
        } else {
          const lastId = await getLastAccessedAccount();
          if (cancelled) return;
          if (lastId && currentAccounts.some(acc => acc.id === lastId)) {
            resolvedAcc = currentAccounts.find(acc => acc.id === lastId);
          } else {
            resolvedAcc = currentAccounts.slice().sort((a, b) => (a.id < b.id ? -1 : 1))[0];
          }
        }
        setQuickAddValues(v => ({ ...v, accountId: resolvedAcc.id, operationCurrency: resolvedAcc.currency || v.operationCurrency }));
      }
    }
    setDefaultAccount();
    return () => { cancelled = true; };
  }, [visibleAccountIdsKey]);

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

  // Get account name. Falls back to a neutral dash rather than an untranslated
  // "Unknown", which the accounts still being loaded would otherwise print.
  const getAccountName = useCallback((accountId) => {
    const account = accounts.find(acc => acc.id === accountId);
    return account ? account.name : '—';
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

  // Top most used categories (fetch extra to account for type filtering). Shared
  // with every other consumer of the same history signal — this hook used to
  // issue getTopCategoriesFromLastMonth(10) itself, so the Operations screen ran
  // the identical query twice on mount and again on every operation change.
  const topCategoryIds = useTopCategoryIds(10);

  // Top transfer target accounts from last 90 days
  const [topTransferTargets, setTopTransferTargets] = useState([]);

  const loadSuggestions = useCallback(async () => {
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
    const fromHistory = topCategoryIds
      .map(id => categories.find(cat => cat.id === id))
      .filter(cat => cat && cat.categoryType === quickAddValues.type && !cat.isShadow && cat.type !== 'folder')
      .slice(0, 8);

    if (fromHistory.length >= 8) return fromHistory;

    // Fill remaining slots from leaf categories by id order, excluding already-selected
    const historyIds = new Set(fromHistory.map(cat => cat.id));
    const fillers = categories
      .filter(cat => cat.categoryType === quickAddValues.type && !cat.isShadow && cat.type !== 'folder' && !historyIds.has(cat.id))
      .slice(0, 8 - fromHistory.length);

    return [...fromHistory, ...fillers];
  }, [topCategoryIds, categories, quickAddValues.type]);

  // Get top transfer target accounts. The candidate pool is exactly what the form
  // lets the user pick — visible accounts minus the source — and history only
  // decides their order. Resolving history against the full account list used to
  // let hidden accounts occupy suggestion slots, pushing pickable accounts out of
  // a grid that the "all accounts" fallback then thought was already complete.
  const topTransferAccountsForForm = useMemo(() => {
    if (quickAddValues.type !== 'transfer') return [];

    const sourceId = quickAddValues.accountId;
    const selectable = visibleAccounts.filter(acc => acc.id !== sourceId);

    // Order history targets that are still selectable, most used first
    const fromHistory = topTransferTargets
      .map(tt => selectable.find(acc => acc.id === tt.accountId))
      .filter(Boolean)
      .slice(0, 8);

    if (fromHistory.length >= 8) return fromHistory;

    // Fill remaining slots from the rest of the selectable accounts
    const historyIds = new Set(fromHistory.map(acc => acc.id));
    const fillers = selectable
      .filter(acc => !historyIds.has(acc.id))
      .slice(0, 8 - fromHistory.length);

    return [...fromHistory, ...fillers];
  }, [topTransferTargets, visibleAccounts, quickAddValues.type, quickAddValues.accountId]);

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
