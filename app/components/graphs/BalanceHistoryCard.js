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
            <LineChart
              data={{
                labels: balanceHistoryData.labels.map(d => d.toString()),
                datasets: [
                  {
                    data: balanceHistoryData.actualForChart.filter(v => v !== undefined),
                    color: () => colors.primary,
                    strokeWidth: 3,
                  },
                  {
                    data: balanceHistoryData.burndown.map(p => p.y),
                    color: () => 'rgba(255, 99, 132, 0.4)',
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
              formatXLabel={(value) => {
                // Show every 5th label to avoid crowding
                const day = parseInt(value);
                return day % 5 === 1 ? value : '';
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
          </TouchableOpacity>

          {/* Legend at bottom with values on the right */}
          {(() => {
            const now = new Date();
            const isCurrentMonth = selectedYear === now.getFullYear() && selectedMonth === now.getMonth();
            const displayDay = isCurrentMonth
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

            const findBurndownAtDay = (day) => {
              if (!day) return undefined;
              const point = (balanceHistoryData.burndown || []).find(p => p.x === day);
              if (point) return point.y;
              const prior = (balanceHistoryData.burndown || []).filter(p => p.x <= day);
              if (prior.length > 0) return prior[prior.length - 1].y;
              return undefined;
            };

            const actualValNum = findActualAtDay(displayDay);
            const burndownValNum = findBurndownAtDay(displayDay);
            const prevMonthValNum = (balanceHistoryData.prevMonth && displayDay)
              ? balanceHistoryData.prevMonth[displayDay - 1]
              : undefined;

            const actualValue = actualValNum !== undefined ? formatCurrency(actualValNum, selectedAccountData?.currency || 'USD') : '-';
            const burndownValue = burndownValNum !== undefined ? formatCurrency(burndownValNum, selectedAccountData?.currency || 'USD') : '-';
            const prevMonthValue = prevMonthValNum !== undefined ? formatCurrency(prevMonthValNum, selectedAccountData?.currency || 'USD') : '-';

            const hasPrevMonthData = balanceHistoryData.prevMonth && balanceHistoryData.prevMonth.some(v => v !== undefined);

            return (
              <View style={styles.burndownLegendContainer}>
                <View style={styles.legendColumn}>
                  <View style={styles.legendRow}>
                    <View style={[styles.burndownLegendDot, { backgroundColor: colors.primary }]} />
                    <Text style={[styles.burndownLegendText, { color: colors.text }]}>{t('actual') || 'Actual'}</Text>
                  </View>
                  <View style={styles.legendRow}>
                    <View style={[styles.burndownLegendDot, styles.burndownDatasetColor]} />
                    <Text style={[styles.burndownLegendText, { color: colors.text }]}>{t('burndown') || 'Burndown'}</Text>
                  </View>
                  {hasPrevMonthData && (
                    <View style={styles.legendRow}>
                      <View style={[styles.burndownLegendDot, styles.prevMonthDatasetColor]} />
                      <Text style={[styles.burndownLegendText, { color: colors.text }]}>{t('prev_month') || 'Prev Month'}</Text>
                    </View>
                  )}
                </View>

                <View style={styles.valuesColumn}>
                  <Text style={[styles.todayValueText, { color: colors.text }]}>{actualValue}</Text>
                  <Text style={[styles.todayValueText, { color: colors.text }]}>{burndownValue}</Text>
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
  burndownDatasetColor: {
    backgroundColor: 'rgba(255, 99, 132, 0.4)',
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
