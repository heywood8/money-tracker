import React from 'react';
import { View, Text, TextInput, StyleSheet, Keyboard } from 'react-native';
import PropTypes from 'prop-types';
import { MaterialCommunityIcons as Icon } from '@expo/vector-icons';
import { SPACING } from '../../styles/designTokens';
import currencies from '../../../assets/currencies.json';
import * as Currency from '../../services/currency';

/**
 * Get currency symbol from currency code
 * @param {string} currencyCode - Currency code like 'USD', 'EUR', etc.
 * @returns {string} Currency symbol or code if not found
 */
const getCurrencySymbol = (currencyCode) => {
  if (!currencyCode) return '';
  const currency = currencies[currencyCode];
  return currency ? currency.symbol : currencyCode;
};

const MultiCurrencyFields = ({
  colors,
  t,
  sourceAccount,
  destinationAccount,
  exchangeRate,
  destinationAmount,
  isShadowOperation,
  onExchangeRateChange,
  onDestinationAmountChange,
}) => {
  return (
    <>
      {/* Currency info display */}
      <View style={styles.currencyInfo}>
        <Icon name="swap-horizontal-circle" size={16} color={colors.mutedText} />
        <Text style={[styles.currencyInfoText, { color: colors.mutedText }]}>
          {getCurrencySymbol(sourceAccount.currency)} → {getCurrencySymbol(destinationAccount.currency)}
        </Text>
      </View>

      {/* Exchange Rate Input */}
      <View style={styles.inputRow}>
        <Text style={[styles.inputLabel, { color: colors.text }]}>
          {t('exchange_rate')}:
        </Text>
        <TextInput
          style={[
            styles.smallInput,
            { color: colors.text, backgroundColor: colors.inputBackground, borderColor: colors.inputBorder },
            isShadowOperation && styles.disabledInput,
          ]}
          value={exchangeRate}
          onChangeText={onExchangeRateChange}
          placeholder="0.00"
          placeholderTextColor={colors.mutedText}
          keyboardType="decimal-pad"
          returnKeyType="done"
          onSubmitEditing={Keyboard.dismiss}
          editable={!isShadowOperation}
        />
      </View>

      {/* Destination Amount Input */}
      <View style={styles.inputRow}>
        <Text style={[styles.inputLabel, { color: colors.text }]}>
          {t('destination_amount')}:
        </Text>
        <TextInput
          style={[
            styles.smallInput,
            { color: colors.text, backgroundColor: colors.inputBackground, borderColor: colors.inputBorder },
            isShadowOperation && styles.disabledInput,
          ]}
          value={destinationAmount}
          onChangeText={onDestinationAmountChange}
          placeholder="0.00"
          placeholderTextColor={colors.mutedText}
          keyboardType="decimal-pad"
          returnKeyType="done"
          onSubmitEditing={Keyboard.dismiss}
          editable={!isShadowOperation}
        />
        <Text style={[styles.currencyLabel, { color: colors.mutedText }]}>
          {getCurrencySymbol(destinationAccount.currency)}
        </Text>
      </View>

      {/* Exchange rate source info */}
      <Text style={[styles.rateInfo, { color: colors.mutedText }]}>
        {t('offline_rate_info')} ({Currency.getExchangeRatesLastUpdated()})
      </Text>
    </>
  );
};

MultiCurrencyFields.propTypes = {
  colors: PropTypes.object.isRequired,
  t: PropTypes.func.isRequired,
  sourceAccount: PropTypes.shape({
    currency: PropTypes.string.isRequired,
  }).isRequired,
  destinationAccount: PropTypes.shape({
    currency: PropTypes.string.isRequired,
  }).isRequired,
  exchangeRate: PropTypes.string.isRequired,
  destinationAmount: PropTypes.string.isRequired,
  isShadowOperation: PropTypes.bool,
  onExchangeRateChange: PropTypes.func.isRequired,
  onDestinationAmountChange: PropTypes.func.isRequired,
};

const styles = StyleSheet.create({
  currencyInfo: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: SPACING.sm,
    marginBottom: SPACING.sm,
    paddingHorizontal: SPACING.xs,
  },
  currencyInfoText: {
    fontSize: 14,
    fontWeight: '500',
  },
  currencyLabel: {
    fontSize: 14,
    minWidth: 40,
  },
  disabledInput: {
    opacity: 0.5,
  },
  inputLabel: {
    fontSize: 14,
    minWidth: 120,
  },
  inputRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: SPACING.sm,
    marginBottom: SPACING.sm,
  },
  rateInfo: {
    fontSize: 12,
    marginBottom: SPACING.sm,
    marginTop: SPACING.xs,
    paddingHorizontal: SPACING.xs,
    textAlign: 'center',
  },
  smallInput: {
    borderRadius: 8,
    borderWidth: 1,
    flex: 1,
    fontSize: 16,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
  },
});

export default MultiCurrencyFields;
