import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Dimensions } from 'react-native';
import PropTypes from 'prop-types';
import { LineChart } from 'react-native-chart-kit';
import { MaterialCommunityIcons as Icon } from '@expo/vector-icons';
import SimplePicker from '../SimplePicker';
import currencies from '../../../assets/currencies.json';

const screenWidth = Dimensions.get('window').width;

const formatCurrency = (amount, currency) => {
  const currencyInfo = currencies[currency];
  const decimals = currencyInfo?.decimal_digits ?? 2;
  return `${parseFloat(amount).toFixed(decimals)} ${currency}`;
};

// Helper function to calculate nice Y-axis scale
// Returns max value and interval for 4 evenly spaced segments
const calculateNiceScale = (maxValue) => {
  if (maxValue === 0) return { max: 0, interval: 0 };

  // Calculate rough interval for 4 segments
  const roughInterval = maxValue / 4;

  // Get the order of magnitude
  const magnitude = Math.pow(10, Math.floor(Math.log10(roughInterval)));

  // Normalize to range [1, 10)
  const normalized = roughInterval / magnitude;

  // Round to nearest nice number: 1, 2, or 5
  let niceNormalized;
  if (normalized <= 1.5) {
    niceNormalized = 1;
  } else if (normalized <= 3.5) {
    niceNormalized = 2;
  } else if (normalized <= 7.5) {
    niceNormalized = 5;
  } else {
    niceNormalized = 10;
  }

  const niceInterval = niceNormalized * magnitude;
  const niceMax = niceInterval * 4;

  return { max: niceMax, interval: niceInterval };
};

