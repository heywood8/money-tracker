import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Keyboard } from 'react-native';
import { formatDate } from '../services/BalanceHistoryDB';
import { getLastAccessedAccount, setLastAccessedAccount } from '../services/LastAccount';
import { getCategoryDisplayName } from '../utils/categoryUtils';
import { hasOperation, evaluateExpression } from '../utils/calculatorUtils';
import * as Currency from '../services/currency';
import currencies from '../../assets/currencies.json';

const getCurrencySymbol = (currencyCode) => {
  if (!currencyCode) return '';
  const currency = currencies[currencyCode];
  return currency ? currency.symbol : currencyCode;
};

/**
 * Custom hook for managing operation modal form state and logic
 * Handles form initialization, validation, save/delete operations, and shadow category checks
 */
const useOperationForm = ({
  visible,
  operation,
  isNew,
  accounts,
  categories,
  t,
  addOperation,
  updateOperation,
  validateOperation,
  showDialog,
  onClose,
  onDelete,
}) => {
  // Form state
  const [values, setValues] = useState({
    type: 'expense',
    amount: '',
    accountId: '',
    categoryId: '',
    date: formatDate(new Date()),
    toAccountId: '',
    exchangeRate: '',
    destinationAmount: '',
    operationCurrency: '',
  });
  const [errors, setErrors] = useState({});
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [lastEditedField, setLastEditedField] = useState(null);
  const [rateSource, setRateSource] = useState('offline');

  // rateSource is shared for both multicurrency transfers and foreign currency ops

  // Track if form has been initialized to prevent re-initialization from overwriting user changes.
  // Set to true right after first initialization; reset to false when the modal closes.
  // This guards against accounts/operation prop getting a new reference from a context update
  // while the user is actively editing (e.g. typing description while accounts reload).
  const formModifiedRef = useRef(false);

  // Keep a stable ref to the latest accounts so the initialization effect can read the
  // current list without depending on it — preventing a re-run when accounts changes.
  const accountsRef = useRef(accounts);
  accountsRef.current = accounts;

  // Check if operation belongs to a shadow category
  const isShadowOperation = useMemo(() => {
    if (!operation || !operation.categoryId) return false;
    const category = categories.find(cat => cat.id === operation.categoryId);
    return category?.isShadow || false;
  }, [operation, categories]);

  // Check if operation date is today (for shadow operations)
  const isOperationToday = useMemo(() => {
    if (!operation) return false;
    const today = new Date().toISOString().split('T')[0];
    return operation.date === today;
  }, [operation]);

  // Shadow operations can only be deleted if they were made today
  const canDeleteShadowOperation = useMemo(() => {
    return !isShadowOperation || isOperationToday;
  }, [isShadowOperation, isOperationToday]);

  // Multi-currency transfer logic
  const sourceAccount = useMemo(() => {
    return accounts.find(acc => acc.id === values.accountId);
  }, [accounts, values.accountId]);

  const destinationAccount = useMemo(() => {
    return accounts.find(acc => acc.id === values.toAccountId);
  }, [accounts, values.toAccountId]);

  const isMultiCurrencyTransfer = useMemo(() => {
    if (values.type !== 'transfer') return false;
    if (!sourceAccount || !destinationAccount) return false;
    return sourceAccount.currency !== destinationAccount.currency;
  }, [values.type, sourceAccount, destinationAccount]);

  // Foreign currency expense/income: op entered in a currency different from the account currency
  const isForeignCurrencyOp = useMemo(() => {
    if (values.type === 'transfer') return false;
    if (!values.operationCurrency || !sourceAccount) return false;
    return values.operationCurrency !== sourceAccount.currency;
  }, [values.type, values.operationCurrency, sourceAccount]);

  // Auto-populate exchange rate when a multicurrency pair is detected and no rate is set yet.
  // Handles both multicurrency transfers and foreign currency expense/income ops.
  useEffect(() => {
    const forTransfer = isMultiCurrencyTransfer && sourceAccount && destinationAccount;
    const forForeignOp = isForeignCurrencyOp && sourceAccount && values.operationCurrency;

    if ((!forTransfer && !forForeignOp) || values.exchangeRate) {
      return;
    }

    const fromCurrency = forForeignOp ? values.operationCurrency : sourceAccount.currency;
    const toCurrency = forForeignOp ? sourceAccount.currency : destinationAccount?.currency;
    if (!fromCurrency || !toCurrency) return;

    let cancelled = false;
    setRateSource('loading');

    Currency.fetchLiveExchangeRate(fromCurrency, toCurrency)
      .then(({ rate, source }) => {
        if (cancelled) return;
        if (rate) {
          setValues(v => ({ ...v, exchangeRate: rate }));
          setLastEditedField('exchangeRate');
        }
        setRateSource(source === 'live' ? 'live' : 'offline');
      })
      .catch(() => {
        if (cancelled) return;
        const rate = Currency.getExchangeRate(fromCurrency, toCurrency);
        if (rate) {
          setValues(v => ({ ...v, exchangeRate: rate }));
          setLastEditedField('exchangeRate');
        }
        setRateSource('offline');
      });

    return () => { cancelled = true; };
  }, [isMultiCurrencyTransfer, isForeignCurrencyOp, sourceAccount, destinationAccount, values.exchangeRate, values.operationCurrency]);

  // Auto-calculate exchange rate / destination amount based on which field was last edited.
  // Handles both multicurrency transfers and foreign currency expense/income ops.
  useEffect(() => {
    if (!isMultiCurrencyTransfer && !isForeignCurrencyOp) {
      // Clear exchange rate fields only for plain same-currency ops
      if (values.exchangeRate || values.destinationAmount) {
        setValues(v => ({ ...v, exchangeRate: '', destinationAmount: '' }));
        setLastEditedField(null);
      }
      return;
    }

    // Determine currency pair
    const fromCurrency = isForeignCurrencyOp ? values.operationCurrency : sourceAccount?.currency;
    const toCurrency = isForeignCurrencyOp ? sourceAccount?.currency : destinationAccount?.currency;
    if (!fromCurrency || !toCurrency) return;

    // If user edited destination amount, back-calculate the rate
    if (lastEditedField === 'destinationAmount') {
      if (values.amount && values.destinationAmount) {
        const sourceAmount = parseFloat(values.amount);
        const destAmount = parseFloat(values.destinationAmount);

        if (!isNaN(sourceAmount) && !isNaN(destAmount) && sourceAmount > 0) {
          const calculatedRate = (destAmount / sourceAmount).toFixed(6);
          const currentRate = parseFloat(values.exchangeRate || '0');
          const newRate = parseFloat(calculatedRate);
          if (Math.abs(currentRate - newRate) > 0.000001) {
            setValues(v => ({ ...v, exchangeRate: calculatedRate }));
          }
        }
      }
    }
    // If user edited amount or rate, calculate destination amount
    else if (lastEditedField === 'amount' || lastEditedField === 'exchangeRate') {
      if (values.amount && values.exchangeRate) {
        const converted = Currency.convertAmount(
          values.amount,
          fromCurrency,
          toCurrency,
          values.exchangeRate,
        );
        if (converted && converted !== values.destinationAmount) {
          setValues(v => ({ ...v, destinationAmount: converted }));
        }
      }
    }
  }, [isMultiCurrencyTransfer, isForeignCurrencyOp, values.amount, values.exchangeRate, values.destinationAmount, values.operationCurrency, sourceAccount, destinationAccount, lastEditedField]);

  // Clear category when switching between expense and income to avoid mismatched categories
  useEffect(() => {
    // Only run when modal is visible (avoid interfering while modal closed)
    if (!visible) return;

    setValues(v => {
      // If switching to transfer already handled elsewhere
      if (v.type === 'transfer') return v;

      // If current category exists but doesn't match new type, clear it
      const cat = categories.find(c => c.id === v.categoryId);
      if (v.categoryId && cat && cat.categoryType !== v.type) {
        return { ...v, categoryId: '' };
      }
      return v;
    });
  }, [values.type, visible, categories]);

  // Initialize form values when modal opens
  useEffect(() => {
    if (!visible) {
      // Reset the guard when modal closes so next open will initialize properly
      formModifiedRef.current = false;
      return;
    }

    // Once initialized, skip any re-runs caused by prop reference changes (e.g. accounts
    // getting a new array reference after a context update while the user is editing).
    if (formModifiedRef.current) {
      return;
    }

    let cancelled = false;
    async function setDefaultAccount() {
      // Read accounts via ref so this effect does not depend on the accounts array —
      // preventing re-initialization whenever the context emits a new reference.
      const currentAccounts = accountsRef.current;
      if (operation && !isNew) {
        // Normalize values when editing an existing operation
        setValues({
          type: operation.type || 'expense',
          amount: String(operation.amount || ''),
          accountId: operation.accountId || currentAccounts[0]?.id || '',
          categoryId: operation.categoryId || '',
          description: operation.description || '',
          date: operation.date || formatDate(new Date()),
          toAccountId: operation.toAccountId || '',
          exchangeRate: String(operation.exchangeRate || ''),
          destinationAmount: String(operation.destinationAmount || ''),
          operationCurrency: operation.type !== 'transfer' ? (operation.sourceCurrency || '') : '',
        });
      } else if (isNew) {
        let defaultAccountId = '';
        if (currentAccounts.length === 1) {
          defaultAccountId = currentAccounts[0].id;
        } else if (currentAccounts.length > 1) {
          const lastId = await getLastAccessedAccount();
          if (lastId && currentAccounts.some(acc => acc.id === lastId)) {
            defaultAccountId = lastId;
          } else {
            defaultAccountId = currentAccounts.slice().sort((a, b) => (a.id < b.id ? -1 : 1))[0].id;
          }
        }
        if (!cancelled) {
          setValues({
            type: 'expense',
            amount: '',
            accountId: defaultAccountId,
            categoryId: '',
            description: '',
            date: formatDate(new Date()),
            toAccountId: '',
            exchangeRate: '',
            destinationAmount: '',
          });
        }
      }
      if (!cancelled) {
        setErrors({});
        // Mark as initialized so that any subsequent dep-change (new object reference for
        // operation or accounts from a context update) does not wipe the user's edits.
        formModifiedRef.current = true;
      }
    }
    setDefaultAccount();
    return () => { cancelled = true; };
  }, [operation, isNew, visible]); // accounts intentionally omitted — accessed via accountsRef

  // Validate form fields
  const validateFields = useCallback((valuesToValidate = null) => {
    const vals = valuesToValidate || values;
    const newErrors = {};

    if (!vals.type) {
      newErrors.type = t('operation_type_required');
    }

    if (!vals.amount || isNaN(parseFloat(vals.amount)) || parseFloat(vals.amount) <= 0) {
      newErrors.amount = t('valid_amount_required');
    }

    if (!vals.accountId) {
      newErrors.accountId = t('account_required');
    }

    if (vals.type === 'transfer') {
      if (!vals.toAccountId) {
        newErrors.toAccountId = t('destination_account_required');
      } else if (vals.accountId === vals.toAccountId) {
        newErrors.toAccountId = t('accounts_must_be_different');
      }
    } else if (!vals.categoryId) {
      newErrors.categoryId = t('category_required');
    }

    if (!vals.date) {
      newErrors.date = t('date_required');
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [values, t]);

  // Prepare operation data with currency information for saving
  const prepareOperationData = useCallback((customAmount = null) => {
    const data = { ...values };

    // Override amount if provided (used when evaluating expressions)
    if (customAmount !== null) {
      data.amount = customAmount;
    }

    if (isMultiCurrencyTransfer && sourceAccount && destinationAccount) {
      data.sourceCurrency = sourceAccount.currency;
      data.destinationCurrency = destinationAccount.currency;
    } else if (isForeignCurrencyOp && sourceAccount && values.operationCurrency) {
      data.sourceCurrency = values.operationCurrency;
      data.destinationCurrency = sourceAccount.currency;
    }

    // Ensure amount is preserved when editing
    if (!isNew && !data.amount && operation?.amount) {
      data.amount = String(operation.amount);
    }

    // Format amounts based on currency decimal places
    if (data.amount && sourceAccount) {
      data.amount = Currency.formatAmount(data.amount, sourceAccount.currency);
    }

    if (data.destinationAmount && destinationAccount) {
      data.destinationAmount = Currency.formatAmount(data.destinationAmount, destinationAccount.currency);
    }

    return data;
  }, [values, isMultiCurrencyTransfer, isForeignCurrencyOp, sourceAccount, destinationAccount, isNew, operation]);

  // Save operation (add or update)
  const handleSave = useCallback(async () => {
    // Automatically evaluate any pending math operation before saving
    let finalAmount = values.amount;
    if (hasOperation(values.amount)) {
      const evaluated = evaluateExpression(values.amount);
      if (evaluated !== null) {
        finalAmount = evaluated;
      }
    }

    // Create updated values with evaluated amount for validation
    const valuesToValidate = { ...values, amount: finalAmount };

    if (!validateFields(valuesToValidate)) {
      // Show a dialog with the validation error
      const error = validateOperation(valuesToValidate, t);
      if (error) {
        showDialog(t('error'), error, [{ text: 'OK' }]);
      }
      return;
    }

    // Update the state with evaluated amount
    setValues(v => ({ ...v, amount: finalAmount }));

    // Pass the evaluated amount to prepareOperationData
    const operationData = prepareOperationData(finalAmount);

    if (isNew) {
      await addOperation(operationData);
    } else {
      await updateOperation(operation.id, operationData);
    }

    // Save last accessed account
    if (operationData.accountId) {
      setLastAccessedAccount(operationData.accountId);
    }

    onClose();
  }, [values, validateFields, prepareOperationData, isNew, addOperation, updateOperation, operation, onClose, validateOperation, showDialog, t]);

  // Close modal
  const handleClose = useCallback(() => {
    Keyboard.dismiss();
    setErrors({});
    onClose();
  }, [onClose]);

  // Delete operation
  const handleDelete = useCallback(() => {
    if (onDelete && operation && canDeleteShadowOperation) {
      onDelete(operation);
      onClose();
    }
  }, [onDelete, operation, onClose, canDeleteShadowOperation]);

  // Helper: Get account name for display
  const getAccountName = useCallback((accountId) => {
    if (!accountId) return t('select_account');
    const account = accounts.find(acc => acc.id === accountId);
    return account ? account.name : t('select_account');
  }, [accounts, t]);

  // Helper: Get account balance with currency symbol
  const getAccountBalance = useCallback((accountId) => {
    const account = accounts.find(acc => acc.id === accountId);
    if (!account) return '';
    const symbol = getCurrencySymbol(account.currency);
    return `${symbol}${Currency.formatAmount(account.balance, account.currency)}`;
  }, [accounts]);

  // Helper: Get category name for display
  const getCategoryName = useCallback((categoryId) => {
    if (!categoryId) return t('select_category');
    const displayName = getCategoryDisplayName(categoryId, categories, t);
    return displayName || t('select_category');
  }, [categories, t]);

  // Helper: Format date for display
  const formatDateForDisplay = useCallback((isoDate) => {
    const date = new Date(isoDate);
    return date.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  }, []);

  // Filter categories by operation type and exclude shadow categories
  const filteredCategories = useMemo(() => {
    return categories.filter(cat => {
      if (values.type === 'transfer') return false;
      // Exclude shadow categories from selection
      if (cat.isShadow) return false;
      return cat.categoryType === values.type;
    });
  }, [categories, values.type]);

  // Split operation: create new operation with split amount and reduce original
  const handleSplit = useCallback(async (splitAmount, newCategoryId) => {
    if (!operation || isNew) {
      return { success: false, error: 'Cannot split new operations' };
    }

    const numSplitAmount = parseFloat(splitAmount);
    const numOriginalAmount = parseFloat(values.amount);

    // Validate split amount
    if (isNaN(numSplitAmount) || numSplitAmount <= 0) {
      return { success: false, error: t('valid_amount_required') };
    }

    if (numSplitAmount >= numOriginalAmount) {
      return { success: false, error: t('split_amount_error') };
    }

    try {
      // Calculate new amount for original operation
      const newAmount = String(numOriginalAmount - numSplitAmount);

      // formModifiedRef is already true (set during initialization) so the
      // initialization effect won't re-run when reloadAccounts triggers a re-render.
      // Set it explicitly here as a safety measure in case split is called very early.
      formModifiedRef.current = true;

      // 1. FIRST update original operation in database (reduces amount)
      // This must happen before addOperation, because addOperation calls
      // loadInitialOperations() which would reload the old amount otherwise
      await updateOperation(operation.id, {
        ...values,
        amount: newAmount,
      });

      // 2. THEN create new operation with split amount
      // When addOperation reloads operations, the original will already have reduced amount
      const newOperation = {
        type: values.type,
        amount: String(numSplitAmount),
        accountId: values.accountId,
        categoryId: newCategoryId,
        date: values.date,
        description: values.description || null,
      };
      await addOperation(newOperation);

      // 3. Update local form state AFTER both DB operations succeed
      setValues(v => ({ ...v, amount: newAmount }));

      return { success: true, newAmount };
    } catch (error) {
      console.error('[useOperationForm] Failed to split operation:', error);
      return { success: false, error: t('error') };
    }
  }, [operation, isNew, values, addOperation, updateOperation, t, setValues]);

  return {
    // State
    values,
    setValues,
    errors,
    showDatePicker,
    setShowDatePicker,
    lastEditedField,
    setLastEditedField,

    // Computed values
    isShadowOperation,
    canDeleteShadowOperation,
    filteredCategories,
    sourceAccount,
    destinationAccount,
    isMultiCurrencyTransfer,
    isForeignCurrencyOp,
    rateSource,
    setRateSource,

    // Handlers
    handleSave,
    handleClose,
    handleDelete,
    handleSplit,

    // Helpers
    getAccountName,
    getAccountBalance,
    getCategoryName,
    formatDateForDisplay,
    validateFields,
  };
};

export default useOperationForm;
