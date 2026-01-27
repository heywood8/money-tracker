import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import PropTypes from 'prop-types';
import { MaterialCommunityIcons as Icon } from '@expo/vector-icons';
import currencies from '../../../assets/currencies.json';

const formatCurrency = (amount, currency) => {
  const currencyInfo = currencies[currency];
  const decimals = currencyInfo?.decimal_digits ?? 2;
  return `${parseFloat(amount).toFixed(decimals)} ${currency}`;
};

const SpendingPredictionCard = ({ colors, t, spendingPrediction, selectedCurrency, selectedAccount, accounts }) => {
  if (!spendingPrediction) {
    return null;
  }

  // Find the selected account name
  const selectedAccountData = selectedAccount && accounts
    ? accounts.find(acc => acc.id === selectedAccount)
    : null;

  return (
    <View style={[styles.predictionCard, { backgroundColor: colors.altRow, borderColor: colors.border }]}>
      <View style={styles.predictionHeader}>
        <View style={styles.predictionTitleContainer}>
          <Icon name="chart-line" size={24} color={colors.primary} />
          <Text style={[styles.predictionTitle, { color: colors.text }]}>
            {t('spending_prediction')}
          </Text>
        </View>
        {selectedAccountData && (
          <Text style={[styles.accountName, { color: colors.mutedText }]}>
            {selectedAccountData.name}
          </Text>
        )}
      </View>

      {/* Current vs Predicted */}
      <View style={styles.predictionStats}>
        <View style={styles.predictionStat}>
          <Text style={[styles.predictionStatLabel, { color: colors.mutedText }]}>
            {t('current_spending')}
          </Text>
          <Text style={[styles.predictionStatValue, { color: colors.expense || '#ff4444' }]}>
            {formatCurrency(spendingPrediction.currentSpending, selectedCurrency)}
          </Text>
        </View>
        <Icon name="arrow-right" size={20} color={colors.mutedText} style={styles.predictionArrow} />
        <View style={styles.predictionStat}>
          <Text style={[styles.predictionStatLabel, { color: colors.mutedText }]}>
            {t('predicted_spending')}
          </Text>
          <Text style={[styles.predictionStatValue, { color: colors.text }]}>
            {formatCurrency(spendingPrediction.predictedRemaining, selectedCurrency)}
          </Text>
        </View>
      </View>

      {/* Progress Bar */}
      <View style={styles.predictionProgressContainer}>
        <View style={[styles.predictionProgressTrack, { backgroundColor: colors.border }]}>
          <View
            style={[
              styles.predictionProgressBar,
              {
                width: `${Math.min(spendingPrediction.percentElapsed, 100)}%`,
                backgroundColor: colors.primary,
              },
            ]}
          />
        </View>
        <Text style={[styles.predictionProgressText, { color: colors.mutedText }]}>
          {spendingPrediction.daysElapsed} / {spendingPrediction.daysInMonth} {t('days_elapsed').toLowerCase()} • {t('daily_average')}: <Text style={[styles.dailyAverageValue, { color: colors.text }]}>{formatCurrency(spendingPrediction.dailyAverage, selectedCurrency)}</Text>
        </Text>
      </View>
    </View>
  );
};

SpendingPredictionCard.propTypes = {
  colors: PropTypes.object.isRequired,
  t: PropTypes.func.isRequired,
  spendingPrediction: PropTypes.shape({
    currentSpending: PropTypes.number,
    predictedRemaining: PropTypes.number,
    percentElapsed: PropTypes.number,
    daysElapsed: PropTypes.number,
    daysInMonth: PropTypes.number,
    dailyAverage: PropTypes.number,
  }),
  selectedCurrency: PropTypes.string.isRequired,
  selectedAccount: PropTypes.string,
  accounts: PropTypes.array,
};

const styles = StyleSheet.create({
  accountName: {
    fontSize: 12,
  },
  dailyAverageValue: {
    fontWeight: '600',
  },
  predictionArrow: {
    marginHorizontal: 8,
  },
  predictionCard: {
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 16,
    padding: 16,
  },
  predictionHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  predictionProgressBar: {
    borderRadius: 4,
    height: 8,
  },
  predictionProgressContainer: {
    marginBottom: 0,
  },
  predictionProgressText: {
    fontSize: 12,
    textAlign: 'center',
  },
  predictionProgressTrack: {
    borderRadius: 4,
    height: 8,
    marginBottom: 8,
  },
  predictionStat: {
    flex: 1,
  },
  predictionStatLabel: {
    fontSize: 12,
    marginBottom: 4,
  },
  predictionStatValue: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  predictionStats: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  predictionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  predictionTitleContainer: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
});

export default SpendingPredictionCard;
