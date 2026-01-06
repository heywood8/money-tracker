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
                    data: balanceHistoryData.prevMonth.filter(v => v !== undefined),
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
            const currentDay = isCurrentMonth ? now.getDate() : null;

            let actualValue = null;
            let burndownValue = null;
            let prevMonthValue = null;

            if (currentDay) {
              const actualPoint = balanceHistoryData.actual.find(p => p.x === currentDay);
              const burndownPoint = balanceHistoryData.burndown.find(p => p.x === currentDay);
              const selectedAccountData = accounts.find(acc => acc.id === selectedAccount);

              if (actualPoint) {
                actualValue = formatCurrency(actualPoint.y, selectedAccountData?.currency || 'USD');
              }
              if (burndownPoint) {
                burndownValue = formatCurrency(burndownPoint.y, selectedAccountData?.currency || 'USD');
              }
              if (balanceHistoryData.prevMonth && balanceHistoryData.prevMonth[currentDay - 1] !== undefined) {
                prevMonthValue = formatCurrency(balanceHistoryData.prevMonth[currentDay - 1], selectedAccountData?.currency || 'USD');
              }
            }

            const hasPrevMonthData = balanceHistoryData.prevMonth && balanceHistoryData.prevMonth.some(v => v !== undefined);

            return (
              <View style={styles.burndownLegendContainer}>
                <View style={styles.burndownLegend}>
                  <View style={styles.burndownLegendItem}>
                    <View style={[styles.burndownLegendDot, { backgroundColor: colors.primary }]} />
                    <Text style={[styles.burndownLegendText, { color: colors.text }]}>
                      {t('actual') || 'Actual'}
                    </Text>
                  </View>
                  <View style={styles.burndownLegendItem}>
                    <View style={[styles.burndownLegendDot, styles.burndownDatasetColor]} />
                    <Text style={[styles.burndownLegendText, { color: colors.text }]}>
                      {t('burndown') || 'Burndown'}
                    </Text>
                  </View>
                  {hasPrevMonthData && (
                    <View style={styles.burndownLegendItem}>
                      <View style={[styles.burndownLegendDot, styles.prevMonthDatasetColor]} />
                      <Text style={[styles.burndownLegendText, { color: colors.text }]}>
                        {t('prev_month') || 'Prev Month'}
                      </Text>
                    </View>
                  )}
                </View>

                {(actualValue || burndownValue || prevMonthValue) && (
                  <View style={styles.todayValuesContainer}>
                    <View style={styles.todayValueItem}>
                      <Text style={[styles.todayValueText, { color: colors.text }]}>
                        {actualValue || '-'}
                      </Text>
                    </View>
                    <View style={styles.todayValueItem}>
                      <Text style={[styles.todayValueText, { color: colors.text }]}>
                        {burndownValue || '-'}
                      </Text>
                    </View>
                    {hasPrevMonthData && (
                      <View style={styles.todayValueItem}>
                        <Text style={[styles.todayValueText, { color: colors.text }]}>
                          {prevMonthValue || '-'}
                        </Text>
                      </View>
                    )}
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
};

const styles = StyleSheet.create({
  balanceHistoryCard: {
    marginBottom: 16,
    padding: 16,
    borderRadius: 8,
    borderWidth: 1,
  },
  balanceHistoryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  balanceHistoryTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  balanceHistoryTitle: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  accountPickerWrapper: {
    borderWidth: 1,
    borderRadius: 4,
    minWidth: 120,
  },
  balanceHistoryLoading: {
    height: 220,
    justifyContent: 'center',
    alignItems: 'center',
  },
  balanceHistoryChartContainer: {
    alignItems: 'center',
  },
  lineChartStyle: {
    borderRadius: 8,
  },
  burndownLegendContainer: {
    marginTop: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  burndownLegend: {
    flexDirection: 'row',
    gap: 16,
  },
  burndownLegendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  burndownLegendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  burndownDatasetColor: {
    backgroundColor: 'rgba(255, 99, 132, 0.4)',
  },
  prevMonthDatasetColor: {
    backgroundColor: 'rgba(156, 39, 176, 0.5)',
  },
  burndownLegendText: {
    fontSize: 12,
  },
  todayValuesContainer: {
    flexDirection: 'row',
    gap: 16,
  },
  todayValueItem: {
    alignItems: 'flex-end',
  },
  todayValueText: {
    fontSize: 12,
    fontWeight: '600',
  },
  balanceHistoryNoData: {
    height: 220,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  balanceHistoryNoDataText: {
    fontSize: 14,
    textAlign: 'center',
  },
});

export default BalanceHistoryCard;
