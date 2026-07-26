import React from 'react';
import PropTypes from 'prop-types';
import { View, StyleSheet } from 'react-native';
import { Text } from 'react-native-paper';
import { useThemeColors } from '../contexts/ThemeColorsContext';
import { useLocalization } from '../contexts/LocalizationContext';
import * as Currency from '../services/currency';
import { SPACING } from '../styles/designTokens';

/**
 * Presentational spent-vs-amount progress bar shared by budgets (v1) and
 * monthly-plan lines (Budgets v2). Takes a ready status object — the shape
 * produced by BudgetsDB.calculateBudgetStatus / BudgetPlansDB.calculatePlanStatus
 * lines (with `actual` mapped to `spent`): { spent, amount, remaining,
 * percentage, isExceeded, status, currency }.
 */
const StatusProgressBar = ({ status, compact = false, showDetails = true, style }) => {
  const { colors } = useThemeColors();
  const { t } = useLocalization();

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
      {/* Progress bar, with the compact-mode percentage beside it rather than
          absolutely positioned over it — the old badge sat on the track's right
          end with no space reserved, so it overlapped both the bar and the
          details line below (worst where the right-hand detail is long). */}
      <View style={styles.trackRow}>
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
        {compact && (
          <Text
            variant="bodySmall"
            style={[
              styles.percentageText,
              status.isExceeded ? styles.exceededText : { color: colors.mutedText },
            ]}
          >
            {Math.round(status.percentage)}%
          </Text>
        )}
      </View>

      {/* Details */}
      {showDetails && (
        <View style={styles.details}>
          <Text variant={compact ? 'bodySmall' : 'bodyMedium'} style={[styles.detailsText, { color: colors.text }]}>
            {formatAmount(status.spent)} / {formatAmount(status.amount)}
          </Text>
          <Text
            variant={compact ? 'bodySmall' : 'bodyMedium'}
            style={[
              styles.detailsAmount,
              status.isExceeded ? styles.exceededText : { color: colors.mutedText },
            ]}
          >
            {status.isExceeded
              ? `${t('over_budget_by')} ${formatAmount(Currency.abs(status.remaining))}`
              : `${t('remaining_budget')}: ${formatAmount(status.remaining)}`
            }
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
  percentageText: {
    fontWeight: '500',
    minWidth: 34,
    textAlign: 'right',
    // color set dynamically
  },
  progressFill: {
    borderRadius: 3,
    height: '100%',
  },
  progressTrack: {
    borderRadius: 3,
    flex: 1,
    height: 6,
    overflow: 'hidden',
  },
  trackRow: {
    alignItems: 'center',
    columnGap: SPACING.sm,
    flexDirection: 'row',
  },
});

StatusProgressBar.propTypes = {
  status: PropTypes.shape({
    spent: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    amount: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    remaining: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    percentage: PropTypes.number,
    isExceeded: PropTypes.bool,
    status: PropTypes.string,
    currency: PropTypes.string,
  }),
  compact: PropTypes.bool,
  showDetails: PropTypes.bool,
  style: PropTypes.any,
};

export default StatusProgressBar;
