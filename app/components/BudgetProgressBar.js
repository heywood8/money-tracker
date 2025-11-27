import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Text } from 'react-native-paper';
import { useTheme } from '../ThemeContext';
import { useLocalization } from '../LocalizationContext';
import { useBudgets } from '../BudgetsContext';

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

  // Format currency amounts
  const formatAmount = (amount) => {
    return typeof amount === 'number' ? amount.toFixed(2) : '0.00';
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
            }
          ]}
        />
      </View>

      {/* Details */}
      {showDetails && (
        <View style={styles.details}>
          <Text variant={compact ? 'bodySmall' : 'bodyMedium'} style={{ color: colors.text }}>
            {formatAmount(status.spent)} / {status.amount}
          </Text>
          <Text
            variant={compact ? 'bodySmall' : 'bodyMedium'}
            style={{ color: status.isExceeded ? '#F44336' : colors.mutedText }}
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
            style={{
              color: status.isExceeded ? '#F44336' : colors.mutedText,
              fontWeight: '500',
            }}
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
  progressTrack: {
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 3,
  },
  details: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
    paddingHorizontal: 2,
  },
  percentageContainer: {
    position: 'absolute',
    right: 0,
    top: -2,
  },
});

export default BudgetProgressBar;
