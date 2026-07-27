import React from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import PropTypes from 'prop-types';
import DonutChart from './DonutChart';
import CustomLegend from './CustomLegend';
import CategoryOperationsList from './CategoryOperationsList';

const IncomePieChart = ({
  colors,
  t,
  language,
  loadingIncome,
  incomeChartData,
  selectedCurrency,
  onLegendItemPress,
  isLeafCategory = false,
  operations = [],
  loadingOperations = false,
  introKey = 0,
  introDelay = 0,
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
        emptyText={t('no_income_data')}
      />
    );
  }

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
      <DonutChart
        data={incomeChartData}
        insetColor={colors.surface}
        introKey={introKey}
        introDelay={introDelay}
      />
      <View style={styles.legendWrapper}>
        <CustomLegend
          data={incomeChartData}
          currency={selectedCurrency}
          colors={colors}
          onItemPress={onLegendItemPress}
          isClickable
        />
      </View>
    </View>
  );
};

IncomePieChart.propTypes = {
  colors: PropTypes.object.isRequired,
  t: PropTypes.func.isRequired,
  language: PropTypes.string,
  loadingIncome: PropTypes.bool.isRequired,
  incomeChartData: PropTypes.array.isRequired,
  selectedCurrency: PropTypes.string.isRequired,
  onLegendItemPress: PropTypes.func.isRequired,
  isLeafCategory: PropTypes.bool,
  operations: PropTypes.array,
  loadingOperations: PropTypes.bool,
  // Bump to replay the donut intro when this chart's tab is opened.
  introKey: PropTypes.number,
  // Holds that replay back until the outgoing chart has faded out.
  introDelay: PropTypes.number,
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
    // Top-aligned, not centred: the legend's height follows the category count,
    // so centring made the donut sit at a different offset on each tab and jump
    // as you switched between them.
    alignItems: 'flex-start',
    flex: 1,
    flexDirection: 'row',
    gap: 10,
  },
});

export default IncomePieChart;
