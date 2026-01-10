import { useState, useMemo, useEffect } from 'react';
import * as Currency from '../services/currency';

/**
 * Custom hook for managing multi-currency transfer logic
 * Handles exchange rate calculations and amount conversions
 */
const useMultiCurrencyTransfer = (quickAddValues, accounts) => {
  const [lastEditedField, setLastEditedField] = useState(null);

  // Get source and destination accounts for multi-currency detection
  const sourceAccount = useMemo(() => {
    return accounts.find(acc => acc.id === quickAddValues.accountId);
  }, [accounts, quickAddValues.accountId]);

  const destinationAccount = useMemo(() => {
    return accounts.find(acc => acc.id === quickAddValues.toAccountId);
  }, [accounts, quickAddValues.toAccountId]);

  // Check if this is a multi-currency transfer
  const isMultiCurrencyTransfer = useMemo(() => {
    if (quickAddValues.type !== 'transfer') return false;
    if (!sourceAccount || !destinationAccount) return false;
    return sourceAccount.currency !== destinationAccount.currency;
  }, [quickAddValues.type, sourceAccount, destinationAccount]);

  // Auto-populate exchange rate when accounts change
  useEffect(() => {
    if (isMultiCurrencyTransfer && sourceAccount && destinationAccount && !quickAddValues.exchangeRate) {
      const rate = Currency.getExchangeRate(sourceAccount.currency, destinationAccount.currency);
      if (rate) {
        // This effect needs to call the setQuickAddValues from the parent
        // We'll return this info so the parent can update
      }
    }
  }, [isMultiCurrencyTransfer, sourceAccount, destinationAccount, quickAddValues.exchangeRate]);

  // Calculate derived values for multi-currency transfers
  const calculateMultiCurrency = (values, lastEdited) => {
    if (!isMultiCurrencyTransfer) {
      // Clear exchange rate fields for same-currency transfers
      if (values.exchangeRate || values.destinationAmount) {
        return {
          ...values,
          exchangeRate: '',
          destinationAmount: '',
        };
      }
      return values;
    }

    if (!sourceAccount || !destinationAccount) return values;

    const result = { ...values };

    // If user edited destination amount, calculate the rate
    if (lastEdited === 'destinationAmount') {
      if (values.amount && values.destinationAmount) {
        const sourceAmount = parseFloat(values.amount);
        const destAmount = parseFloat(values.destinationAmount);

        if (!isNaN(sourceAmount) && !isNaN(destAmount) && sourceAmount > 0) {
          const calculatedRate = (destAmount / sourceAmount).toFixed(6);
          const currentRate = parseFloat(values.exchangeRate || '0');
          const newRate = parseFloat(calculatedRate);
          if (Math.abs(currentRate - newRate) > 0.000001) {
            result.exchangeRate = calculatedRate;
          }
        }
      }
    }
    // If user edited amount or rate, calculate destination amount
    else if (lastEdited === 'amount' || lastEdited === 'exchangeRate') {
      if (values.amount && values.exchangeRate) {
        const converted = Currency.convertAmount(
          values.amount,
          sourceAccount.currency,
          destinationAccount.currency,
          values.exchangeRate,
        );
        if (converted && converted !== values.destinationAmount) {
          result.destinationAmount = converted;
        }
      }
    }

    return result;
  };

  // Get initial exchange rate when accounts change
  const getInitialExchangeRate = () => {
    if (isMultiCurrencyTransfer && sourceAccount && destinationAccount) {
      const rate = Currency.getExchangeRate(sourceAccount.currency, destinationAccount.currency);
      return rate || '';
    }
    return '';
  };

  return {
    sourceAccount,
    destinationAccount,
    isMultiCurrencyTransfer,
    lastEditedField,
    setLastEditedField,
    calculateMultiCurrency,
    getInitialExchangeRate,
  };
};

export default useMultiCurrencyTransfer;
