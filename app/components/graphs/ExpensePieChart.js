import React from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import PropTypes from 'prop-types';
import DonutChart, { CHART_SIZE } from './DonutChart';
import CustomLegend from './CustomLegend';
import CategoryOperationsList from './CategoryOperationsList';
import EmptyState from '../EmptyState';
import { FONT_SIZE } from '../../styles/designTokens';

const ExpensePieChart = ({
  colors,
  t,
  language,
  loading,
  chartData,
  selectedCurrency,
  onLegendItemPress,
  isLeafCategory = false,
  operations = [],
  loadingOperations = false,
  introKey = 0,
  introDelay = 0,
  categoryChip = null,
  getAccountName = null,
  onOperationPress = null,
}) => {
  // The drill-down chip rides along with whatever this chart is showing: under
  // the donut when there is one, heading the body otherwise. Anywhere it can be
  // reached, so a drilled-in category is never a dead end.
  const chipHeader = categoryChip ? (
    <View style={styles.chipHeader}>{categoryChip}</View>
  ) : null;

  // A leaf category has no sub-categories left to break down — show its actual
  // operations for the period instead of a pointless single-slice donut. The
  // list heads itself with the chip so it can pair it with the category total.
  if (isLeafCategory) {
    return (
      <CategoryOperationsList
        operations={operations}
        loading={loadingOperations}
        currency={selectedCurrency}
        colors={colors}
        language={language}
        emptyText={t('no_expense_data')}
        headerChip={categoryChip}
        t={t}
        getAccountName={getAccountName}
        onOperationPress={onOperationPress}
      />
    );
  }

  if (loading) {
    return (
      <View>
        {chipHeader}
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.loadingText, { color: colors.mutedText }]}>
            {t('loading_operations')}
          </Text>
        </View>
      </View>
    );
  }

  if (chartData.length === 0) {
    return (
      <View>
        {chipHeader}
        <EmptyState message={t('no_expense_data')} fill={false} />
      </View>
    );
  }

  return (
    <View style={styles.row}>
      <View style={styles.donutColumn}>
        <DonutChart
          data={chartData}
          insetColor={colors.surface}
          introKey={introKey}
          introDelay={introDelay}
        />
        {categoryChip ? (
          <View style={styles.donutChip}>{categoryChip}</View>
        ) : null}
      </View>
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
  // Bump to replay the donut intro when this chart's tab is opened.
  introKey: PropTypes.number,
  // Holds that replay back until the outgoing chart has faded out.
  introDelay: PropTypes.number,
  // Drill-down chip owned by the screen; placed under the donut by this chart.
  categoryChip: PropTypes.node,
  // Resolves an account id to its name for the leaf operations list.
  getAccountName: PropTypes.func,
  // Opens a listed operation for editing; without it the list is read-only.
  onOperationPress: PropTypes.func,
};

const styles = StyleSheet.create({
  chipHeader: {
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  donutChip: {
    marginTop: 10,
    maxWidth: '100%',
  },
  donutColumn: {
    alignItems: 'center',
    width: CHART_SIZE,
  },
  legendWrapper: {
    flex: 1,
  },
  loadingContainer: {
    alignItems: 'center',
    paddingVertical: 32,
  },
  loadingText: {
    fontSize: FONT_SIZE.md,
    marginTop: 8,
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

export default ExpensePieChart;
