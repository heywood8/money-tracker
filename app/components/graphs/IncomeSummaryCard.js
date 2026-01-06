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

const IncomeSummaryCard = ({
  colors,
  t,
  loadingIncome,
  totalIncome,
  selectedCurrency,
  incomeChartData,
  onPress,
}) => {
  return (
    <TouchableOpacity
      style={[styles.summaryCard, { backgroundColor: colors.altRow, borderColor: colors.border }]}
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={t('income_by_category')}
    >
      <View style={styles.summaryCardContent}>
        <View style={styles.summaryInfo}>
          <Text style={[styles.summaryLabel, { color: colors.mutedText }]}>
            {t('total_income')}
          </Text>
          <Text style={[styles.summaryAmount, { color: colors.text }]}>
            {loadingIncome ? '...' : formatCurrency(totalIncome, selectedCurrency)}
          </Text>
        </View>
        <View style={styles.miniChartContainer}>
          {loadingIncome ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : incomeChartData.length > 0 ? (
            <PieChart
              data={incomeChartData}
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

IncomeSummaryCard.propTypes = {
  colors: PropTypes.object.isRequired,
  t: PropTypes.func.isRequired,
  loadingIncome: PropTypes.bool.isRequired,
  totalIncome: PropTypes.number.isRequired,
  selectedCurrency: PropTypes.string.isRequired,
  incomeChartData: PropTypes.array.isRequired,
  onPress: PropTypes.func.isRequired,
};

const styles = StyleSheet.create({
  summaryCard: {
    marginBottom: 16,
    padding: 16,
    borderRadius: 8,
    borderWidth: 1,
  },
  summaryCardContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  summaryInfo: {
    flex: 1,
  },
  summaryLabel: {
    fontSize: 14,
    marginBottom: 8,
  },
  summaryAmount: {
    fontSize: 24,
    fontWeight: 'bold',
  },
  miniChartContainer: {
    width: 80,
    height: 80,
    justifyContent: 'center',
    alignItems: 'center',
  },
  noDataPlaceholder: {
    width: 80,
    height: 80,
    justifyContent: 'center',
    alignItems: 'center',
  },
  noDataText: {
    fontSize: 32,
  },
});

export default IncomeSummaryCard;
