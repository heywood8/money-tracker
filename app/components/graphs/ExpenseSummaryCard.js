import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import PropTypes from 'prop-types';
import { PieChart } from 'react-native-chart-kit';
import currencies from '../../../assets/currencies.json';

const formatCurrency = (amount, currency) => {
  const currencyInfo = currencies[currency];
  const decimals = currencyInfo?.decimal_digits ?? 2;
  return `${parseFloat(amount).toFixed(decimals)} ${currency}`;
};

const ExpenseSummaryCard = ({
  colors,
  t,
  loading,
  totalExpenses,
  selectedCurrency,
  chartData,
  onPress,
}) => {
  return (
    <TouchableOpacity
      style={[styles.summaryCard, { backgroundColor: colors.altRow, borderColor: colors.border }]}
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={t('expenses_by_category')}
    >
      <View style={styles.summaryCardContent}>
        <View style={styles.summaryInfo}>
          <Text style={[styles.summaryLabel, { color: colors.mutedText }]}>
            {t('total_expenses')}
          </Text>
          <Text style={[styles.summaryAmount, { color: colors.text }]}>
            {loading ? '...' : formatCurrency(totalExpenses, selectedCurrency)}
          </Text>
        </View>
        <View style={styles.miniChartContainer}>
          {loading ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : chartData.length > 0 ? (
            <PieChart
              data={chartData}
              width={80}
              height={80}
              chartConfig={{
                color: (opacity = 1) => `rgba(255, 255, 255, ${opacity})`,
              }}
              accessor="amount"
              backgroundColor="transparent"
              paddingLeft="0"
              hasLegend={false}
              center={[20, 0]}
            />
          ) : (
            <View style={styles.noDataPlaceholder}>
              <Text style={[styles.noDataText, { color: colors.mutedText }]}>—</Text>
            </View>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
};

ExpenseSummaryCard.propTypes = {
  colors: PropTypes.object.isRequired,
  t: PropTypes.func.isRequired,
  loading: PropTypes.bool.isRequired,
  totalExpenses: PropTypes.number.isRequired,
  selectedCurrency: PropTypes.string.isRequired,
  chartData: PropTypes.array.isRequired,
  onPress: PropTypes.func.isRequired,
};

const styles = StyleSheet.create({
  miniChartContainer: {
    alignItems: 'center',
    height: 80,
    justifyContent: 'center',
    width: 80,
  },
  noDataPlaceholder: {
    alignItems: 'center',
    height: 80,
    justifyContent: 'center',
    width: 80,
  },
  noDataText: {
    fontSize: 32,
  },
  summaryAmount: {
    fontSize: 24,
    fontWeight: 'bold',
  },
  summaryCard: {
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 16,
    padding: 16,
  },
  summaryCardContent: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  summaryInfo: {
    flex: 1,
  },
  summaryLabel: {
    fontSize: 14,
    marginBottom: 8,
  },
});

export default ExpenseSummaryCard;
