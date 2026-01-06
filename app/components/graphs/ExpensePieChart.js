import React from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Dimensions } from 'react-native';
import PropTypes from 'prop-types';
import { PieChart } from 'react-native-chart-kit';
import CustomLegend from './CustomLegend';

const screenWidth = Dimensions.get('window').width;

const ExpensePieChart = ({
  colors,
  t,
  loading,
  chartData,
  selectedCurrency,
  onLegendItemPress,
  selectedCategory,
}) => {
  return (
    <>
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.loadingText, { color: colors.mutedText }]}>
            {t('loading_operations')}
          </Text>
        </View>
      ) : chartData.length > 0 ? (
        <>
          <View style={styles.chartContainer}>
            <PieChart
              data={chartData}
              width={screenWidth - 64}
              height={220}
              chartConfig={{
                color: (opacity = 1) => `rgba(255, 255, 255, ${opacity})`,
              }}
              accessor="amount"
              backgroundColor="transparent"
              paddingLeft="15"
              center={[0, 0]}
              hasLegend={false}
            />
          </View>
          <CustomLegend
            data={chartData}
            currency={selectedCurrency}
            colors={colors}
            onItemPress={onLegendItemPress}
            isClickable={selectedCategory === 'all'}
          />
        </>
      ) : (
        <Text style={[styles.noData, { color: colors.mutedText }]}>
          {t('no_expense_data')}
        </Text>
      )}
    </>
  );
};

ExpensePieChart.propTypes = {
  colors: PropTypes.object.isRequired,
  t: PropTypes.func.isRequired,
  loading: PropTypes.bool.isRequired,
  chartData: PropTypes.array.isRequired,
  selectedCurrency: PropTypes.string.isRequired,
  onLegendItemPress: PropTypes.func.isRequired,
  selectedCategory: PropTypes.string.isRequired,
};

const styles = StyleSheet.create({
  chartContainer: {
    alignItems: 'center',
    marginBottom: 16,
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
});

export default ExpensePieChart;
