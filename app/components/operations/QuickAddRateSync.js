import { useEffect, useRef } from 'react';
import PropTypes from 'prop-types';
import * as Currency from '../../services/currency';
import { hasOperation } from '../../utils/calculatorUtils';
import { useQuickAddValues } from '../../hooks/useQuickAddValuesStore';

/**
 * QuickAddRateSync — headless.
 *
 * Keeps a cross-currency transfer's exchange rate and destination amount in step
 * with whatever the user is typing. These three effects used to sit in
 * OperationsScreen, where their dependence on the typed fields (amount, exchange
 * rate, destination amount) forced the whole screen to re-render on every
 * keystroke. They live here so only this component — which renders nothing —
 * wakes up for a character.
 *
 * Renders null on purpose: it is an effect host, mounted inside the quick-add
 * subtree so it unmounts with the form.
 */
const QuickAddRateSync = ({
  valuesStore,
  setValues,
  isMultiCurrencyTransfer,
  sourceAccount,
  destinationAccount,
  lastEditedField,
  setLastEditedField,
  setRateSource,
}) => {
  const values = useQuickAddValues(valuesStore);

  // Clear a stale exchange rate when the transfer's currency PAIR changes (e.g.
  // destination switched from a EUR account to an AMD account). The auto-populate
  // effect below only fires when exchangeRate is empty, so without this reset the
  // old pair's rate would be applied to the new pair.
  const ratePairRef = useRef(null);
  useEffect(() => {
    if (!isMultiCurrencyTransfer || !sourceAccount || !destinationAccount) {
      ratePairRef.current = null;
      return;
    }
    const pair = `${sourceAccount.currency}:${destinationAccount.currency}`;
    if (ratePairRef.current && ratePairRef.current !== pair && values.exchangeRate) {
      setValues(v => ({ ...v, exchangeRate: '', destinationAmount: '' }));
      setLastEditedField(null);
    }
    ratePairRef.current = pair;
  }, [isMultiCurrencyTransfer, sourceAccount, destinationAccount, values.exchangeRate, setValues, setLastEditedField]);

  // Auto-populate exchange rate when multi-currency transfer accounts change (async with live rate)
  useEffect(() => {
    if (!isMultiCurrencyTransfer || !sourceAccount || !destinationAccount || values.exchangeRate) {
      return;
    }

    let cancelled = false;
    setRateSource('loading');

    Currency.fetchLiveExchangeRate(sourceAccount.currency, destinationAccount.currency)
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
        const rate = Currency.getExchangeRate(sourceAccount.currency, destinationAccount.currency);
        if (rate) {
          setValues(v => ({ ...v, exchangeRate: rate }));
          setLastEditedField('exchangeRate');
        }
        setRateSource('offline');
      });

    return () => { cancelled = true; };
  }, [isMultiCurrencyTransfer, sourceAccount, destinationAccount, values.exchangeRate, setValues, setLastEditedField, setRateSource]);

  // Auto-calculate multi-currency fields based on which field was last edited
  useEffect(() => {
    if (!isMultiCurrencyTransfer) {
      // Clear exchange rate fields for same-currency transfers
      if (values.exchangeRate || values.destinationAmount) {
        setValues(v => ({ ...v, exchangeRate: '', destinationAmount: '' }));
        setLastEditedField(null);
      }
      return;
    }

    if (!sourceAccount || !destinationAccount) return;

    // If user edited destination amount, calculate the rate
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
    // If user edited amount or rate, calculate destination amount.
    // Skip while the amount holds an unevaluated calculator expression ("10+5"):
    // convertAmount would coerce it to 0 and persist destinationAmount "0.00".
    else if (lastEditedField === 'amount' || lastEditedField === 'exchangeRate') {
      if (values.amount && values.exchangeRate && !hasOperation(values.amount)) {
        const converted = Currency.convertAmount(
          values.amount,
          sourceAccount.currency,
          destinationAccount.currency,
          values.exchangeRate,
        );
        if (converted && converted !== values.destinationAmount) {
          setValues(v => ({ ...v, destinationAmount: converted }));
        }
      }
    }
  }, [
    isMultiCurrencyTransfer,
    values.amount,
    values.exchangeRate,
    values.destinationAmount,
    sourceAccount,
    destinationAccount,
    lastEditedField,
    setValues,
    setLastEditedField,
  ]);

  return null;
};

QuickAddRateSync.propTypes = {
  valuesStore: PropTypes.object.isRequired,
  setValues: PropTypes.func.isRequired,
  isMultiCurrencyTransfer: PropTypes.bool,
  sourceAccount: PropTypes.object,
  destinationAccount: PropTypes.object,
  lastEditedField: PropTypes.string,
  setLastEditedField: PropTypes.func.isRequired,
  setRateSource: PropTypes.func.isRequired,
};

export default QuickAddRateSync;
