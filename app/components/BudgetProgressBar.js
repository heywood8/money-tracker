import React from 'react';
import PropTypes from 'prop-types';
import { View, StyleSheet } from 'react-native';
import { Text } from 'react-native-paper';
import { useTheme } from '../contexts/ThemeContext';
import { useLocalization } from '../contexts/LocalizationContext';
import { useBudgets } from '../contexts/BudgetsContext';
import * as Currency from '../services/currency';

const BudgetProgressBar = ({ budgetId, compact = false, showDetails = true, style }) => {
  const { colors } = useTheme();
  const { t } = useLocalization();
  const { getBudgetStatus } = useBudgets();

  const status = getBudgetStatus(budgetId);

  if (!status) return null;

  // Determine progress bar color based on status
  const getProgressColor = () => {
    switch (status.status) {
    case 'safe':
      return '#4CAF50'; // Green
    case 'warning':
      return '#FFC107'; // Yellow/Amber
    case 'danger':
      return '#FF9800'; // Orange
    case 'exceeded':
      return '#F44336'; // Red
    default:
      return colors.primary;
    }
  };

  const progressColor = getProgressColor();
  const progressWidth = Math.min(status.percentage, 100);

  // Format currency amounts with proper decimal places
  const formatAmount = (amount) => {
    return Currency.formatAmount(amount, status.currency || 'USD');
  };

  return (
    <View style={[styles.container, style]}>
      {/* Progress Bar */}
      <View style={[styles.progressTrack, { backgroundColor: colors.border }]}> 
        <View
          style={[
            styles.progressFill,
            {
              width: `${progressWidth}%`,
              backgroundColor: progressColor,
            },
          ]}
        />
      </View>

      {/* Details */}
      {showDetails && (
        <View style={styles.details}>
          <Text variant={compact ? 'bodySmall' : 'bodyMedium'} style={[styles.detailsText, { color: colors.text }]}> 
            {formatAmount(status.spent)} / {status.amount}
          </Text>
          <Text
            variant={compact ? 'bodySmall' : 'bodyMedium'}
            style={[
              styles.detailsAmount,
              status.isExceeded ? styles.exceededText : { color: colors.mutedText },
            ]}
          >
            {status.isExceeded
              ? `${t('over_budget_by')} ${formatAmount(Math.abs(status.remaining))}`
              : `${t('remaining_budget')}: ${formatAmount(status.remaining)}`
            }
          </Text>
        </View>
      )}

      {/* Percentage Badge (for compact mode) */}
      {compact && (
        <View style={styles.percentageContainer}>
          <Text
            variant="bodySmall"
            style={[
              styles.percentageText,
              status.isExceeded ? styles.exceededText : { color: colors.mutedText },
            ]}
          >
            {Math.round(status.percentage)}%
          </Text>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginVertical: 4,
  },
  details: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
    paddingHorizontal: 2,
  },
  detailsAmount: {
    // color set dynamically
  },
  detailsText: {
    // color set dynamically
  },
  exceededText: {
    color: '#F44336',
  },
  percentageContainer: {
    position: 'absolute',
    right: 0,
    top: -2,
  },
  percentageText: {
    fontWeight: '500',
    // color set dynamically
  },
  progressFill: {
    borderRadius: 3,
    height: '100%',
  },
  progressTrack: {
    borderRadius: 3,
    height: 6,
    overflow: 'hidden',
  },
});

BudgetProgressBar.propTypes = {
  budgetId: PropTypes.string.isRequired,
  compact: PropTypes.bool,
  showDetails: PropTypes.bool,
  style: PropTypes.any,
};

export default BudgetProgressBar;
