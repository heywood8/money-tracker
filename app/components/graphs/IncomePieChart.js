import React from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import PropTypes from 'prop-types';
import DonutChart from './DonutChart';
import CustomLegend from './CustomLegend';

const IncomePieChart = ({
  colors,
  t,
  loadingIncome,
  incomeChartData,
  selectedCurrency,
  onLegendItemPress,
  selectedIncomeCategory,
}) => {
  if (loadingIncome) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={[styles.loadingText, { color: colors.mutedText }]}>
          {t('loading_operations')}
        </Text>
      </View>
    );
  }

  if (incomeChartData.length === 0) {
    return (
      <Text style={[styles.noData, { color: colors.mutedText }]}>
        {t('no_income_data')}
      </Text>
    );
  }

  return (
    <View style={styles.row}>
      <DonutChart data={incomeChartData} />
      <CustomLegend
        data={incomeChartData}
        currency={selectedCurrency}
        colors={colors}
        onItemPress={onLegendItemPress}
        isClickable={selectedIncomeCategory === 'all'}
      />
    </View>
  );
};

IncomePieChart.propTypes = {
  colors: PropTypes.object.isRequired,
  t: PropTypes.func.isRequired,
  loadingIncome: PropTypes.bool.isRequired,
  incomeChartData: PropTypes.array.isRequired,
  selectedCurrency: PropTypes.string.isRequired,
  onLegendItemPress: PropTypes.func.isRequired,
  selectedIncomeCategory: PropTypes.string.isRequired,
};

const styles = StyleSheet.create({
  loadingContainer: {
    alignItems: 'center',
    paddingVertical: 32,
  },
  loadingText: {
    fontSize: 14,
    marginTop: 8,
  },
  noData: {
    fontSize: 14,
    paddingVertical: 32,
    textAlign: 'center',
  },
  row: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: 10,
  },
});

export default IncomePieChart;
