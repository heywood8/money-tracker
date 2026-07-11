import React from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import PropTypes from 'prop-types';
import DonutChart from './DonutChart';
import CustomLegend from './CustomLegend';
import CategoryOperationsList from './CategoryOperationsList';

const ExpensePieChart = ({
  colors,
  t,
  language,
  loading,
  chartData,
  selectedCurrency,
  onLegendItemPress,
  isLeafCategory,
  operations,
  loadingOperations,
}) => {
  // A leaf category has no sub-categories left to break down — show its actual
  // operations for the period instead of a pointless single-slice donut.
  if (isLeafCategory) {
    return (
      <CategoryOperationsList
        operations={operations}
        loading={loadingOperations}
        currency={selectedCurrency}
        colors={colors}
        language={language}
        emptyText={t('no_expense_data')}
      />
    );
  }

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={[styles.loadingText, { color: colors.mutedText }]}>
          {t('loading_operations')}
        </Text>
      </View>
    );
  }

  if (chartData.length === 0) {
    return (
      <Text style={[styles.noData, { color: colors.mutedText }]}>
        {t('no_expense_data')}
      </Text>
    );
  }

  return (
    <View style={styles.row}>
      <DonutChart data={chartData} />
      <View style={styles.legendWrapper}>
        <CustomLegend
          data={chartData}
          currency={selectedCurrency}
          colors={colors}
          onItemPress={onLegendItemPress}
          isClickable
        />
      </View>
    </View>
  );
};

ExpensePieChart.propTypes = {
  colors: PropTypes.object.isRequired,
  t: PropTypes.func.isRequired,
  language: PropTypes.string,
  loading: PropTypes.bool.isRequired,
  chartData: PropTypes.array.isRequired,
  selectedCurrency: PropTypes.string.isRequired,
  onLegendItemPress: PropTypes.func.isRequired,
  isLeafCategory: PropTypes.bool,
  operations: PropTypes.array,
  loadingOperations: PropTypes.bool,
};

ExpensePieChart.defaultProps = {
  language: undefined,
  isLeafCategory: false,
  operations: [],
  loadingOperations: false,
};

const styles = StyleSheet.create({
  legendWrapper: {
    flex: 1,
  },
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

export default ExpensePieChart;
