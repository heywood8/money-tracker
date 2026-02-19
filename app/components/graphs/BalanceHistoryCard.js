import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Dimensions } from 'react-native';
import PropTypes from 'prop-types';
import { LineChart } from 'react-native-chart-kit';
import { Line, Text as SvgText, G } from 'react-native-svg';
import { MaterialCommunityIcons as Icon } from '@expo/vector-icons';
import SimplePicker from '../SimplePicker';
import currencies from '../../../assets/currencies.json';

const screenWidth = Dimensions.get('window').width;

const formatCurrency = (amount, currency) => {
  const currencyInfo = currencies[currency];
  const decimals = currencyInfo?.decimal_digits ?? 2;
  return `${parseFloat(amount).toFixed(decimals)} ${currency}`;
};

// Helper to format numbers compactly (e.g., 10K, 1.5M)
const formatCompact = (value, currency) => {
  if (value === null || value === undefined) return '-';
  const currencyInfo = currencies[currency];
  const decimals = currencyInfo?.decimal_digits ?? 2;

  const absValue = Math.abs(value);
  let formatted;
  if (absValue >= 1000000) {
    formatted = (value / 1000000).toFixed(1) + 'M';
  } else if (absValue >= 1000) {
    formatted = (value / 1000).toFixed(1) + 'K';
  } else {
    formatted = value.toFixed(Math.min(decimals, 2));
  }
  return formatted;
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

// Helper to convert hex color to rgba
const hexToRgba = (hex, alpha) => {
  // Remove # if present
  const cleanHex = hex.replace('#', '');
  const r = parseInt(cleanHex.substring(0, 2), 16);
  const g = parseInt(cleanHex.substring(2, 4), 16);
  const b = parseInt(cleanHex.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
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
              const currentDay = new Date().getDate();

              // Combine actual and forecast into one continuous line:
              // - Up to today: actual balance from table
              // - After today: forecast projection
              const combinedActualForecast = balanceHistoryData.labels.map((day, index) => {
                if (!isCurrentMonth || day <= currentDay) {
                  // Use actual data up to and including today
                  return balanceHistoryData.actualForChart[index];
                } else if (hasForecast) {
                  // Use forecast data after today
                  const point = forecastData.find(p => p.x === day);
                  return point ? point.y : undefined;
                }
                return undefined;
              });

              // Calculate max balance from actual values (for plain avg line)
              const actualValues = balanceHistoryData.actualForChart.filter(v => v !== undefined);
              const maxBalance = actualValues.length > 0 ? Math.max(...actualValues) : 0;

              // Calculate plain avg line (linear from max balance to 0)
              const daysInMonth = balanceHistoryData.labels[balanceHistoryData.labels.length - 1];
              const plainAvgData = balanceHistoryData.labels.map(day =>
                maxBalance * (1 - (day - 1) / (daysInMonth - 1)),
              );

              // Calculate max value from all datasets to determine Y-axis scale
              const forecastValues = combinedActualForecast.filter(v => v !== undefined);
              const prevMonthValues = (balanceHistoryData.prevMonth || []).filter(v => v !== undefined);

              const allValues = [...actualValues, ...forecastValues, ...prevMonthValues, ...plainAvgData];
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
                      // Combined actual + forecast line (actual up to today, forecast after)
                      {
                        data: combinedActualForecast.filter(v => v !== undefined),
                        color: () => colors.primary,
                        strokeWidth: 3,
                      },
                      // Plain avg line (always shown)
                      {
                        data: plainAvgData,
                        color: () => 'rgba(128, 128, 128, 0.4)',
                        strokeWidth: 2,
                        withDots: false,
                      },
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
                  decorator={isCurrentMonth ? () => {
                    // Draw vertical line at current day to show today
                    const chartWidth = screenWidth - 64;
                    const paddingLeft = 64; // Y-axis label space
                    const paddingRight = 16;
                    const dataLength = balanceHistoryData.labels.length;
                    const usableWidth = chartWidth - paddingLeft - paddingRight;
                    const xStep = usableWidth / (dataLength - 1);
                    const todayIndex = currentDay - 1; // 0-indexed
                    const xPosition = paddingLeft + (todayIndex * xStep);

                    return (
                      <G>
                        <Line
                          x1={xPosition}
                          y1={12}
                          x2={xPosition}
                          y2={181}
                          stroke={colors.primary}
                          strokeWidth={1}
                          strokeDasharray="4,4"
                          opacity={0.6}
                        />
                        <SvgText
                          x={xPosition}
                          y={10}
                          fontSize={10}
                          fill={colors.primary}
                          textAnchor="middle"
                          fontWeight="bold"
                        >
                          {currentDay}
                        </SvgText>
                      </G>
                    );
                  } : undefined}
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

          {/* Compact Table Legend */}
          {(() => {
            const now = new Date();
            const isCurrentMonthLocal = selectedYear === now.getFullYear() && selectedMonth === now.getMonth();
            const displayDay = isCurrentMonthLocal
              ? now.getDate()
              : (balanceHistoryData.labels && balanceHistoryData.labels.length > 0
                ? balanceHistoryData.labels[balanceHistoryData.labels.length - 1]
                : null);

            const selectedAccountData = accounts.find(acc => acc.id === selectedAccount);
            const currency = selectedAccountData?.currency || 'USD';

            // Calculate values for each line
            const actualValues = balanceHistoryData.actualForChart.filter(v => v !== undefined);
            const maxBalance = actualValues.length > 0 ? Math.max(...actualValues) : 0;

            const findActualAtDay = (day) => {
              if (!day) return undefined;
              const point = (balanceHistoryData.actual || []).find(p => p.x === day);
              if (point) return point.y;
              const prior = (balanceHistoryData.actual || []).filter(p => p.x <= day);
              if (prior.length > 0) return prior[prior.length - 1].y;
              return undefined;
            };

            const daysInMonth = balanceHistoryData.labels[balanceHistoryData.labels.length - 1];

            // Actual row values
            const actualCurrent = findActualAtDay(displayDay);
            const actualEnd = findActualAtDay(daysInMonth);
            // Calculate actual daily avg from spending prediction or from data
            let actualDailyAvg = null;
            if (spendingPrediction && isCurrentMonth) {
              actualDailyAvg = -spendingPrediction.dailyAverage;
            } else if (actualValues.length > 1) {
              // For past months, calculate from first to last actual recorded data point.
              // Use balanceHistoryData.actual (which carries day numbers) so the span
              // matches the real days between observations, not the full month length.
              const actualDataPoints = balanceHistoryData.actual || [];
              if (actualDataPoints.length >= 2) {
                const firstPoint = actualDataPoints[0];
                const lastPoint = actualDataPoints[actualDataPoints.length - 1];
                const daySpan = lastPoint.x - firstPoint.x;
                actualDailyAvg = daySpan > 0 ? (lastPoint.y - firstPoint.y) / daySpan : 0;
              } else {
                // Only one actual data point recorded – no change to measure
                actualDailyAvg = 0;
              }
            }

            // Plain avg row values
            const plainAvgDaily = daysInMonth > 1 ? -maxBalance / (daysInMonth - 1) : 0;
            const plainAvgCurrent = displayDay ? maxBalance * (1 - (displayDay - 1) / (daysInMonth - 1)) : null;
            // Plain avg end is always 0

            // Forecast row values (only for current month)
            let forecastEnd = null;
            let forecastDailyAvg = null;
            const hasForecastData = spendingPrediction && isCurrentMonth;
            if (hasForecastData && actualCurrent !== undefined) {
              const daysRemaining = spendingPrediction.daysInMonth - now.getDate();
              forecastEnd = Math.max(0, actualCurrent - (spendingPrediction.dailyAverage * daysRemaining));
              forecastDailyAvg = -spendingPrediction.dailyAverage;
            }

            // Prev month row values
            const hasPrevMonthData = balanceHistoryData.prevMonth && balanceHistoryData.prevMonth.some(v => v !== undefined);
            let prevMonthMax = null;
            let prevMonthCurrent = null;
            let prevMonthEnd = null;
            if (hasPrevMonthData) {
              const prevMonthActualValues = balanceHistoryData.prevMonth.filter(v => v !== undefined);
              prevMonthMax = prevMonthActualValues.length > 0 ? Math.max(...prevMonthActualValues) : null;
              prevMonthCurrent = displayDay && balanceHistoryData.prevMonth[displayDay - 1] !== undefined
                ? balanceHistoryData.prevMonth[displayDay - 1]
                : null;
              prevMonthEnd = balanceHistoryData.prevMonth[daysInMonth - 1] !== undefined
                ? balanceHistoryData.prevMonth[daysInMonth - 1]
                : null;
            }

            return (
              <View style={styles.legendTableContainer}>
                {/* Header row */}
                <View style={styles.legendTableRow}>
                  <View style={styles.legendTableLabelCell} />
                  <Text style={[styles.legendTableHeader, { color: colors.mutedText }]}>{t('max') || 'Max'}</Text>
                  <Text style={[styles.legendTableHeader, { color: colors.mutedText }]}>{t('current') || 'Current'}</Text>
                  <Text style={[styles.legendTableHeader, { color: colors.mutedText }]}>{t('daily_avg') || 'Daily Avg'}</Text>
                  <Text style={[styles.legendTableHeader, { color: colors.mutedText }]}>{t('end') || 'End'}</Text>
                </View>

                {/* Actual + Forecast row (combined line) */}
                <View style={styles.legendTableRow}>
                  <View style={styles.legendTableLabelCell}>
                    <View style={[styles.legendDot, { backgroundColor: colors.primary }]} />
                    <Text style={[styles.legendTableLabel, { color: colors.text }]}>{t('actual') || 'Actual'}</Text>
                  </View>
                  <Text style={[styles.legendTableValue, { color: colors.text }]}>{formatCompact(maxBalance, currency)}</Text>
                  <Text style={[styles.legendTableValue, { color: colors.text }]}>{formatCompact(actualCurrent, currency)}</Text>
                  <Text style={[styles.legendTableValue, { color: colors.text }]}>{formatCompact(actualDailyAvg, currency)}</Text>
                  <Text style={[styles.legendTableValue, { color: colors.text }]}>{formatCompact(hasForecastData ? forecastEnd : actualEnd, currency)}</Text>
                </View>

                {/* Plain avg row */}
                <View style={styles.legendTableRow}>
                  <View style={styles.legendTableLabelCell}>
                    <View style={[styles.legendDot, styles.legendDotPlainAvg]} />
                    <Text style={[styles.legendTableLabel, { color: colors.text }]}>{t('plain_avg') || 'Plain avg'}</Text>
                  </View>
                  <Text style={[styles.legendTableValue, { color: colors.text }]}>{formatCompact(maxBalance, currency)}</Text>
                  <Text style={[styles.legendTableValue, { color: colors.text }]}>{formatCompact(plainAvgCurrent, currency)}</Text>
                  <Text style={[styles.legendTableValue, { color: colors.text }]}>{formatCompact(plainAvgDaily, currency)}</Text>
                  <Text style={[styles.legendTableValue, { color: colors.text }]}>0</Text>
                </View>

                {/* Prev month row */}
                {hasPrevMonthData && (
                  <View style={styles.legendTableRow}>
                    <View style={styles.legendTableLabelCell}>
                      <View style={[styles.legendDot, styles.legendDotPrevMonth]} />
                      <Text style={[styles.legendTableLabel, { color: colors.text }]}>{t('prev_month') || 'Prev Month'}</Text>
                    </View>
                    <Text style={[styles.legendTableValue, { color: colors.text }]}>{formatCompact(prevMonthMax, currency)}</Text>
                    <Text style={[styles.legendTableValue, { color: colors.text }]}>{formatCompact(prevMonthCurrent, currency)}</Text>
                    <Text style={[styles.legendTableValue, { color: colors.text }]}>-</Text>
                    <Text style={[styles.legendTableValue, { color: colors.text }]}>{formatCompact(prevMonthEnd, currency)}</Text>
                  </View>
                )}
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
  legendDot: {
    borderRadius: 6,
    height: 12,
    marginRight: 6,
    width: 12,
  },
  legendDotPlainAvg: {
    backgroundColor: 'rgba(128, 128, 128, 0.4)',
  },
  legendDotPrevMonth: {
    backgroundColor: 'rgba(156, 39, 176, 0.5)',
  },
  legendTableContainer: {
    marginTop: 16,
  },
  legendTableHeader: {
    flex: 1,
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'right',
  },
  legendTableLabel: {
    fontSize: 12,
  },
  legendTableLabelCell: {
    alignItems: 'center',
    flexDirection: 'row',
    width: 80,
  },
  legendTableRow: {
    alignItems: 'center',
    flexDirection: 'row',
    paddingVertical: 4,
  },
  legendTableValue: {
    flex: 1,
    fontSize: 12,
    textAlign: 'right',
  },
  lineChartStyle: {
    borderRadius: 8,
  },
});

export default BalanceHistoryCard;