const BalanceHistoryCard = ({
  colors,
  t,
  selectedAccount,
  onAccountChange,
  accountItems,
  loadingBalanceHistory,
  balanceHistoryData,
  onChartPress,
  selectedYear,
  selectedMonth,
  accounts,
  spendingPrediction,
  isCurrentMonth,
}) => {
  return (
    <View style={[styles.balanceHistoryCard, { backgroundColor: colors.altRow, borderColor: colors.border }]}>
      <View style={styles.balanceHistoryHeader}>
        <View style={styles.balanceHistoryTitleContainer}>
          <Icon name="chart-line" size={24} color={colors.primary} />
          <Text style={[styles.balanceHistoryTitle, { color: colors.text }]}>
            {t('balance') || 'Balance'}
          </Text>
        </View>
        {/* Account Picker */}
        <View style={[styles.accountPickerWrapper, { backgroundColor: colors.altRow, borderColor: colors.border }]}>
          <SimplePicker
            value={selectedAccount}
            onValueChange={onAccountChange}
            items={accountItems}
            colors={colors}
          />
        </View>
      </View>

      {loadingBalanceHistory ? (
        <View style={styles.balanceHistoryLoading}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : balanceHistoryData.actual && balanceHistoryData.actual.length > 0 ? (
        <>
          <TouchableOpacity
            style={styles.balanceHistoryChartContainer}
            onPress={onChartPress}
            activeOpacity={0.7}
          >
            {(() => {
              // Calculate forecast data if we have spending prediction and it's the current month
              const calculateForecastData = () => {
                if (!spendingPrediction || !isCurrentMonth) return [];
                const currentDay = new Date().getDate();
                // Find the last actual balance point at or before current day
                const actualPoints = (balanceHistoryData.actual || []).filter(p => p.x <= currentDay);
                if (actualPoints.length === 0) return [];
                const lastActualPoint = actualPoints[actualPoints.length - 1];

                const predictions = [];
                for (let day = currentDay; day <= spendingPrediction.daysInMonth; day++) {
                  const daysFromNow = day - currentDay;
                  const predictedBalance = Math.max(0, lastActualPoint.y - (spendingPrediction.dailyAverage * daysFromNow));
                  predictions.push({ x: day, y: predictedBalance });
                }
                return predictions;
              };

              const forecastData = calculateForecastData();
              const hasForecast = forecastData.length > 0;

              // Create forecast array aligned with labels (null for days before forecast starts)
              const forecastForChart = hasForecast
                ? balanceHistoryData.labels.map(day => {
                  const point = forecastData.find(p => p.x === day);
                  return point ? point.y : null;
                })
                : [];

              // Calculate max value from all datasets to determine Y-axis scale
              const actualValues = balanceHistoryData.actualForChart.filter(v => v !== undefined);
              const forecastValues = forecastForChart.filter(v => v !== null && v !== undefined);
              const prevMonthValues = (balanceHistoryData.prevMonth || []).filter(v => v !== undefined);

              const allValues = [...actualValues, ...forecastValues, ...prevMonthValues];
              const maxValue = allValues.length > 0 ? Math.max(...allValues) : 0;

              // Calculate nice scale for Y-axis
              const { max: niceMax, interval: niceInterval } = calculateNiceScale(maxValue);

              // Get last day for X-axis labels
              const lastDay = balanceHistoryData.labels[balanceHistoryData.labels.length - 1];

              return (
                <LineChart
                  data={{
                    labels: balanceHistoryData.labels.map(d => d.toString()),
                    datasets: [
                      {
                        data: balanceHistoryData.actualForChart.filter(v => v !== undefined),
                        color: () => colors.primary,
                        strokeWidth: 3,
                      },
                      ...(hasForecast ? [{
                        data: forecastForChart.map(v => v ?? null),
                        color: () => 'rgba(255, 152, 0, 0.7)',
                        strokeWidth: 2,
                        withDots: false,
                      }] : []),
                      ...(balanceHistoryData.prevMonth && balanceHistoryData.prevMonth.some(v => v !== undefined) ? [{
                        data: balanceHistoryData.prevMonth.map(v => v ?? null),
                        color: () => 'rgba(156, 39, 176, 0.5)',
                        strokeWidth: 2,
                        withDots: false,
                      }] : []),
                    ],
                  }}
                  width={screenWidth - 64}
                  height={220}
                  yAxisLabel=""
                  yAxisSuffix=""
                  yAxisInterval={niceInterval}
                  segments={4}
                  fromZero={true}
                  formatYLabel={(value) => {
                    // Format Y-axis labels to show nice rounded values
                    const numValue = parseFloat(value);
                    if (numValue >= 1000000) {
                      return `${(numValue / 1000000).toFixed(0)}M`;
                    } else if (numValue >= 1000) {
                      return `${(numValue / 1000).toFixed(0)}K`;
                    }
                    return numValue.toFixed(0);
                  }}
                  formatXLabel={(value) => {
                    // Show: 1, 5, 10, 15, 20, 25, and last day of month
                    const day = parseInt(value);
                    if (day === 1 || day === 5 || day === 10 || day === 15 ||
                        day === 20 || day === 25 || day === lastDay) {
                      return value;
                    }
                    return '';
                  }}
                  chartConfig={{
                    backgroundColor: colors.altRow,
                    backgroundGradientFrom: colors.altRow,
                    backgroundGradientTo: colors.altRow,
                    decimalPlaces: 0,
                    color: (_opacity = 1) => colors.text,
                    labelColor: (_opacity = 1) => colors.mutedText,
                    style: {
                      borderRadius: 16,
                    },
                    propsForDots: {
                      r: '2',
                      strokeWidth: '2',
                    },
                    propsForBackgroundLines: {
                      strokeWidth: 1,
                      stroke: colors.border,
                      strokeDasharray: '0',
                    },
                  }}
                  bezier
                  withInnerLines={true}
                  withOuterLines={true}
                  withVerticalLines={false}
                  withHorizontalLines={true}
                  withLegend={false}
                  style={styles.lineChartStyle}
                />
              );
            })()}
          </TouchableOpacity>

          {/* Legend at bottom with values on the right */}
          {(() => {
            const now = new Date();
            const isCurrentMonthLocal = selectedYear === now.getFullYear() && selectedMonth === now.getMonth();
            const displayDay = isCurrentMonthLocal
              ? now.getDate()
              : (balanceHistoryData.labels && balanceHistoryData.labels.length > 0
                ? balanceHistoryData.labels[balanceHistoryData.labels.length - 1]
                : null);

            const selectedAccountData = accounts.find(acc => acc.id === selectedAccount);

            const findActualAtDay = (day) => {
              if (!day) return undefined;
              const point = (balanceHistoryData.actual || []).find(p => p.x === day);
              if (point) return point.y;
              const prior = (balanceHistoryData.actual || []).filter(p => p.x <= day);
              if (prior.length > 0) return prior[prior.length - 1].y;
              return undefined;
            };

            const actualValNum = findActualAtDay(displayDay);
            const prevMonthValNum = (balanceHistoryData.prevMonth && displayDay)
              ? balanceHistoryData.prevMonth[displayDay - 1]
              : undefined;

            const actualValue = actualValNum !== undefined ? formatCurrency(actualValNum, selectedAccountData?.currency || 'USD') : '-';
            const prevMonthValue = prevMonthValNum !== undefined ? formatCurrency(prevMonthValNum, selectedAccountData?.currency || 'USD') : '-';

            // Calculate forecast end-of-month value
            const hasForecastData = spendingPrediction && isCurrentMonth;
            let forecastValue = '-';
            if (hasForecastData && actualValNum !== undefined) {
              const daysRemaining = spendingPrediction.daysInMonth - now.getDate();
              const predictedEndBalance = Math.max(0, actualValNum - (spendingPrediction.dailyAverage * daysRemaining));
              forecastValue = formatCurrency(predictedEndBalance, selectedAccountData?.currency || 'USD');
            }

            const hasPrevMonthData = balanceHistoryData.prevMonth && balanceHistoryData.prevMonth.some(v => v !== undefined);

            return (
              <View style={styles.burndownLegendContainer}>
                <View style={styles.legendColumn}>
                  <View style={styles.legendRow}>
                    <View style={[styles.burndownLegendDot, { backgroundColor: colors.primary }]} />
                    <Text style={[styles.burndownLegendText, { color: colors.text }]}>{t('actual') || 'Actual'}</Text>
                  </View>
                  {hasForecastData && (
                    <View style={styles.legendRow}>
                      <View style={[styles.burndownLegendDot, styles.forecastDatasetColor]} />
                      <Text style={[styles.burndownLegendText, { color: colors.text }]}>{t('forecast') || 'Forecast'}</Text>
                    </View>
                  )}
                  {hasPrevMonthData && (
                    <View style={styles.legendRow}>
                      <View style={[styles.burndownLegendDot, styles.prevMonthDatasetColor]} />
                      <Text style={[styles.burndownLegendText, { color: colors.text }]}>{t('prev_month') || 'Prev Month'}</Text>
                    </View>
                  )}
                </View>

                <View style={styles.valuesColumn}>
                  <Text style={[styles.todayValueText, { color: colors.text }]}>{actualValue}</Text>
                  {hasForecastData && (
                    <Text style={[styles.todayValueText, { color: colors.text }]}>{forecastValue}</Text>
                  )}
                  {hasPrevMonthData && (
                    <Text style={[styles.todayValueText, { color: colors.text }]}>{prevMonthValue}</Text>
                  )}
                </View>
              </View>
            );
          })()}
        </>
      ) : (
        <View style={styles.balanceHistoryNoData}>
          <Text style={[styles.balanceHistoryNoDataText, { color: colors.mutedText }]}>
            {t('no_balance_history') || 'No balance history available for this month'}
          </Text>
        </View>
      )}
    </View>
  );
};

BalanceHistoryCard.propTypes = {
  colors: PropTypes.object.isRequired,
  t: PropTypes.func.isRequired,
  selectedAccount: PropTypes.string,
  onAccountChange: PropTypes.func.isRequired,
  accountItems: PropTypes.array.isRequired,
  loadingBalanceHistory: PropTypes.bool.isRequired,
  balanceHistoryData: PropTypes.shape({
    labels: PropTypes.array,
    actual: PropTypes.array,
    actualForChart: PropTypes.array,
    burndown: PropTypes.array,
    prevMonth: PropTypes.array,
  }).isRequired,
  onChartPress: PropTypes.func.isRequired,
  selectedYear: PropTypes.number.isRequired,
  selectedMonth: PropTypes.number,
  accounts: PropTypes.array.isRequired,
  spendingPrediction: PropTypes.shape({
    currentSpending: PropTypes.number,
    predictedTotal: PropTypes.number,
    predictedRemaining: PropTypes.number,
    dailyAverage: PropTypes.number,
    daysElapsed: PropTypes.number,
    daysInMonth: PropTypes.number,
    percentElapsed: PropTypes.number,
  }),
  isCurrentMonth: PropTypes.bool,
};

const styles = StyleSheet.create({
  accountPickerWrapper: {
    borderRadius: 4,
    borderWidth: 1,
    minWidth: 120,
  },
  balanceHistoryCard: {
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 16,
    padding: 16,
  },
  balanceHistoryChartContainer: {
    alignItems: 'center',
  },
  balanceHistoryHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  balanceHistoryLoading: {
    alignItems: 'center',
    height: 220,
    justifyContent: 'center',
  },
  balanceHistoryNoData: {
    alignItems: 'center',
    height: 220,
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  balanceHistoryNoDataText: {
    fontSize: 14,
    textAlign: 'center',
  },
  balanceHistoryTitle: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  balanceHistoryTitleContainer: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  burndownLegendContainer: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 16,
  },
  burndownLegendDot: {
    borderRadius: 5,
    height: 10,
    width: 10,
  },
  burndownLegendText: {
    fontSize: 12,
  },
  forecastDatasetColor: {
    backgroundColor: 'rgba(255, 152, 0, 0.7)',
  },
  legendColumn: {
    flexDirection: 'column',
    gap: 12,
    justifyContent: 'flex-start',
  },
  legendRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  lineChartStyle: {
    borderRadius: 8,
  },
  prevMonthDatasetColor: {
    backgroundColor: 'rgba(156, 39, 176, 0.5)',
  },
  todayValueText: {
    fontSize: 12,
    fontWeight: '600',
  },
  valuesColumn: {
    alignItems: 'flex-end',
    flexDirection: 'column',
    gap: 12,
    minWidth: 120,
  },
});

export default BalanceHistoryCard;
