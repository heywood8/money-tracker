import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Dimensions } from 'react-native';
import PropTypes from 'prop-types';
import { LineChart } from 'react-native-chart-kit';
import { Line, Text as SvgText, G } from 'react-native-svg';
import { MaterialCommunityIcons as Icon } from '@expo/vector-icons';
import SimplePicker from '../SimplePicker';
import currencies from '../../../assets/currencies.json';
import { useDisplaySettings } from '../../contexts/DisplaySettingsContext';
import BalanceHistoryCalendarView from './BalanceHistoryCalendarView';

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

// Format balance for card header: symbol-prefixed, compact (e.g. ֏322.6K, $11.5M)
const formatBalanceCompact = (amount, currency) => {
  const currencyInfo = currencies[currency];
  const symbol = currencyInfo?.symbol ?? currency;
  const absValue = Math.abs(amount);
  let formatted;
  if (absValue >= 1_000_000_000) {
    formatted = (amount / 1_000_000_000).toFixed(1) + 'B';
  } else if (absValue >= 1_000_000) {
    formatted = (amount / 1_000_000).toFixed(1) + 'M';
  } else if (absValue >= 1_000) {
    formatted = (amount / 1_000).toFixed(1) + 'K';
  } else {
    formatted = Math.round(amount).toString();
  }
  return `${symbol}${formatted}`;
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
  selectedYear,
  selectedMonth,
  accounts,
  spendingPrediction,
  isCurrentMonth,
  closeLabel,
  balanceHistoryTableData,
  editingBalanceValue,
  onEditingBalanceValueChange,
  onEditBalance,
  onCancelEdit,
  onSaveBalance,
  onDeleteBalance,
  onShowCalendar,
}) => {
  const { hideBalances } = useDisplaySettings();
  const [showCalendar, setShowCalendar] = useState(false);

  const selectedAccountData = accounts.find(acc => acc.id === selectedAccount);
  const currency = selectedAccountData?.currency || 'USD';
  const currentBalance = balanceHistoryData.actual && balanceHistoryData.actual.length > 0
    ? balanceHistoryData.actual[balanceHistoryData.actual.length - 1].y
    : null;
  const headerDayNum = new Date().getDate();
  const headerDaysInMonth = selectedMonth !== null
    ? new Date(selectedYear, selectedMonth + 1, 0).getDate()
    : null;

  return (
    <View style={[styles.balanceHistoryCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={styles.balanceHistoryHeader}>
        <View style={styles.balanceHistoryTitleContainer}>
          <Text style={[styles.balanceHistoryLabel, { color: colors.mutedText }]}>
            {(t('balance') || 'Balance').toUpperCase()}
          </Text>
          {currentBalance !== null && (
            <View style={styles.balanceAmountRow}>
              <Text style={[styles.balanceAmount, { color: colors.text }]} numberOfLines={1}>
                {hideBalances ? '••••' : formatBalanceCompact(currentBalance, currency)}
              </Text>
              {isCurrentMonth && headerDaysInMonth !== null && (
                <Text style={[styles.balanceDayContext, { color: colors.mutedText }]}>
                  {`day ${headerDayNum}/${headerDaysInMonth}`}
                </Text>
              )}
            </View>
          )}
        </View>
        {/* Calendar / Chart toggle */}
        {balanceHistoryData.actual && balanceHistoryData.actual.length > 0 && (
          <TouchableOpacity
            testID="calendar-toggle-btn"
            style={[styles.calendarToggleBtn, { backgroundColor: colors.surface }]}
            onPress={() => {
              const next = !showCalendar;
              setShowCalendar(next);
              if (next) onShowCalendar();
            }}
            activeOpacity={0.7}
          >
            <Icon
              name={showCalendar ? 'chart-line' : 'calendar-month'}
              size={18}
              color={colors.primary}
            />
          </TouchableOpacity>
        )}
        {/* Account Pill Picker */}
        <View style={[styles.accountPickerWrapper, { backgroundColor: colors.card }]}>
          <SimplePicker
            value={selectedAccount}
            onValueChange={onAccountChange}
            items={accountItems}
            colors={colors}
            leftIcon="bank"
            style={styles.accountPickerInner}
            closeLabel={closeLabel}
          />
        </View>
      </View>

      {loadingBalanceHistory ? (
        <View style={styles.balanceHistoryLoading}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : balanceHistoryData.actual && balanceHistoryData.actual.length > 0 ? (
        <>
          {showCalendar ? (
            <BalanceHistoryCalendarView
              colors={colors}
              selectedYear={selectedYear}
              selectedMonth={selectedMonth}
              balanceHistoryTableData={balanceHistoryTableData}
              editingBalanceValue={editingBalanceValue}
              onEditingBalanceValueChange={onEditingBalanceValueChange}
              onEditBalance={onEditBalance}
              onCancelEdit={onCancelEdit}
              onSaveBalance={onSaveBalance}
              onDeleteBalance={onDeleteBalance}
            />
          ) : (
            <>
              <View
                style={styles.balanceHistoryChartContainer}
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
                      const predictedBalance = lastActualPoint.y - (spendingPrediction.dailyAverage * daysFromNow);
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

                  // Calculate max/min value from all datasets to determine Y-axis scale
                  const forecastValues = combinedActualForecast.filter(v => v !== undefined);
                  const prevMonthValues = (balanceHistoryData.prevMonth || []).filter(v => v !== undefined);

                  const allValues = [...actualValues, ...forecastValues, ...prevMonthValues, ...plainAvgData];
                  const maxValue = allValues.length > 0 ? Math.max(...allValues) : 0;
                  const minValue = allValues.length > 0 ? Math.min(...allValues) : 0;
                  const hasNegativeValues = minValue < 0;

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
                          // Zero baseline (always drawn so the 0 line is always visible)
                          {
                            data: balanceHistoryData.labels.map(() => 0),
                            color: () => 'rgba(128, 128, 128, 0.5)',
                            strokeWidth: 1,
                            withDots: false,
                          },
                        ],
                      }}
                      width={screenWidth - 33}
                      height={220}
                      paddingLeft="40"
                      yAxisLabel=""
                      yAxisSuffix=""
                      yAxisInterval={niceInterval}
                      segments={4}
                      fromZero={!hasNegativeValues}
                      formatYLabel={hideBalances ? () => '' : (value) => {
                        const numValue = parseFloat(value);
                        if (numValue === 0) return '';
                        const absValue = Math.abs(numValue);
                        const isNegative = numValue < 0;

                        if (absValue >= 1000000) {
                          const result = `${(absValue / 1000000).toFixed(0)}M`;
                          return isNegative ? `-${result}` : result;
                        } else if (absValue >= 1000) {
                          const result = `${(absValue / 1000).toFixed(0)}K`;
                          return isNegative ? `-${result}` : result;
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
                      decorator={() => {
                        const chartWidth = screenWidth - 16;
                        const paddingLeft = 40;
                        const paddingRight = 16;
                        const usableWidth = chartWidth - paddingLeft - paddingRight;
                        const dataLength = balanceHistoryData.labels.length;
                        const xStep = usableWidth / (dataLength - 1);
                        const chartTop = 12;
                        const chartBottom = 181;
                        const chartAreaHeight = chartBottom - chartTop;

                        const elements = [];

                        if (isCurrentMonth) {
                          const todayIndex = currentDay - 1;
                          const xPosition = paddingLeft + (todayIndex * xStep);
                          elements.push(
                            <Line
                              key="today-line"
                              x1={xPosition}
                              y1={chartTop}
                              x2={xPosition}
                              y2={chartBottom}
                              stroke={colors.primary}
                              strokeWidth={1}
                              strokeDasharray="4,4"
                              opacity={0.6}
                            />,
                            <SvgText
                              key="today-label"
                              x={xPosition}
                              y={10}
                              fontSize={10}
                              fill={colors.primary}
                              textAnchor="middle"
                              fontWeight="bold"
                            >
                              {currentDay}
                            </SvgText>,
                          );
                        }

                        return elements.length > 0 ? <G>{elements}</G> : null;
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
              </View>

              {/* Compact Table Legend */}
              {!hideBalances && (() => {
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
                } else if (actualValues.length >= 1) {
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
                  forecastEnd = actualCurrent - (spendingPrediction.dailyAverage * daysRemaining);
                  forecastDailyAvg = -spendingPrediction.dailyAverage;
                }

                // Prev month row values
                const hasPrevMonthData = balanceHistoryData.prevMonth && balanceHistoryData.prevMonth.some(v => v !== undefined);
                let prevMonthMax = null;
                let prevMonthCurrent = null;
                let prevMonthEnd = null;
                let prevMonthDailyAvg = null;
                if (hasPrevMonthData) {
                  const prevMonthAllValues = balanceHistoryData.prevMonth || [];
                  const prevMonthActualValues = prevMonthAllValues.filter(v => v !== undefined);
                  prevMonthMax = prevMonthActualValues.length > 0 ? Math.max(...prevMonthActualValues) : null;

                  // Helper: find prev month value at or before a given 1-based day
                  // Falls back to last available value when day exceeds prev month's length
                  const prevMonthAtDay = (day) => {
                    if (!day) return null;
                    const idx = Math.min(day - 1, prevMonthAllValues.length - 1);
                    for (let i = idx; i >= 0; i--) {
                      if (prevMonthAllValues[i] !== undefined) return prevMonthAllValues[i];
                    }
                    return null;
                  };

                  // Number of days in the previous month (e.g. 28 for February)
                  const prevMonthDaysCount = balanceHistoryData.prevMonthDaysCount || new Date(selectedYear, selectedMonth, 0).getDate();

                  prevMonthCurrent = prevMonthAtDay(displayDay);
                  // End = balance on the actual last day of the previous month
                  prevMonthEnd = prevMonthAtDay(prevMonthDaysCount);

                  // Daily avg = total expenses / days in month (negated: spending reduces balance)
                  const prevTotalExpenses = balanceHistoryData.prevMonthTotalExpenses;
                  if (prevTotalExpenses != null && prevMonthDaysCount > 0) {
                    prevMonthDailyAvg = -prevTotalExpenses / prevMonthDaysCount;
                  }
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
                      <Text style={[styles.legendTableValue, { color: colors.text }]}>{formatCompact(0, currency)}</Text>
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
                        <Text style={[styles.legendTableValue, { color: colors.text }]}>{formatCompact(prevMonthDailyAvg, currency)}</Text>
                        <Text style={[styles.legendTableValue, { color: colors.text }]}>{formatCompact(prevMonthEnd, currency)}</Text>
                      </View>
                    )}
                  </View>
                );
              })()}
            </>
          )}
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
    prevMonthTotalExpenses: PropTypes.number,
    prevMonthDaysCount: PropTypes.number,
  }).isRequired,
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
  closeLabel: PropTypes.string,
  balanceHistoryTableData: PropTypes.arrayOf(
    PropTypes.shape({
      date: PropTypes.string.isRequired,
      balance: PropTypes.string,
    }),
  ).isRequired,
  editingBalanceValue: PropTypes.string.isRequired,
  onEditingBalanceValueChange: PropTypes.func.isRequired,
  onEditBalance: PropTypes.func.isRequired,
  onCancelEdit: PropTypes.func.isRequired,
  onSaveBalance: PropTypes.func.isRequired,
  onDeleteBalance: PropTypes.func.isRequired,
  onShowCalendar: PropTypes.func.isRequired,
};

const styles = StyleSheet.create({
  accountPickerInner: {
    height: 32,
    paddingHorizontal: 10,
  },
  accountPickerWrapper: {
    borderRadius: 16,
    flexShrink: 0,
    width: 150,
  },
  balanceAmount: {
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: -0.4,
  },
  balanceAmountRow: {
    alignItems: 'baseline',
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
  },
  balanceDayContext: {
    fontSize: 13,
    fontWeight: '500',
  },
  balanceHistoryCard: {
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 16,
    overflow: 'hidden',
    padding: 16,
  },
  balanceHistoryChartContainer: {
    marginHorizontal: -16,
  },
  balanceHistoryHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  balanceHistoryLabel: {
    fontSize: 11,
    fontWeight: '500',
    letterSpacing: 0.5,
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
  balanceHistoryTitleContainer: {
    flex: 1,
    marginRight: 8,
    overflow: 'hidden',
  },
  calendarToggleBtn: {
    alignItems: 'center',
    borderRadius: 8,
    height: 32,
    justifyContent: 'center',
    marginRight: 8,
    width: 32,
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
